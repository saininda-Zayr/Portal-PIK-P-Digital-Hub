import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ALL_OPD, SPK_DRIVE_FOLDER_ID, SPK_DRIVE_ROOT_URL, formatSpkFileName } from '../data/pppkData';

const SETTINGS_DOC_PATH = 'system_settings';
const SPK_CONFIG_DOC_ID = 'spk_drive_config';
const LOCAL_STORAGE_KEY = 'spk_apps_script_url';

export interface SpkDriveConfig {
  webAppUrl: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface UploadSpkDriveResult {
  success: boolean;
  fileId?: string;
  fileUrl?: string;
  downloadUrl?: string;
  folderUrl?: string;
  fileName?: string;
  error?: string;
}

/**
 * Get the configured Google Apps Script Web App URL.
 * Checks Firestore first, then falls back to localStorage or environment variable.
 */
export async function getSpkAppsScriptUrl(): Promise<string> {
  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SPK_CONFIG_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as SpkDriveConfig;
      if (data.webAppUrl && data.webAppUrl.trim()) {
        const url = data.webAppUrl.trim();
        localStorage.setItem(LOCAL_STORAGE_KEY, url);
        return url;
      }
    }
  } catch (err) {
    console.warn('Could not read SPK drive config from Firestore, checking localStorage:', err);
  }

  // Fallback to localStorage
  const localUrl = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (localUrl && localUrl.trim()) {
    return localUrl.trim();
  }

  // Fallback to Vite env if present
  const envUrl = (import.meta as any).env?.VITE_SPK_APPS_SCRIPT_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim();
  }

  return '';
}

/**
 * Save the Google Apps Script Web App URL to Firestore and localStorage.
 */
export async function saveSpkAppsScriptUrl(url: string, userEmail?: string): Promise<void> {
  const cleanUrl = url.trim();
  localStorage.setItem(LOCAL_STORAGE_KEY, cleanUrl);

  try {
    const docRef = doc(db, SETTINGS_DOC_PATH, SPK_CONFIG_DOC_ID);
    await setDoc(docRef, {
      webAppUrl: cleanUrl,
      updatedAt: new Date().toISOString(),
      updatedBy: userEmail || 'admin'
    }, { merge: true });
  } catch (err) {
    console.error('Failed to save SPK drive config to Firestore:', err);
    throw err;
  }
}

/**
 * Test if the Google Apps Script Web App URL responds to a GET health-check.
 */
export async function testSpkAppsScriptUrl(url: string): Promise<{ success: boolean; message: string }> {
  try {
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('https://script.google.com/macros/s/')) {
      return {
        success: false,
        message: 'Format URL tidak valid! URL harus diawali dengan https://script.google.com/macros/s/...'
      };
    }

    const res = await fetch(cleanUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const rawText = await res.text().catch(() => '');

    if (rawText.includes('ServiceLogin') || rawText.includes('accounts.google.com')) {
      return {
        success: false,
        message: 'Akses Ditolak: Web App meminta login Google. Pastikan saat deploy di Apps Script, opsi "Who has access" (Siapa yang memiliki akses) disetel ke "Anyone" (Siapa saja).'
      };
    }

    if (!res.ok) {
      return {
        success: false,
        message: `Server merespon dengan status HTTP ${res.status}. Pastikan akses Web App disetel ke "Siapa saja" (Anyone).`
      };
    }

    try {
      const data = JSON.parse(rawText);
      if (data && (data.status === 'ok' || data.rootFolderId)) {
        return {
          success: true,
          message: 'Koneksi ke Google Apps Script berhasil dan aktif!'
        };
      }
    } catch {
      // not json but 200 ok
    }

    return {
      success: true,
      message: 'Koneksi berhasil (Web App aktif).'
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Gagal menghubungi Web App: ' + (err.message || 'CORS / Jaringan bermasalah. Pastikan deploy sebagai Web App dengan izin "Siapa saja".')
    };
  }
}

/**
 * Convert a File object to pure Base64 string (without data: URL prefix)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:application/pdf;base64, prefix
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a lightweight probe request to Google Apps Script to test latency and concurrency response
 */
