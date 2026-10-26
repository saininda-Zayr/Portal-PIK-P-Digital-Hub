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
 * Upload SPK PDF file directly to Google Drive via Google Apps Script Web App.
 * Strict naming rule: SPK_[NIP]_[Nama].pdf
 */
export async function uploadSpkToGoogleDriveWebapp(params: {
  webAppUrl: string;
  nip: string;
  nama: string;
  opd: string;
  unitKerja: string;
  file: File;
}): Promise<UploadSpkDriveResult> {
  const { webAppUrl, nip, nama, opd, unitKerja, file } = params;

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

  let response: Response;
  try {
    // We use text/plain to avoid CORS preflight issues with Google Apps Script
    response = await fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });
  } catch (networkErr: any) {
    throw new Error(`Gagal menghubungi server Google Drive Apps Script: ${networkErr.message || 'Jaringan / CORS bermasalah'}. Pastikan URL Web App aktif.`);
  }

  const rawText = await response.text().catch(() => '');

  // Check if Google redirected to a login page instead of running Web App
  if (rawText.includes('ServiceLogin') || rawText.includes('accounts.google.com')) {
    throw new Error('Google Apps Script meminta otentikasi login Google. Pastikan saat Deploy Web App di Google Apps Script, pengaturan "Who has access" (Siapa yang memiliki akses) disetel ke "Anyone" (Siapa saja).');
  }

  if (!response.ok) {
    throw new Error(`Google Drive Web App Error (${response.status}): ${rawText.slice(0, 200) || 'Gagal menyimpan ke Google Drive'}`);
  }

  let result: any;
  try {
    result = JSON.parse(rawText);
  } catch (parseErr) {
    throw new Error(`Respon dari Google Apps Script bukan format JSON yang valid. Respon: ${rawText.slice(0, 150)}`);
  }

  if (!result || !result.success) {
    throw new Error(result?.error || 'Gagal menyimpan berkas ke folder Google Drive.');
  }

  return {
    success: true,
    fileId: result.fileId,
    fileUrl: result.fileUrl,
    downloadUrl: result.downloadUrl,
    folderUrl: result.folderUrl,
    fileName: result.fileName || standardizedFileName
  };
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