export async function sendProbePing(webAppUrl: string): Promise<{ latencyMs: number; ok: boolean; status: number; error?: string }> {
  const start = performance.now();
  try {
    const res = await fetch(webAppUrl.trim(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    const latencyMs = Math.round(performance.now() - start);
    return {
      latencyMs,
      ok: res.ok,
      status: res.status
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      latencyMs,
      ok: false,
      status: 0,
      error: err.message || 'Network error'
    };
  }
}

/**
 * Upload SPK PDF file directly to Google Drive via Google Apps Script Web App.
 * Includes intelligent Exponential Backoff with Jitter for high-concurrency protection (up to 3 retries).
 * Strict naming rule: SPK_[NIP]_[Nama].pdf
 */
export async function uploadSpkToGoogleDriveWebapp(params: {
  webAppUrl: string;
  nip: string;
  nama: string;
  opd: string;
  unitKerja: string;
  file: File;
  onRetryAttempt?: (attempt: number, maxAttempts: number, delayMs: number, reason: string) => void;
}): Promise<UploadSpkDriveResult> {
  const { webAppUrl, nip, nama, opd, unitKerja, file, onRetryAttempt } = params;

  if (!webAppUrl || !webAppUrl.trim()) {
    throw new Error('URL Google Apps Script Web App belum dikonfigurasi oleh Administrator.');
  }

  // Generate standardized file name: SPK_[NIP]_[Nama].pdf
  const standardizedFileName = formatSpkFileName(nip, nama);

  // Convert PDF to base64
  const fileBase64 = await fileToBase64(file);

  const payload = {
    nip,
    nama,
    opd,
    unitKerja,
    fileName: standardizedFileName,
    originalFileName: file.name,
    mimeType: file.type || 'application/pdf',
    fileBase64
  };

  const payloadString = JSON.stringify(payload);
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Use text/plain to avoid CORS preflight options request on Google Apps Script
      const response = await fetch(webAppUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: payloadString
      });

      const rawText = await response.text().catch(() => '');

      // Check if Google redirected to a login page instead of running Web App
      if (rawText.includes('ServiceLogin') || rawText.includes('accounts.google.com')) {
        throw new Error('Google Apps Script meminta otentikasi login Google. Pastikan saat Deploy Web App di Google Apps Script, pengaturan "Who has access" (Siapa yang memiliki akses) disetel ke "Anyone" (Siapa saja).');
      }

      // Check rate limit or server busy (429, 500, 502, 503)
      if (!response.ok) {
        const isServerBusy = [429, 500, 502, 503, 504].includes(response.status);
        const errMsg = `Google Drive Web App Error (${response.status}): ${rawText.slice(0, 150) || 'Layanan sedang sibuk'}`;
        
        if (isServerBusy && attempt < maxAttempts) {
          // Exponential backoff with random jitter: (1.5s * 2^(attempt-1)) + random 200-800ms
          const baseDelay = 1500 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 600) + 200;
          const delayMs = baseDelay + jitter;

          if (onRetryAttempt) {
            onRetryAttempt(attempt, maxAttempts, delayMs, `Server sibuk (${response.status}). Mengantre ulang...`);
          }
          await sleep(delayMs);
          continue;
        }

        throw new Error(errMsg);
      }

      let result: any;
      try {
        result = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error(`Respon dari Google Apps Script bukan format JSON yang valid. Respon: ${rawText.slice(0, 150)}`);
      }

      if (!result || !result.success) {
        // If error message indicates rate limit or concurrent user lock
        const errMsg = result?.error || 'Gagal menyimpan berkas ke folder Google Drive.';
        const isLockError = errMsg.toLowerCase().includes('lock') || 
                            errMsg.toLowerCase().includes('quota') || 
                            errMsg.toLowerCase().includes('concurrent') ||
                            errMsg.toLowerCase().includes('busy');

        if (isLockError && attempt < maxAttempts) {
          const delayMs = 2000 * attempt + Math.floor(Math.random() * 1000);
          if (onRetryAttempt) {
            onRetryAttempt(attempt, maxAttempts, delayMs, 'Antrean akses Google Drive penuh. Mencoba kembali secara otomatis...');
          }
          await sleep(delayMs);
          continue;
        }

        throw new Error(errMsg);
      }

      return {
        success: true,
        fileId: result.fileId,
        fileUrl: result.fileUrl,
        downloadUrl: result.downloadUrl,
        folderUrl: result.folderUrl,
        fileName: result.fileName || standardizedFileName
      };
    } catch (networkErr: any) {
      lastError = networkErr;
      const isNetworkOrAbort = networkErr.name === 'TypeError' || 
                               networkErr.message?.includes('fetch') || 
                               networkErr.message?.includes('Failed to fetch') ||
                               networkErr.message?.includes('Network');

      if (isNetworkOrAbort && attempt < maxAttempts) {
        const delayMs = 1800 * attempt + Math.floor(Math.random() * 500);
        if (onRetryAttempt) {
          onRetryAttempt(attempt, maxAttempts, delayMs, 'Jaringan tidak stabil atau antrean sibuk. Mengulang transmisi berkas...');
        }
        await sleep(delayMs);
        continue;
      }

      if (attempt >= maxAttempts) {
        throw new Error(`Gagal mengunggah ke Google Drive setelah ${maxAttempts} kali percobaan: ${networkErr.message || 'Jaringan bermasalah'}`);
      }
    }
  }

  throw lastError || new Error('Gagal mengunggah berkas ke Google Drive setelah beberapa kali percobaan.');
}

/**
 * In-app bulk folder creator using the Admin's Google Drive OAuth token.
 * Creates all 45 OPD folders and all sub-unit kerja folders directly in Drive folder 1feUjhSZy5yIe_KKBJ_DOJi3z39ROWr1e.
 */
export async function createAllFoldersInDriveWithOAuth(
  accessToken: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ success: boolean; createdOpdCount: number; createdUnitCount: number }> {
  const rootId = SPK_DRIVE_FOLDER_ID;
  let opdCount = 0;
  let unitCount = 0;
  const totalOpd = ALL_OPD.length;

  // Helper search or create folder using Google Drive v3 REST API
  const getOrCreate = async (name: string, parentId: string): Promise<string> => {
    const query = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
      }
    }

    // Create folder
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(`Gagal membuat folder "${name}": ${err.error?.message || createRes.statusText}`);
    }

    const createData = await createRes.json();
    return createData.id;
  };

  for (let i = 0; i < totalOpd; i++) {
    const opdItem = ALL_OPD[i];
    const opdName = opdItem.opd.trim();
    
    if (onProgress) {
      onProgress(i + 1, totalOpd, `Membuat folder OPD: ${opdName}`);
    }

    // Create or find OPD folder
    const opdFolderId = await getOrCreate(opdName, rootId);
    opdCount++;

    // Create subfolders for unit kerja
    const units = opdItem.unitKerjaList || [opdName];
    for (const unitName of units) {
      const trimmedUnit = unitName.trim();
      await getOrCreate(trimmedUnit, opdFolderId);
      unitCount++;
    }
  }

  return {
    success: true,
    createdOpdCount: opdCount,
    createdUnitCount: unitCount
  };
}
