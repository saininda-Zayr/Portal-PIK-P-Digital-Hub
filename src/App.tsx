/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component, useRef, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Database, 
  FileText, 
  Calendar, 
  Users, 
  Info, 
  ChevronRight,
  ArrowLeft,
  Menu,
  X,
  Bell,
  Search,
  PlusCircle,
  Plus,
  Trash2,
  Edit2,
  BarChart3,
  ShieldCheck,
  Zap,
  Heart,
  Handshake,
  Lightbulb,
  CheckCircle2,
  LogOut,
  LogIn,
  Upload,
  Mail,
  Phone,
  Clock,
  Filter,
  Youtube,
  PlayCircle,
  ArrowRightCircle,
  Smartphone,
  AlertTriangle,
  ExternalLink,
  HardDrive,
  RefreshCw,
  FolderOpen,
  FolderPlus,
  Settings,
  SlidersHorizontal,
  RotateCcw,
  Eye,
  Download,
  Maximize2,
  Minimize2,
  FileCheck
} from 'lucide-react';
import { SPKUploadModal } from './components/SPKUploadModal';
import { SPKMonitoringView } from './components/SPKMonitoringView';
import { UserManagementView, UserRole, ROLE_DETAILS } from './components/UserManagementView';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { db, auth, storage } from './firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  setDoc, 
  getDocs,
  getDoc,
  getDocFromServer,
  addDoc,
  deleteDoc,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  setPersistence,
  browserSessionPersistence,
  User
} from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Terjadi kesalahan yang tidak terduga.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || '{}');
        if (parsed.error && parsed.error.includes('Missing or insufficient permissions')) {
          displayMessage = "Izin ditolak. Anda mungkin tidak memiliki akses ke data ini.";
        }
      } catch (e) {
        // Not JSON
      }

      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl border border-black/10 shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <X className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black mb-2">Waduh, Ada Masalah!</h2>
            <p className="text-zinc-500 mb-6">{displayMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-black text-white rounded-xl font-bold hover:bg-zinc-800 transition-colors"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const monthNameFallback = (name: string) => {
  if (!name) return '';
  // Check for exact match first
  const exact = MONTHS.find(m => m.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  // Check if name contains any month (e.g. "Maret 2026")
  const partial = MONTHS.find(m => name.toLowerCase().includes(m.toLowerCase()));
  return partial || '';
};

/**
 * Helper to fetch all files recursively from a Google Drive folder
 */
const fetchAllFilesRecursively = async (rootFolderId: string, accessToken: string) => {
  console.log('Starting recursive fetch for folder:', rootFolderId);
  let allFiles: any[] = [];
  // Use objects to track metadata during traversal
  let foldersToProcess = [{ id: rootFolderId, name: 'root', activity: null as string | null, year: null as string | null }];
  let processedFolders = new Set<string>();

  try {
    while (foldersToProcess.length > 0) {
      const currentFolder = foldersToProcess.shift();
      if (!currentFolder || processedFolders.has(currentFolder.id)) continue;
      processedFolders.add(currentFolder.id);

      let pageToken: string | null = null;

      do {
        const query = encodeURIComponent(`'${currentFolder.id}' in parents and trashed = false`);
        const fields = encodeURIComponent('nextPageToken, files(id, name, size, webViewLink, createdTime, mimeType)');
        let url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Drive API Error (${response.status}):`, errorText);
          if (response.status === 401) {
            throw new Error('SESI_DRIVE_BERAKHIR: Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan hubungkan ulang akun Google Drive Anda.');
          }
          break; 
        }

        const data = await response.json();
        const items = data.files || [];

        for (const item of items) {
          if (item.mimeType === 'application/vnd.google-apps.folder') {
            // Logic to determine if this is activity or year folder
            let nextActivity = currentFolder.activity;
            let nextYear = currentFolder.year;
            
            if (currentFolder.id === rootFolderId) {
              nextActivity = item.name; // This is a level 1 folder (Activity)
            } else if (currentFolder.activity && !currentFolder.year) {
              nextYear = item.name; // This is a level 2 folder (Year)
            }

            foldersToProcess.push({ 
              id: item.id, 
              name: item.name, 
              activity: nextActivity,
              year: nextYear
            });
          } else {
            // Attach folder information to the file
            allFiles.push({
              ...item,
              activity: currentFolder.activity,
              year: currentFolder.year,
              parentFolderId: currentFolder.id === rootFolderId ? null : currentFolder.id,
              parentFolderName: currentFolder.id === rootFolderId ? null : currentFolder.name
            });
          }
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
    }
    return allFiles;
  } catch (error: any) {
    console.error('Error in fetchAllFilesRecursively:', error);
    throw error;
  }
};

/**
 * Drive storage quota interface and fetcher
 */
export interface DriveQuotaDetails {
  userEmail?: string;
  userName?: string;
  limit: number;
  usage: number; // Total across Google Account (Drive + Gmail + Photos)
  usageInDrive: number; // Only Drive
  usageInDriveTrash: number; // Trash
  isExceeded: boolean;
  percentUsed: number;
  limitFormatted: string;
  usageFormatted: string;
  usageInDriveFormatted: string;
  trashFormatted: string;
  freeSpaceFormatted: string;
}

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const fetchDriveStorageQuota = async (accessToken: string): Promise<DriveQuotaDetails | null> => {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.status === 401) {
      throw new Error('TOKEN_EXPIRED_401');
    }
    if (!res.ok) return null;
    const data = await res.json();
    const quota = data.storageQuota;
    const user = data.user;
    if (!quota) return null;
    const limit = parseInt(quota.limit, 10) || 0;
    const usage = parseInt(quota.usage, 10) || 0;
    const usageInDrive = parseInt(quota.usageInDrive, 10) || 0;
    const usageInDriveTrash = parseInt(quota.usageInDriveTrash, 10) || 0;
    const isExceeded = limit > 0 ? usage >= limit : false;
    const percentUsed = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0;
    const freeSpace = limit > usage ? limit - usage : 0;
    return {
      userEmail: user?.emailAddress || '',
      userName: user?.displayName || '',
      limit,
      usage,
      usageInDrive,
      usageInDriveTrash,
      isExceeded,
      percentUsed,
      limitFormatted: limit > 0 ? formatBytes(limit) : 'Tidak terbatas',
      usageFormatted: formatBytes(usage),
      usageInDriveFormatted: formatBytes(usageInDrive),
      trashFormatted: formatBytes(usageInDriveTrash),
      freeSpaceFormatted: limit > 0 ? formatBytes(freeSpace) : 'Tidak terbatas'
    };
  } catch (err: any) {
    if (err?.message === 'TOKEN_EXPIRED_401') {
      throw err;
    }
    console.warn('Could not fetch Drive storage quota:', err);
    return null;
  }
};

/**
 * Helper to find or create a folder in Google Drive
 */
const getOrCreateFolder = async (folderName: string, parentId: string, accessToken: string) => {
  console.log(`Searching or creating folder: ${folderName} in parent: ${parentId}`);
  // Search for existing folder
  const query = encodeURIComponent(`name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('SESI_DRIVE_BERAKHIR: Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan hubungkan ulang akun Google Drive Anda.');
    }
    const errText = await response.text();
    throw new Error(`Gagal mencari folder "${folderName}" (HTTP ${response.status}): ${errText}`);
  }
  
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    console.log(`Folder found: ${folderName} (${data.files[0].id})`);
    return data.files[0].id;
  }
  
  console.log(`Folder not found, creating: ${folderName} inside ${parentId}`);
  // Create new folder if not found
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  });
  
  if (!createResponse.ok) {
    if (createResponse.status === 401) {
      throw new Error('SESI_DRIVE_BERAKHIR: Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan hubungkan ulang akun Google Drive Anda.');
    }
    const errData = await createResponse.json().catch(() => ({}));
    const errMsg = errData.error?.message || 'Unknown error';
    const reason = errData.error?.errors?.[0]?.reason || '';
    if (
      reason === 'storageQuotaExceeded' || 
      errMsg.toLowerCase().includes('storage quota') || 
      errMsg.toLowerCase().includes('quota has been exceeded')
    ) {
      throw new Error('KUOTA_DRIVE_PENUH: Google menolak pembuatan folder karena kapasitas penyimpanan Google Drive telah habis (Storage Quota Exceeded).');
    }
    throw new Error(`Google Drive Error (HTTP ${createResponse.status}): ${errMsg}. Pastikan folder induk dengan ID ${parentId} masih ada dan akun Anda memiliki akses Editor.`);
  }
  
  const createData = await createResponse.json();
  console.log(`Folder created: ${folderName} (${createData.id})`);
  return createData.id;
};

/**
 * Helper to fetch all folder IDs recursively from a Google Drive folder
 */
const fetchAllFolderIdsRecursively = async (rootFolderId: string, accessToken: string) => {
  let allFolderIds: string[] = [rootFolderId];
  let foldersToProcess = [rootFolderId];
  let processedFolders = new Set<string>();

  try {
    while (foldersToProcess.length > 0) {
      const currentFolderId = foldersToProcess.shift();
      if (!currentFolderId || processedFolders.has(currentFolderId)) continue;
      processedFolders.add(currentFolderId);

      let pageToken: string | null = null;
      do {
        const query = encodeURIComponent(`'${currentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const fields = encodeURIComponent('nextPageToken, files(id)');
        let url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('SESI_DRIVE_BERAKHIR: Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan hubungkan ulang akun Google Drive Anda.');
          }
          break;
        }

        const data = await response.json();
        const items = data.files || [];

        for (const item of items) {
          allFolderIds.push(item.id);
          foldersToProcess.push(item.id);
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
    }
    return allFolderIds;
  } catch (error) {
    console.error('Error in fetchAllFolderIdsRecursively:', error);
    return allFolderIds;
  }
};

// --- Components ---

const PublicRequestForm = ({ onClose }: { onClose: () => void }) => {
  const [formData, setFormData] = useState({
    requesterName: '',
    unit: '',
    contact: '',
    dataType: 'Pengadaan Pegawai',
    dataDescription: '',
    reason: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'requests'), {
        ...formData,
        status: 'pending',
        createdAt: new Date().toISOString(),
        isPublic: true
      });
      setSuccess(true);
      setFormData({ requesterName: '', unit: '', contact: '', dataType: 'Pengadaan Pegawai', dataDescription: '', reason: '' });
    } catch (error) {
      console.error("Error submitting request:", error);
      alert("Gagal mengirim permintaan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-4xl bg-white text-black p-8 rounded-[3rem] shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto"
    >
      <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-zinc-100 rounded-full transition-all">
        <X size={24} />
      </button>

      <div className="text-center mb-8">
        <img 
          src="/cloudp_logo.jpg" 
          alt="Cloud-P Logo" 
          className="w-16 h-16 rounded-2xl object-cover mx-auto mb-4 shadow-lg border border-black/5" 
          referrerPolicy="no-referrer"
        />
        <h2 className="text-3xl font-black tracking-tight">Layanan Permintaan Data</h2>
        <p className="text-zinc-500 font-medium">Silakan lengkapi formulir untuk mengajukan permintaan data ke Bidang Cloud-P.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {success ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col items-center justify-center text-center p-12 bg-emerald-50 rounded-[2.5rem] border border-emerald-100"
            >
              <div className="w-20 h-20 bg-emerald-500 text-white rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 size={48} />
              </div>
              <h3 className="text-2xl font-black text-emerald-900 mb-2">Permintaan Terkirim!</h3>
              <p className="text-emerald-700 font-medium mb-8">
                Terima kasih. Permintaan data Anda telah kami terima dan akan segera diproses oleh tim Cloud-P.
              </p>
              <button 
                onClick={onClose}
                className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
              >
                KEMBALI KE BERANDA
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Nama Lengkap</label>
                  <input 
                    type="text" 
                    required
                    value={formData.requesterName}
                    onChange={e => setFormData({...formData, requesterName: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400" 
                    placeholder="Nama Anda" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Instansi / Unit Kerja</label>
                  <input 
                    type="text" 
                    required
                    value={formData.unit}
                    onChange={e => setFormData({...formData, unit: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400" 
                    placeholder="Contoh: Universitas Polman" 
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Kontak (Email / WhatsApp)</label>
                <input 
                  type="text" 
                  required
                  value={formData.contact}
                  onChange={e => setFormData({...formData, contact: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400" 
                  placeholder="Email atau nomor WhatsApp aktif" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Jenis Data</label>
                <select 
                  value={formData.dataType}
                  onChange={e => setFormData({...formData, dataType: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400"
                >
                  <option>Pengadaan Pegawai</option>
                  <option>Informasi Kepegawaiaan</option>
                  <option>Kinerja Pegawai</option>
                  <option>Arsip Digital</option>
                  <option>Lainnya</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Deskripsi Data yang Diminta</label>
                <textarea 
                  required
                  value={formData.dataDescription}
                  onChange={e => setFormData({...formData, dataDescription: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400 h-24" 
                  placeholder="Rincian data yang Anda butuhkan secara spesifik..."
                ></textarea>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Alasan Permintaan</label>
                <textarea 
                  required
                  value={formData.reason}
                  onChange={e => setFormData({...formData, reason: e.target.value})}
                  className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400 h-24" 
                  placeholder="Jelaskan keperluan penggunaan data..."
                ></textarea>
              </div>
              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl shadow-lg hover:bg-yellow-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : 'KIRIM PERMINTAAN'}
              </button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-zinc-900 text-yellow-400 p-8 rounded-3xl">
            <h3 className="font-bold text-xl mb-4">Layanan Aktif</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Sistem kami siap menerima permintaan data Anda. Seluruh proses dilakukan secara digital untuk efisiensi.
            </p>
            <div className="mt-6 flex items-center gap-3 text-xs font-bold uppercase tracking-widest">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Sistem Online
            </div>
          </div>
          <div className="bg-yellow-50 p-6 rounded-3xl border border-yellow-100">
            <h4 className="text-xs font-black uppercase tracking-widest text-yellow-800 mb-2">SOP Layanan</h4>
            <p className="text-[10px] text-yellow-700 leading-relaxed font-medium">
              Permintaan akan diproses maksimal 1x24 jam. Pastikan kontak yang Anda masukkan benar untuk pengiriman data.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const LoginPage = ({ onLoginSuccess }: { onLoginSuccess: (token: string) => void }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPublicForm, setShowPublicForm] = useState(false);
  const [showSpkModal, setShowSpkModal] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) onLoginSuccess(token);
    } catch (err: any) {
      setError('Gagal masuk dengan Google. Silakan coba lagi.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-yellow-400 flex items-center justify-center p-4 font-sans overflow-hidden">
      <AnimatePresence mode="wait">
        {!showPublicForm ? (
          <motion.div 
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg bg-black text-white p-8 sm:p-10 rounded-[3rem] shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            
            <div className="text-center mb-8 relative z-10">
              <img 
                src="/cloudp_logo.jpg" 
                alt="Cloud-P Logo" 
                className="w-20 h-20 rounded-3xl object-cover mx-auto mb-5 shadow-xl border border-white/10" 
                referrerPolicy="no-referrer"
              />
              <h1 className="text-3xl font-black tracking-tight mb-2">CLOUD-P</h1>
              <p className="text-zinc-500 text-sm font-medium uppercase tracking-widest">BKPSDM Polewali Mandar</p>
            </div>

            <div className="space-y-5 relative z-10">
              {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-bold rounded-2xl text-center">
                  {error}
                </div>
              )}

              {/* FITUR UNGGAH SPK PPPK PARUH WAKTU */}
              <div className="p-4 rounded-3xl bg-zinc-900/90 border border-yellow-400/30 space-y-3 relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-400/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-yellow-400 bg-yellow-400/10 px-2.5 py-1 rounded-full border border-yellow-400/20">
                    Khusus Pegawai PPPK
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Format PDF &bull; &lt; 1 MB</span>
                </div>
                
                <button 
                  onClick={() => setShowSpkModal(true)}
                  className="w-full py-4 bg-gradient-to-r from-yellow-400 to-amber-400 hover:from-yellow-300 hover:to-amber-300 text-black font-black rounded-2xl shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 text-xs sm:text-sm tracking-wide"
                >
                  <FileText size={19} className="shrink-0" />
                  <span>UNGGAH SPK PPPK PARUH WAKTU</span>
                </button>

                <p className="text-center text-yellow-300/95 text-[11px] font-semibold leading-relaxed px-1">
                  sebelum mengunggah berkas pastikan SPK telah bermaterai dan di tanda tangan
                </p>
              </div>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-black px-3 text-zinc-500 font-black tracking-widest">Akses Staf / Layanan Data</span>
                </div>
              </div>

              {/* Tombol Masuk Internal */}
              <button 
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-3.5 bg-white text-black font-black rounded-2xl shadow-lg hover:bg-zinc-100 transition-all transform active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 text-xs sm:text-sm"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn size={18} />
                    MASUK DENGAN GOOGLE (STAF)
                  </>
                )}
              </button>

              {/* Tombol Permintaan Data Publik */}
              <button 
                onClick={() => setShowPublicForm(true)}
                className="w-full py-3 bg-zinc-900/80 text-zinc-300 hover:text-white font-bold rounded-2xl border border-zinc-800 hover:bg-zinc-800 transition-all flex items-center justify-center gap-2.5 text-xs"
              >
                <FileText size={16} className="text-zinc-400" />
                AJUKAN PERMINTAAN DATA
              </button>

              <p className="text-center text-zinc-600 text-[10px] leading-relaxed uppercase font-bold tracking-widest pt-1">
                Portal Resmi BKPSDM Kabupaten Polewali Mandar
              </p>
            </div>

            {/* Modal Unggah SPK */}
            <SPKUploadModal isOpen={showSpkModal} onClose={() => setShowSpkModal(false)} />
          </motion.div>
        ) : (
          <PublicRequestForm key="form" onClose={() => setShowPublicForm(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

const Sidebar = ({ activeTab, setActiveTab, isOpen, setIsOpen, isAdmin, isSuperAdmin, userRole }: any) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'datacenter', label: 'Pusat Data', icon: Database },
    { id: 'arsipdigital', label: 'Arsip Digital', icon: ShieldCheck },
    { id: 'workhub', label: 'Work Hub', icon: Calendar },
    { id: 'infografis', label: 'Alur Kerja', icon: Info },
    { id: 'panduancepat', label: 'Panduan Cepat', icon: Smartphone },
    { id: 'tutorials', label: 'Tutorial', icon: PlayCircle },
    { id: 'berakhlak', label: 'ASN BerAKHLAK', icon: Heart },
  ];

  // Admin Bidang & Super Admin can access SPK PPPK and Requests
  if (isAdmin || isSuperAdmin) {
    menuItems.push({ id: 'spkpppk', label: 'Berkas SPK PPPK', icon: FileCheck });
    menuItems.push({ id: 'requests', label: 'Permintaan Data', icon: Bell });
  }

  // ONLY Super Admin can access Manajemen User
  if (isSuperAdmin) {
    menuItems.push({ id: 'usermanagement', label: 'Manajemen User', icon: Users });
  }

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ 
          x: isOpen ? 0 : (window.innerWidth < 1024 ? -300 : 0),
          width: isOpen ? 256 : (window.innerWidth < 1024 ? 256 : 80)
        }}
        className={cn(
          "fixed top-0 left-0 h-full bg-yellow-400 text-black z-50 shadow-2xl transition-all duration-300 overflow-hidden flex flex-col",
          !isOpen && "lg:items-center"
        )}
      >
        <div className={cn(
          "p-6 flex items-center border-b border-yellow-500/30 w-full",
          isOpen ? "justify-between" : "justify-center"
        )}>
          {isOpen && (
            <div className="flex items-center gap-3 overflow-hidden transition-all duration-300">
              <img 
                src="/cloudp_logo.jpg" 
                alt="Cloud-P Logo" 
                className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-md border border-black/10" 
                referrerPolicy="no-referrer"
              />
              <span className="font-bold text-lg whitespace-nowrap">Cloud-P</span>
            </div>
          )}
          <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-yellow-500 rounded-lg transition-colors shrink-0">
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto sidebar-scrollbar pr-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (window.innerWidth < 1024) setIsOpen(false);
              }}
              className={cn(
                "w-full flex items-center rounded-xl transition-all group",
                isOpen ? "gap-4 p-3" : "justify-center p-3",
                activeTab === item.id 
                  ? "bg-black text-yellow-400 shadow-lg" 
                  : "hover:bg-yellow-500 text-black/80"
              )}
              title={!isOpen ? item.label : ""}
            >
              <item.icon size={22} className={cn(activeTab === item.id ? "scale-110" : "group-hover:scale-110")} />
              {isOpen && (
                <span className="font-medium whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className={cn("p-6 mt-auto", !isOpen && "lg:hidden")}>
          <div className="bg-black/[0.03] p-4 rounded-[2rem] border border-black/5 flex items-center gap-3 transition-all hover:bg-black/[0.06] group/profile">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center p-1 shrink-0 overflow-hidden relative border border-black/5">
              <img 
                src="/Lambang_Kabupaten_Polewali_Mandar.png" 
                alt="Logo Polman" 
                className="w-full h-full object-contain relative z-10 brightness-[0.95] contrast-[1.05]"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center text-black/5">
                <Database size={14} />
              </div>
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 truncate leading-none mb-1">BKPSDM Polman</p>
              <p className="text-xs font-black truncate text-black/80">Bidang PIK-P</p>
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
};

const Dashboard = ({ user }: { user: any }) => {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestCount, setRequestCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [archiveCount, setArchiveCount] = useState(0);
  const [efficiency, setEfficiency] = useState('0%');
  const [chartData, setChartData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);

  const isAdmin = user?.email === 'saininda@gmail.com';

  useEffect(() => {
    if (!user) return;

    // Listen to static stats
    const qStats = query(collection(db, 'stats'), orderBy('order', 'asc'));
    const unsubscribeStats = onSnapshot(qStats, (snapshot) => {
      setStats(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.warn("Stats listener error:", error.message);
    });

    // Listen to real requests
    const unsubscribeRequests = onSnapshot(collection(db, 'requests'), (snapshot) => {
      const requests = snapshot.docs.map(doc => doc.data());
      setRequestCount(snapshot.size);
      
      // Calculate chart data (last 6 months)
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const monthlyData = months.map(month => ({
        name: month,
        data: 0, // Will be filled by documents
        requests: requests.filter(r => {
          if (!r.createdAt) return false;
          const date = new Date(r.createdAt);
          return date.toLocaleString('default', { month: 'short' }) === month;
        }).length
      }));
      setChartData(prev => monthlyData.map((m, i) => ({ ...m, data: prev[i]?.data || 0 })));
    }, (error) => {
      console.warn("Requests listener error:", error.message);
    });

    // Listen to real documents
    const unsubscribeDocs = onSnapshot(collection(db, 'documents'), (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data());
      setDocCount(snapshot.size);

      // Update chart data with document counts
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      setChartData(prev => months.map((month, i) => ({
        ...prev[i],
        name: month,
        data: docs.filter(d => {
          if (!d.createdAt) return false;
          const date = new Date(d.createdAt);
          return date.toLocaleString('default', { month: 'short' }) === month;
        }).length
      })));

      // Calculate pie data
      const categories: any = {};
      docs.forEach(d => {
        if (d.category) {
          categories[d.category] = (categories[d.category] || 0) + 1;
        }
      });
      const newPieData = Object.keys(categories).map(cat => ({
        name: cat,
        value: categories[cat]
      }));
      setPieData(newPieData.length > 0 ? newPieData : [
        { name: 'Belum Ada Data', value: 1 }
      ]);
    }, (error) => {
      console.warn("Documents listener error:", error.message);
    });

    // Listen to real staff count
    const unsubscribeStaff = onSnapshot(collection(db, 'users'), (snapshot) => {
      setStaffCount(snapshot.size);
    }, (error) => {
      console.warn("Users listener error:", error.message);
    });

    // Listen to real archives count
    const unsubscribeArchives = onSnapshot(collection(db, 'archives'), (snapshot) => {
      setArchiveCount(snapshot.size);
    }, (error) => {
      console.warn("Archives listener error:", error.message);
    });

    // Listen to real tasks for efficiency calculation
    const unsubscribeTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const total = snapshot.size;
      const completed = snapshot.docs.filter(d => d.data().status === 'Completed').length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
      setEfficiency(`${percentage}%`);
    }, (error) => {
      console.warn("Tasks listener error:", error.message);
    });

    return () => {
      unsubscribeStats();
      unsubscribeRequests();
      unsubscribeDocs();
      unsubscribeStaff();
      unsubscribeArchives();
      unsubscribeTasks();
    };
  }, [user?.uid]);

  const seedStats = async () => {
    const initialStats = [
      { label: 'Total Dokumen', value: '0', icon: 'Database', color: 'bg-yellow-400', order: 1, isDynamic: true, dynamicKey: 'docs' },
      { label: 'Arsip Produk Jadi', value: '0', icon: 'ShieldCheck', color: 'bg-black text-white', order: 2, isDynamic: true, dynamicKey: 'archives' },
      { label: 'Permintaan Data', value: '0', icon: 'FileText', color: 'bg-zinc-100', order: 3, isDynamic: true, dynamicKey: 'requests' },
      { label: 'Staf Aktif', value: '0', icon: 'Users', color: 'bg-zinc-100', order: 4, isDynamic: true, dynamicKey: 'staff' },
    ];

    try {
      for (const stat of initialStats) {
        await setDoc(doc(db, 'stats', stat.label.toLowerCase().replace(/\s+/g, '-')), stat);
      }
      alert('Data statistik berhasil diinisialisasi!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'stats');
    }
  };

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Database': return Database;
      case 'FileText': return FileText;
      case 'Users': return Users;
      case 'Zap': return Zap;
      case 'ShieldCheck': return ShieldCheck;
      default: return Database;
    }
  };

  const getDisplayValue = (stat: any) => {
    if (stat.isDynamic) {
      if (stat.dynamicKey === 'requests') return requestCount.toString();
      if (stat.dynamicKey === 'staff') return staffCount.toString();
      if (stat.dynamicKey === 'docs') return docCount.toString();
      if (stat.dynamicKey === 'archives') return archiveCount.toString();
      if (stat.dynamicKey === 'efficiency') return efficiency;
    }
    return stat.value;
  };

  const COLORS = ['#000000', '#FACC15', '#71717A', '#A1A1AA'];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-black tracking-tight">DASHBOARD UTAMA</h1>
          <p className="text-zinc-500 mt-2">Pantau statistik data dan aktivitas Bidang Cloud-P secara real-time.</p>
        </div>
        {(stats.length === 0 || isAdmin) && !loading && (
          <button 
            onClick={seedStats}
            className="px-4 py-2 bg-zinc-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-all"
          >
            {stats.length === 0 ? 'Inisialisasi Data' : 'Update Struktur Stats'}
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-zinc-100 animate-pulse rounded-3xl" />
          ))
        ) : (
          stats.map((stat, i) => {
            const Icon = getIcon(stat.icon);
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={stat.id}
                className={cn("p-6 rounded-3xl shadow-sm border border-black/5 flex items-center justify-between", stat.color)}
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-60">{stat.label}</p>
                  <p className="text-3xl font-black mt-1">{getDisplayValue(stat)}</p>
                </div>
                <Icon size={32} className="opacity-20" />
              </motion.div>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-xl flex items-center gap-2">
              <BarChart3 className="text-yellow-500" /> Statistik Input Data
            </h3>
            <select className="bg-zinc-50 border-none text-sm font-medium rounded-lg px-3 py-1">
              <option>6 Bulan Terakhir</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="data" name="Input Dokumen" fill="#FACC15" radius={[4, 4, 0, 0]} />
                <Bar dataKey="requests" name="Permintaan Data" fill="#000000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
          <h3 className="font-bold text-xl mb-8 flex items-center gap-2">
            <Database className="text-yellow-500" /> Distribusi Kategori Data
          </h3>
          <div className="h-[300px] w-full flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-4 pr-8">
              {pieData.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-sm font-medium">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ACTIVITY_CODES: Record<string, { code: string; label: string }[]> = {
  'Informasi Kepegawaiaan': [
    { code: '01', label: 'Data Identitas dan Profil Pegawai' },
    { code: '02', label: 'Data Laporan LHKPN' },
    { code: '03', label: 'Data lainnya terkait informasi' },
  ],
  'Pengadaan Pegawai': [
    { code: '01', label: 'data penyusunan formasi dan kebutuhan' },
    { code: '02', label: 'data pelaksanaan dan seleksi CPNS dan PPPK' },
    { code: '03', label: 'Data Pengusulan NIP' },
    { code: '04', label: 'data pengangkatan dan penetapan NIP' },
    { code: '05', label: 'data lainnya terkait pengadaan' },
  ],
  'Kinerja Pegawai': [
    { code: '01', label: 'data rekapitulasi absen' },
    { code: '02', label: 'data capaian SKP kinerja pegawai' },
    { code: '03', label: 'data cuti pegawai' },
    { code: '04', label: 'data kasus indisipliner' },
    { code: '05', label: 'data usukan satya lencana' },
    { code: '06', label: 'data lainnya terkait kinerja pegawai' },
  ],
  'Arsip Digital': [
    { code: '01', label: 'Arsip Umum' }
  ]
};

export const DEFAULT_DRIVE_FOLDERS: Record<string, string> = {
  'Pengadaan Pegawai': 'https://drive.google.com/drive/folders/1p-TyEk9e1w-lAzrJOdIamGxWWAsw_fsl?usp=drive_link',
  'Informasi Kepegawaiaan': 'https://drive.google.com/drive/folders/1DXI4hiGoYkbuHEZ-JBkxTlXcAL8HycBw?usp=drive_link',
  'Kinerja Pegawai': 'https://drive.google.com/drive/folders/1m2ftZNc1jy9EnSVICg7fCpk-vK5LOdma?usp=drive_link',
  'Arsip Digital (Pusat)': 'https://drive.google.com/drive/folders/1CnG1puuC1kv_gw_t-NyX3aP2hKbnOHR2?usp=drive_link',
};

export const getStoredDriveFolders = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem('custom_drive_folders');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_DRIVE_FOLDERS, ...parsed };
    }
  } catch (e) {
    console.warn('Error reading stored drive folders', e);
  }
  return { ...DEFAULT_DRIVE_FOLDERS };
};

export const saveStoredDriveFolders = (folders: Record<string, string>) => {
  try {
    localStorage.setItem('custom_drive_folders', JSON.stringify(folders));
  } catch (e) {
    console.warn('Error saving drive folders', e);
  }
};

const DriveQuotaModal = ({
  isOpen,
  onClose,
  quota,
  onRefresh,
  isRefreshing,
  onSwitchAccount,
  onOpenSettings
}: {
  isOpen: boolean;
  onClose: () => void;
  quota: DriveQuotaDetails | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  onSwitchAccount: () => void;
  onOpenSettings?: () => void;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-zinc-100 space-y-6"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-yellow-400 flex items-center justify-center shadow-sm">
              <HardDrive className="text-black" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-black">Status Kuota Google Drive</h3>
              <p className="text-xs text-zinc-400">Rincian kapasitas & akun penyimpanan</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-black transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {quota ? (
          <div className="space-y-5">
            {/* Account Info */}
            <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200/80 flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Akun Terhubung</div>
                <div className="text-sm font-bold text-zinc-900 truncate" title={quota.userEmail}>
                  {quota.userEmail || 'Akun Google'}
                </div>
                {quota.userName && (
                  <div className="text-xs text-zinc-500 truncate">{quota.userName}</div>
                )}
              </div>
              <button
                type="button"
                onClick={onSwitchAccount}
                className="px-3 py-2 bg-white hover:bg-yellow-400 border border-zinc-200 hover:border-yellow-400 text-zinc-700 hover:text-black rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw size={12} /> Ganti Akun
              </button>
            </div>

            {/* Storage Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold text-zinc-600">Total Penggunaan Akun:</span>
                <span className={cn(
                  "text-sm font-black",
                  quota.isExceeded ? "text-red-600" : quota.percentUsed > 85 ? "text-amber-600" : "text-zinc-900"
                )}>
                  {quota.usageFormatted} / {quota.limitFormatted} ({quota.percentUsed}%)
                </span>
              </div>
              <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden p-0.5 border border-zinc-200">
                <div 
                  style={{ width: `${Math.min(100, quota.percentUsed)}%` }}
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    quota.isExceeded ? "bg-red-500" : quota.percentUsed > 85 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500 font-medium">
                <span>0 GB</span>
                <span>Sisa Ruang: <strong className="text-zinc-800">{quota.freeSpaceFormatted}</strong></span>
                <span>{quota.limitFormatted}</span>
              </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Khusus File Google Drive</span>
                <div className="text-base font-black text-zinc-900">{quota.usageInDriveFormatted}</div>
              </div>
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Sampah Drive (Trash)</span>
                <div className="text-base font-black text-amber-700">{quota.trashFormatted}</div>
              </div>
            </div>

            {/* Explanation Note */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl text-xs text-blue-950 space-y-1 leading-relaxed">
              <p className="font-bold flex items-center gap-1.5 text-blue-900">
                <Info size={14} className="shrink-0" />
                Mengapa Muncul Penuh Saat Drive Masih 6 GB?
              </p>
              <p className="text-[11px] text-blue-900/90 leading-relaxed">
                Kapasitas 15 GB dari Google merupakan <strong>akumulasi gabungan</strong> antara <strong>Google Drive</strong>, <strong>Gmail</strong> (email & lampiran), dan <strong>Google Photos</strong>. Jika file Drive baru 6 GB namun Gmail atau Foto mengisi sisanya hingga 15 GB, Google API tetap menganggap akun penuh dan menolak file baru.
              </p>
            </div>

            {/* Action Links */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <a
                href="https://drive.google.com/drive/trash"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-xl transition-all text-center"
              >
                <Trash2 size={13} /> Kosongkan Sampah ↗
              </a>
              <a
                href="https://one.google.com/storage"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-xl transition-all text-center"
              >
                <ExternalLink size={13} /> Kelola Google One ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-zinc-500 text-xs">
            Memuat data kuota Google Drive...
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-zinc-100">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-black transition-colors"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} /> Cek Ulang
            </button>
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 hover:text-yellow-600 transition-colors"
              >
                <Settings size={13} /> Beralih / Atur Drive
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all"
          >
            Tutup
          </button>
        </div>
      </motion.div>
    </div>
  );
};

interface DriveSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  quota: DriveQuotaDetails | null;
  onSwitchAccount: () => void;
  folderUrls: Record<string, string>;
  onUpdateFolderUrls: (newUrls: Record<string, string>) => void;
}

const DriveSettingsModal = ({
  isOpen,
  onClose,
  quota,
  onSwitchAccount,
  folderUrls,
  onUpdateFolderUrls
}: DriveSettingsModalProps) => {
  const [editedUrls, setEditedUrls] = useState<Record<string, string>>(folderUrls);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setEditedUrls(folderUrls);
  }, [folderUrls, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveStoredDriveFolders(editedUrls);
    onUpdateFolderUrls(editedUrls);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleResetToDefault = () => {
    if (confirm('Kembalikan semua tautan folder Google Drive ke folder default BKPSDM?')) {
      setEditedUrls(DEFAULT_DRIVE_FOLDERS);
      saveStoredDriveFolders(DEFAULT_DRIVE_FOLDERS);
      onUpdateFolderUrls(DEFAULT_DRIVE_FOLDERS);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl border border-zinc-100 space-y-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-yellow-400 flex items-center justify-center shadow-sm">
              <Settings className="text-black" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-black">Beralih & Pengaturan Penyimpanan Google Drive</h3>
              <p className="text-xs text-zinc-400">Atur akun Google, folder tujuan, dan metode penyimpanan berkas</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-black transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 1. Beralih Akun Google */}
        <div className="p-5 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Pilihan 1: Beralih Akun Google</span>
              <h4 className="text-sm font-bold text-zinc-900">Ganti Akun Google Drive (Email Lain)</h4>
              <p className="text-xs text-zinc-500">
                {quota?.userEmail ? (
                  <>Terhubung sebagai: <strong className="text-black">{quota.userEmail}</strong> ({quota.usageFormatted} / {quota.limitFormatted})</>
                ) : (
                  'Masuk dengan akun Google Drive dinas atau akun lain.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onSwitchAccount}
              className="px-4 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-black font-black rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95"
            >
              <RefreshCw size={14} /> Beralih Akun Google Sekarang
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            💡 <em>Jika kapasitas Google Drive akun saat ini hampir habis (15 GB) atau Anda ingin menggunakan Google Workspace dinas, klik tombol di atas untuk memilih akun Google yang berbeda melalui jendela login resmi Google.</em>
          </p>
        </div>

        {/* 2. Pilihan Target Lokasi Penyimpanan */}
        <div className="p-5 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">Pilihan 2: Lokasi Penyimpanan Berkas</span>
          <h4 className="text-sm font-bold text-amber-950">Fleksibilitas Mode Simpan</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-zinc-900">
                <FolderOpen size={14} className="text-yellow-600" /> Folder Bersama Kategori
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Tersimpan di folder Google Drive induk yang dikonfigurasi di bawah. Cocok untuk arsip bersama seluruh bidang.
              </p>
            </div>
            <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-zinc-900">
                <HardDrive size={14} className="text-zinc-900" /> My Drive Pribadi
              </div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Tersimpan otomatis di folder <code>Cloud-P Dokumen</code> pada My Drive akun pribadi Anda sendiri.
              </p>
            </div>
          </div>
          <p className="text-[11px] text-amber-900/90 pt-1">
            * Opsi ini dapat dipilih langsung saat Anda membuka formulir unggah dokumen atau arsip.
          </p>
        </div>

        {/* 3. Kustomisasi Tautan Folder Google Drive */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Pilihan 3: Folder Google Drive Tujuan</span>
              <h4 className="text-sm font-bold text-zinc-900">Tautan Folder Penyimpanan Utama</h4>
            </div>
            <button
              type="button"
              onClick={handleResetToDefault}
              className="text-xs text-zinc-500 hover:text-red-600 font-bold underline transition-colors"
            >
              Reset ke Default
            </button>
          </div>
          
          <div className="space-y-3">
            {Object.keys(DEFAULT_DRIVE_FOLDERS).map((folderName) => {
              const currentUrl = editedUrls[folderName] || DEFAULT_DRIVE_FOLDERS[folderName];
              const isCustom = currentUrl !== DEFAULT_DRIVE_FOLDERS[folderName];
              
              return (
                <div key={folderName} className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-zinc-800">{folderName}</span>
                    <div className="flex items-center gap-2">
                      {isCustom ? (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold">
                          Kustom
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-zinc-200 text-zinc-700 rounded-md text-[10px] font-bold">
                          Default BKPSDM
                        </span>
                      )}
                      <a
                        href={currentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-bold"
                      >
                        Buka Folder <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                  <input
                    type="url"
                    value={currentUrl}
                    onChange={(e) => {
                      setEditedUrls({
                        ...editedUrls,
                        [folderName]: e.target.value
                      });
                    }}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="w-full p-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-mono text-zinc-700 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {saveSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>Pengaturan tautan folder Google Drive berhasil disimpan!</span>
          </div>
        )}

        <div className="flex justify-between items-center pt-3 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition-all"
          >
            Tutup
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2.5 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95"
            >
              Simpan Perubahan Tautan
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const extractDriveFileId = (file?: { driveFileId?: string; url?: string } | null): string | null => {
  if (!file) return null;
  if (file.driveFileId && file.driveFileId.trim()) return file.driveFileId.trim();
  if (file.url) {
    const matchD = file.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD) return matchD[1];
    const matchId = file.url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId) return matchId[1];
    const matchFolder = file.url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (matchFolder) return matchFolder[1];
  }
  return null;
};

const isImageFile = (fileName?: string) => {
  if (!fileName) return false;
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext || '');
};

export interface DocumentPreviewItem {
  id?: string;
  name?: string;
  fileName?: string;
  url?: string;
  driveFileId?: string;
  category?: string;
  activityCode?: string;
  jenisAsn?: string;
  updateDate?: string;
  createdAt?: string;
  size?: string;
  uploaderName?: string;
  archiveType?: string;
  month?: string;
  year?: string;
}

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentPreviewItem | null;
}

const DocumentPreviewModal = ({
  isOpen,
  onClose,
  document: doc
}: DocumentPreviewModalProps) => {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'drive' | 'image'>('drive');

  useEffect(() => {
    if (isOpen) {
      setIframeLoading(true);
      setIsFullscreen(false);
      const isImg = isImageFile(doc?.fileName || doc?.name);
      setViewMode(isImg ? 'image' : 'drive');
    }
  }, [isOpen, doc]);

  if (!isOpen || !doc) return null;

  const fileId = extractDriveFileId(doc);
  const fileName = doc.fileName || doc.name || 'Dokumen';
  const isImg = isImageFile(fileName);
  const isPdf = (fileName || '').toLowerCase().endsWith('.pdf');

  const previewUrl = fileId 
    ? `https://drive.google.com/file/d/${fileId}/preview` 
    : doc.url || '';
  
  const downloadUrl = fileId 
    ? `https://drive.google.com/uc?export=download&id=${fileId}` 
    : doc.url;

  const directImageUrl = fileId
    ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`
    : doc.url;

  return (
    <div className={cn(
      "fixed inset-0 z-50 transition-all duration-200 animate-in fade-in flex items-center justify-center",
      isFullscreen ? "p-0 bg-black" : "p-3 sm:p-6 bg-black/80 backdrop-blur-md"
    )}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className={cn(
          "bg-zinc-950 border border-zinc-800 text-white flex flex-col overflow-hidden shadow-2xl transition-all duration-300",
          isFullscreen 
            ? "w-screen h-screen rounded-none" 
            : "w-full max-w-5xl h-[88vh] rounded-3xl"
        )}
      >
        {/* Header */}
        <div className="p-4 sm:px-6 sm:py-4 border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
              isPdf ? "bg-red-500/20 text-red-400 border border-red-500/30" :
              isImg ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
              "bg-yellow-400/20 text-yellow-400 border border-yellow-400/30"
            )}>
              <FileText size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black truncate max-w-md" title={fileName}>
                  {fileName}
                </h3>
                {doc.jenisAsn && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {doc.jenisAsn}
                  </span>
                )}
                {doc.category && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-yellow-400/20 text-yellow-300 border border-yellow-400/30">
                    {doc.category}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                {doc.updateDate ? `Update: ${new Date(doc.updateDate).toLocaleDateString('id-ID')}` : ''}
                {doc.uploaderName ? ` • Oleh: ${doc.uploaderName}` : ''}
                {doc.size ? ` • Ukuran: ${doc.size}` : ''}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isImg && (
              <div className="hidden sm:flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 mr-1">
                <button
                  type="button"
                  onClick={() => setViewMode('image')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all",
                    viewMode === 'image' ? "bg-white text-black shadow-sm" : "text-zinc-400 hover:text-white"
                  )}
                >
                  Gambar
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('drive')}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all",
                    viewMode === 'drive' ? "bg-white text-black shadow-sm" : "text-zinc-400 hover:text-white"
                  )}
                >
                  Viewer Drive
                </button>
              </div>
            )}

            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                title="Unduh Berkas Ini"
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all border border-zinc-700 active:scale-95"
              >
                <Download size={14} />
                <span className="hidden md:inline">Unduh</span>
              </a>
            )}

            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Buka Langsung di Google Drive"
                className="flex items-center gap-1.5 px-3 py-2 bg-yellow-400 hover:bg-yellow-500 text-black rounded-xl text-xs font-black transition-all shadow-sm active:scale-95"
              >
                <ExternalLink size={14} />
                <span className="hidden md:inline">Buka Drive</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => setIsFullscreen(prev => !prev)}
              title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
              className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors"
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Tutup Pratinjau"
              className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="relative flex-1 bg-zinc-900/60 w-full overflow-hidden flex items-center justify-center">
          {viewMode === 'image' && directImageUrl ? (
            <div className="w-full h-full p-4 flex items-center justify-center overflow-auto bg-black/40">
              <img
                src={directImageUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                onLoad={() => setIframeLoading(false)}
              />
            </div>
          ) : previewUrl ? (
            <div className="relative w-full h-full">
              {iframeLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm z-10 text-white gap-3">
                  <div className="w-8 h-8 border-3 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-zinc-300 tracking-wide">
                    Menghubungkan ke Google Drive Viewer...
                  </span>
                </div>
              )}
              <iframe
                src={previewUrl}
                title={fileName}
                className="w-full h-full border-0 bg-zinc-900"
                allow="autoplay"
                onLoad={() => setIframeLoading(false)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-zinc-400">
              <AlertTriangle size={32} className="text-amber-400" />
              <p className="text-sm font-bold text-white">Tautan pratinjau tidak tersedia untuk dokumen ini.</p>
              <p className="text-xs text-zinc-400 max-w-sm">
                File mungkin belum disinkronkan sepenuhnya ke Google Drive atau hak akses perlu diperiksa.
              </p>
              {doc.url && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 px-4 py-2 bg-yellow-400 text-black font-black text-xs rounded-xl hover:bg-yellow-500 transition-all flex items-center gap-2"
                >
                  <ExternalLink size={14} /> Buka di Tab Baru
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-6 py-2.5 bg-zinc-950 border-t border-zinc-900 flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
          <div className="flex items-center gap-4">
            <span>Bidang: <strong className="text-zinc-300 font-semibold">{doc.category || 'BKPSDM'}</strong></span>
            {doc.activityCode && <span>Kode: <strong className="text-zinc-300 font-semibold">{doc.activityCode}</strong></span>}
            {doc.archiveType && <span>Jenis: <strong className="text-zinc-300 font-semibold">{doc.archiveType}</strong></span>}
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <span>Pratinjau Dokumen Cloud-P</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const DataCenter = ({ user, userData, googleAccessToken, setGoogleAccessToken }: { user: any, userData: any, googleAccessToken: string | null, setGoogleAccessToken: (token: string | null) => void }) => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewState, setViewState] = useState<{
    view: 'main' | 'category' | 'activity' | 'year' | 'month' | 'customFolder';
    category: string | null;
    activity: string | null;
    year: string | null;
    month: string | null;
    customFolder: string | null;
  }>({ view: 'main', category: null, activity: null, year: null, month: null, customFolder: null });

  const [newDoc, setNewDoc] = useState({ 
    name: '', 
    category: 'Pengadaan Pegawai', 
    activityCode: '01',
    month: MONTHS[new Date().getMonth()],
    year: new Date().getFullYear().toString(),
    updateDate: new Date().toISOString().split('T')[0],
    size: '',
    jenisAsn: 'PNS',
    useCustomFolder: false,
    customFolderName: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(10);
  const [syncStatus, setSyncStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [driveQuota, setDriveQuota] = useState<DriveQuotaDetails | null>(null);
  const [isCheckingQuota, setIsCheckingQuota] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<'shared' | 'my_drive'>('shared');
  const [isPersonalDriveEnabled, setIsPersonalDriveEnabled] = useState<boolean>(() => {
    return localStorage.getItem('cloudp_personal_drive_enabled_' + (user?.uid || 'user')) === 'true';
  });
  const [folderUrls, setFolderUrls] = useState<Record<string, string>>(getStoredDriveFolders);
  const [isAuthExpired, setIsAuthExpired] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentPreviewItem | null>(null);

  const personalDriveFolderId = localStorage.getItem('cloudp_personal_folder_' + (user?.uid || 'user'));
  const personalDriveUrl = personalDriveFolderId 
    ? `https://drive.google.com/drive/folders/${personalDriveFolderId}` 
    : 'https://drive.google.com/drive/my-drive';

  const userDriveName = driveQuota?.userEmail 
    ? driveQuota.userEmail 
    : user?.displayName 
      ? user.displayName 
      : user?.email || 'Google Drive Pribadi';

  const personalDocs = useMemo(() => {
    return documents.filter(d => 
      d.storageTarget === 'my_drive' || 
      d.isPersonalDrive === true || 
      (personalDriveFolderId && d.parentFolderId === personalDriveFolderId)
    );
  }, [documents, personalDriveFolderId]);

  const isPersonalDriveCardVisible = isPersonalDriveEnabled || uploadTarget === 'my_drive' || personalDocs.length > 0;

  // Advanced Filter & Search States
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterJenisAsn, setFilterJenisAsn] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState<boolean>(false);

  const [chartData, setChartData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  const COLORS = ['#000000', '#FACC15', '#71717A', '#A1A1AA'];

  const categories = [
    { name: 'Pengadaan Pegawai', icon: Users, url: folderUrls['Pengadaan Pegawai'] || DEFAULT_DRIVE_FOLDERS['Pengadaan Pegawai'] },
    { name: 'Informasi Kepegawaiaan', icon: FileText, url: folderUrls['Informasi Kepegawaiaan'] || DEFAULT_DRIVE_FOLDERS['Informasi Kepegawaiaan'] },
    { name: 'Kinerja Pegawai', icon: BarChart3, url: folderUrls['Kinerja Pegawai'] || DEFAULT_DRIVE_FOLDERS['Kinerja Pegawai'] },
  ];

  const isAuthorized = userData?.status === 'authorized' || user?.email === 'saininda@gmail.com';

  const checkQuota = async (token?: string | null) => {
    const activeToken = token || googleAccessToken;
    if (!activeToken) return;
    setIsCheckingQuota(true);
    try {
      const quota = await fetchDriveStorageQuota(activeToken);
      if (quota) {
        setDriveQuota(quota);
        setIsAuthExpired(false);
        if (quota.isExceeded) {
          setIsQuotaExceeded(true);
        }
      }
    } catch (err: any) {
      if (err?.message === 'TOKEN_EXPIRED_401') {
        console.warn('Google Drive token expired (HTTP 401). Resetting token.');
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_drive_token');
        setDriveQuota(null);
        setIsAuthExpired(true);
      }
    } finally {
      setIsCheckingQuota(false);
    }
  };

  useEffect(() => {
    if (googleAccessToken) {
      checkQuota(googleAccessToken);
    } else {
      setDriveQuota(null);
      setIsQuotaExceeded(false);
    }
  }, [googleAccessToken]);

  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'documents');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Calculate chart data
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return MONTHS[d.getMonth()];
    }).reverse();

    const data = last6Months.map(month => ({
      name: month,
      total: documents.filter(doc => doc.month === month || doc.customFolderName === month).length
    }));
    setChartData(data);

    // Calculate pie data
    const categoriesData = categories.map(cat => ({
      name: cat.name,
      value: documents.filter(doc => doc.category === cat.name).length
    }));
    setPieData(categoriesData);
  }, [documents, folderUrls]);

  const ACTIVITY_ABBREVIATIONS: Record<string, string> = {
    'Pengadaan Pegawai': 'PGDN',
    'Kinerja Pegawai': 'KNJ',
    'Informasi Kepegawaiaan': 'INFO'
  };

  const formatDateForNaming = (date: Date | string) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}${month}${year}`;
  };

  const renameGoogleDriveFile = async (fileId: string, newName: string, accessToken: string) => {
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName }),
      });
      if (response.status === 401) {
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_drive_token');
        setIsAuthExpired(true);
      }
      return response.ok;
    } catch (error) {
      console.error('Error renaming Drive file:', error);
      return false;
    }
  };

  const getFolderId = (url: string) => {
    const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  const handleConnectDrive = async (forceSelectAccount = false): Promise<string | null> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive');
      if (forceSelectAccount) {
        provider.setCustomParameters({ prompt: 'select_account' });
      }
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) {
        setGoogleAccessToken(token);
        sessionStorage.setItem('google_drive_token', token);
        setIsAuthExpired(false);
        setErrorMessage(null);
        if (uploadStatus === 'error') setUploadStatus('idle');
        await checkQuota(token);
        return token;
      }
      return null;
    } catch (error) {
      console.error('Error connecting to Drive:', error);
      alert('Gagal menghubungkan ke Google Drive.');
      return null;
    }
  };

  const uploadToGoogleDrive = async (file: File, fileName: string, folderId: string, accessToken: string) => {
    console.group(`[DataCenter:uploadToGoogleDrive] Mengunggah file "${fileName}" ke Google Drive`);
    console.log('[DataCenter:uploadToGoogleDrive] Parameter input:', {
      fileName,
      folderId,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB (${file.size} bytes)`,
      fileType: file.type || 'unknown/binary',
      tokenAvailable: Boolean(accessToken)
    });

    // 1. Validasi Keberadaan dan Format folderId
    if (!folderId || typeof folderId !== 'string' || !folderId.trim() || folderId === 'null' || folderId === 'undefined') {
      console.error('[DataCenter:uploadToGoogleDrive] ERROR: folderId tidak valid atau kosong!', { folderId });
      console.groupEnd();
      throw new Error(`ID Folder tujuan tidak valid: "${folderId}". Proses pengunggahan dibatalkan.`);
    }

    const cleanFolderId = folderId.trim();

    // 2. Pemeriksaan Asinkron Folder Google Drive (memastikan folder ID benar-benar ada dan dapat ditulis)
    if (cleanFolderId !== 'root') {
      console.log(`[DataCenter:uploadToGoogleDrive] Melakukan verifikasi asinkron ke Google Drive API untuk folder ID: "${cleanFolderId}"...`);
      try {
        const verifyRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${cleanFolderId}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json'
            }
          }
        );

        console.log(`[DataCenter:uploadToGoogleDrive] Hasil verifikasi folder API: HTTP ${verifyRes.status} ${verifyRes.statusText}`);

        if (!verifyRes.ok) {
          const errBody = await verifyRes.text().catch(() => '');
          console.error('[DataCenter:uploadToGoogleDrive] Validasi folder gagal (response.ok = false):', {
            status: verifyRes.status,
            statusText: verifyRes.statusText,
            body: errBody
          });

          if (verifyRes.status === 401) {
            console.groupEnd();
            throw new Error('SESI_DRIVE_BERAKHIR: Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan hubungkan ulang akun Google Drive Anda.');
          } else if (verifyRes.status === 404) {
            console.groupEnd();
            throw new Error(`FOLDER_TIDAK_DITEMUKAN: Folder tujuan (ID: "${cleanFolderId}") tidak ditemukan atau telah dihapus di Google Drive.`);
          } else if (verifyRes.status === 403) {
            console.groupEnd();
            throw new Error(`AKSES_DITOLAK: Akun Google Anda tidak memiliki izin untuk mengakses folder (ID: "${cleanFolderId}"). Pastikan Anda memiliki akses Editor.`);
          } else {
            console.groupEnd();
            throw new Error(`Gagal memverifikasi folder tujuan di Google Drive (HTTP ${verifyRes.status}): ${errBody || verifyRes.statusText}`);
          }
        }

        const folderData = await verifyRes.json();
        console.log('[DataCenter:uploadToGoogleDrive] Folder tujuan berhasil diverifikasi secara asinkron:', {
          id: folderData.id,
          name: folderData.name,
          mimeType: folderData.mimeType,
          trashed: folderData.trashed,
          canAddChildren: folderData.capabilities?.canAddChildren
        });

        if (folderData.trashed) {
          console.groupEnd();
          throw new Error(`FOLDER_DI_TRASH: Folder tujuan "${folderData.name}" (ID: ${cleanFolderId}) berada di tempat sampah (Trash) Google Drive.`);
        }

        if (folderData.mimeType !== 'application/vnd.google-apps.folder') {
          console.groupEnd();
          throw new Error(`BUKAN_FOLDER: Objek Google Drive "${cleanFolderId}" (${folderData.name}) bukan folder (tipe: ${folderData.mimeType}).`);
        }
      } catch (verifyErr: any) {
        if (
          verifyErr.message?.startsWith('SESI_DRIVE_BERAKHIR') || 
          verifyErr.message?.startsWith('FOLDER_TIDAK_DITEMUKAN') || 
          verifyErr.message?.startsWith('AKSES_DITOLAK') ||
          verifyErr.message?.startsWith('FOLDER_DI_TRASH') ||
          verifyErr.message?.startsWith('BUKAN_FOLDER')
        ) {
          throw verifyErr;
        }
        console.warn('[DataCenter:uploadToGoogleDrive] Catatan: Pengecekan asinkron folder mengalami kendala non-fatal, melanjutkan ke proses upload:', verifyErr);
      }
    }

    // 3. Menyiapkan Data Multipart Form untuk Pengunggahan
    console.log('[DataCenter:uploadToGoogleDrive] Menyusun payload multipart upload dengan parent folder:', cleanFolderId);
    const metadata = {
      name: fileName,
      parents: [cleanFolderId],
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    const uploadEndpoint = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,parents,size&supportsAllDrives=true';
    console.log(`[DataCenter:uploadToGoogleDrive] Mengirim request POST ke Google Drive API: ${uploadEndpoint}`);

    const response = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    console.log(`[DataCenter:uploadToGoogleDrive] Respon diterima dari Google Drive API: HTTP ${response.status} ${response.statusText}`);

    // 4. Validasi response.ok Sebelum Memproses Respons
    if (!response.ok) {
      console.error(`[DataCenter:uploadToGoogleDrive] Upload GAGAL (response.ok = false). Status: HTTP ${response.status}`);
      let errorData: any = {};
      let rawErrorText = '';
      try {
        rawErrorText = await response.text();
        errorData = JSON.parse(rawErrorText);
      } catch {
        // Fallback jika bukan format JSON
      }

      console.error('[DataCenter:uploadToGoogleDrive] Rincian error pengunggahan:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        rawErrorText: rawErrorText.slice(0, 300)
      });
      console.groupEnd();

      if (response.status === 401) {
        throw new Error('SESI_DRIVE_BERAKHIR: Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan hubungkan ulang akun Google Drive Anda.');
      }

      const errMsg = errorData.error?.message || rawErrorText || 'Gagal mengunggah ke Google Drive';
      const reason = errorData.error?.errors?.[0]?.reason || '';

      if (
        reason === 'storageQuotaExceeded' || 
        errMsg.toLowerCase().includes('storage quota') || 
        errMsg.toLowerCase().includes('quota has been exceeded')
      ) {
        throw new Error('KUOTA_DRIVE_PENUH: Kapasitas penyimpanan Google Drive akun Anda telah habis (Storage Quota Exceeded).');
      }

      if (response.status === 404 || errMsg.toLowerCase().includes('file not found')) {
        throw new Error(`FOLDER_INDUK_TIDAK_DITEMUKAN: Folder tujuan (ID: ${cleanFolderId}) tidak ditemukan di Google Drive.`);
      }

      throw new Error(`Google Drive Upload Error (${response.status}): ${errMsg}`);
    }

    // 5. Respons Terverifikasi OK -> Memproses Payload JSON
    console.log('[DataCenter:uploadToGoogleDrive] Validasi response.ok = TRUE. Memproses respons JSON...');
    const result = await response.json();

    if (!result || !result.id) {
      console.error('[DataCenter:uploadToGoogleDrive] Format respons tidak valid, ID file tidak ditemukan:', result);
      console.groupEnd();
      throw new Error('Google Drive merespon sukses tetapi tidak mengembalikan ID file yang valid.');
    }

    console.log('[DataCenter:uploadToGoogleDrive] Pengunggahan berhasil diselesaikan:', {
      fileId: result.id,
      fileName: result.name || fileName,
      targetFolderId: cleanFolderId,
      parents: result.parents,
      webViewLink: result.webViewLink
    });
    console.groupEnd();

    return result;
  };

  const handleSaveWithoutDriveUpload = async () => {
    if (files.length === 0 && !newDoc.name) {
      alert('Silakan pilih file atau masukkan nama dokumen terlebih dahulu.');
      return;
    }

    setIsSubmitting(true);
    setUploadStatus('saving');
    const today = new Date().toISOString().split('T')[0];
    const dateSuffix = formatDateForNaming(today);
    const abrv = (ACTIVITY_ABBREVIATIONS[newDoc.category] || 'DOC').toLowerCase();

    try {
      const itemsToSave = files.length > 0 ? files : [{ name: `${newDoc.name || 'DOKUMEN'}.pdf`, size: 0 } as any];

      for (let i = 0; i < itemsToSave.length; i++) {
        const currentFile = itemsToSave[i];
        const fileExtension = currentFile.name ? currentFile.name.split('.').pop() : 'pdf';
        const rawName = itemsToSave.length > 1 ? currentFile.name.split('.')[0] : (newDoc.name || currentFile.name.split('.')[0]);
        
        let customFileName = `${newDoc.year}_${abrv}_${newDoc.activityCode}_${rawName}_${dateSuffix}.${fileExtension}`;
        if (newDoc.category === 'Informasi Kepegawaiaan') {
          customFileName = `${newDoc.year}_${abrv}_${newDoc.activityCode}_${rawName}_${newDoc.jenisAsn}_${dateSuffix}.${fileExtension}`;
        }
        const fileSize = currentFile.size > 0 ? (currentFile.size / (1024 * 1024)).toFixed(2) + ' MB' : (newDoc.size || '0 MB');

        await addDoc(collection(db, 'documents'), {
          ...newDoc,
          name: itemsToSave.length > 1 ? currentFile.name.split('.')[0].toUpperCase() : (newDoc.name || rawName).toUpperCase(),
          updateDate: today,
          fileName: customFileName,
          driveFileId: null,
          url: '',
          storageStatus: 'quota_exceeded',
          size: fileSize,
          customFolderName: newDoc.customFolderName || '',
          createdAt: new Date().toISOString(),
          uploadedBy: user.uid,
          uploaderName: user.displayName || user.email || 'Pengguna',
          note: 'Tersimpan di Cloud-P (Pengunggahan Google Drive ditangguhkan karena kuota penyimpanan Drive penuh).'
        });
      }

      setUploadStatus('success');
      setSyncStatus({ 
        message: `${itemsToSave.length} data dokumen berhasil dicatat di sistem Cloud-P!`, 
        type: 'success' 
      });
      setTimeout(() => setSyncStatus(null), 4000);

      setTimeout(() => {
        setIsModalOpen(false);
        setUploadStatus('idle');
        setFiles([]);
        setNewDoc({ 
          name: '', 
          category: viewState.category || 'Pengadaan Pegawai', 
          activityCode: viewState.activity || '01',
          month: MONTHS[new Date().getMonth()],
          year: viewState.year || new Date().getFullYear().toString(),
          updateDate: new Date().toISOString().split('T')[0],
          size: '',
          jenisAsn: 'PNS',
          useCustomFolder: false,
          customFolderName: ''
        });
        setUploadProgress(0);
        setIsQuotaExceeded(false);
        setErrorMessage(null);
      }, 1500);
    } catch (err: any) {
      console.error('Error in handleSaveWithoutDriveUpload:', err);
      setUploadStatus('error');
      setErrorMessage('Gagal menyimpan ke database: ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDocument = async (e?: React.FormEvent, overrideTarget?: 'shared' | 'my_drive') => {
    if (e) e.preventDefault();
    if (files.length === 0) {
      alert('Silakan pilih file terlebih dahulu.');
      return;
    }

    let activeToken = googleAccessToken;
    if (!activeToken) {
      activeToken = await handleConnectDrive(false);
      if (!activeToken) {
        setErrorMessage('Silakan hubungkan ke Google Drive terlebih dahulu.');
        setUploadStatus('error');
        return;
      }
    }

    const currentTarget = overrideTarget || uploadTarget;
    if (overrideTarget) {
      setUploadTarget(overrideTarget);
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setIsQuotaExceeded(false);
    setIsAuthExpired(false);
    const today = new Date().toISOString().split('T')[0];
    const dateSuffix = formatDateForNaming(today);
    const abrv = (ACTIVITY_ABBREVIATIONS[newDoc.category] || 'DOC').toLowerCase();

    try {
      setSyncStatus({ message: 'Menyiapkan folder di Google Drive...', type: 'info' });

      let rootFolderId: string | null = null;
      if (currentTarget === 'my_drive') {
        setSyncStatus({ message: 'Menyiapkan folder Cloud-P di My Drive pribadi...', type: 'info' });
        const baseAppFolder = await getOrCreateFolder('Cloud-P Dokumen', 'root', activeToken);
        localStorage.setItem('cloudp_personal_folder_' + (user?.uid || 'user'), baseAppFolder);
        setIsPersonalDriveEnabled(true);
        localStorage.setItem('cloudp_personal_drive_enabled_' + (user?.uid || 'user'), 'true');
        rootFolderId = await getOrCreateFolder(newDoc.category, baseAppFolder, activeToken);
      } else {
        const categoryObj = categories.find(c => c.name === newDoc.category);
        rootFolderId = categoryObj ? getFolderId(categoryObj.url) : null;
      }

      if (!rootFolderId) {
        setIsSubmitting(false);
        alert('ID Folder Google Drive tidak ditemukan untuk kategori ini.');
        return;
      }

      // 1. Get or create Activity Code folder (e.g., "01_Data Identitas dan Profil Pegawai")
      const activityObj = ACTIVITY_CODES[newDoc.category]?.find(a => a.code === newDoc.activityCode);
      const activityFolderName = activityObj ? `${activityObj.code}_${activityObj.label}` : newDoc.activityCode;
      console.log('[DataCenter:handleUpload] Menyiapkan hierarki folder:', {
        kategori: newDoc.category,
        rootFolderId,
        activityCode: newDoc.activityCode,
        activityFolderName
      });
      const activityFolderId = await getOrCreateFolder(activityFolderName, rootFolderId, activeToken);

      // 2. Get or create Year folder (e.g., "2026")
      const yearFolderId = await getOrCreateFolder(newDoc.year, activityFolderId, activeToken);
      console.log('[DataCenter:handleUpload] Folder tahun siap:', { year: newDoc.year, yearFolderId });

      // 3. Get or create Final folder
      let finalFolderId = yearFolderId;
      let effectiveFolderName = '';

      if (newDoc.useCustomFolder && newDoc.customFolderName?.trim()) {
        const customName = newDoc.customFolderName.trim().toUpperCase();
        finalFolderId = await getOrCreateFolder(customName, yearFolderId, activeToken);
        effectiveFolderName = customName;
      } else if (newDoc.customFolderName?.trim()) {
        const customName = newDoc.customFolderName.trim().toUpperCase();
        finalFolderId = await getOrCreateFolder(customName, yearFolderId, activeToken);
        effectiveFolderName = customName;
      } else if (newDoc.category !== 'Pengadaan Pegawai' && newDoc.month) {
        finalFolderId = await getOrCreateFolder(newDoc.month, yearFolderId, activeToken);
        effectiveFolderName = newDoc.month;
      }

      // If multiple files, create a grouping subfolder as requested by user ("nama folder")
      if (files.length > 1) {
        setSyncStatus({ message: `Membuat folder kelompok: ${newDoc.name}...`, type: 'info' });
        finalFolderId = await getOrCreateFolder(newDoc.name.toUpperCase(), finalFolderId, activeToken);
        effectiveFolderName = newDoc.name.toUpperCase();
      }

      console.log('[DataCenter:handleUpload] Folder tujuan akhir (finalFolderId) ditentukan:', {
        finalFolderId,
        effectiveFolderName: effectiveFolderName || '(tahun)',
        totalFiles: files.length
      });

      for (let i = 0; i < files.length; i++) {
        const currentFile = files[i];
        setUploadStatus('uploading');
        setUploadProgress(0);
        setSyncStatus({ message: `Mengunggah file ${i + 1} dari ${files.length}: ${currentFile.name}`, type: 'info' });

        const fileExtension = currentFile.name.split('.').pop();
        // If multiple files, use original filename; if single, use user provided name or original
        const rawName = files.length > 1 ? currentFile.name.split('.')[0] : (newDoc.name || currentFile.name.split('.')[0]);
        
        let customFileName = `${newDoc.year}_${abrv}_${newDoc.activityCode}_${rawName}_${dateSuffix}.${fileExtension}`;
        
        if (newDoc.category === 'Informasi Kepegawaiaan') {
          customFileName = `${newDoc.year}_${abrv}_${newDoc.activityCode}_${rawName}_${newDoc.jenisAsn}_${dateSuffix}.${fileExtension}`;
        }

        // Simulate progress for Drive upload
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => (prev < 90 ? prev + 10 : prev));
        }, 300);

        const driveResult = await uploadToGoogleDrive(currentFile, customFileName, finalFolderId, activeToken);
        
        clearInterval(progressInterval);
        setUploadProgress(100);
        
        const finalUrl = driveResult.webViewLink;
        const driveFileId = driveResult.id;
        const fileSize = (currentFile.size / (1024 * 1024)).toFixed(2) + ' MB';

        setUploadStatus('saving');
        await addDoc(collection(db, 'documents'), {
          ...newDoc,
          name: files.length > 1 ? currentFile.name.split('.')[0].toUpperCase() : newDoc.name,
          updateDate: today,
          fileName: customFileName,
          driveFileId,
          url: finalUrl,
          parentFolderId: finalFolderId,
          size: fileSize,
          customFolderName: effectiveFolderName,
          createdAt: new Date().toISOString(),
          uploadedBy: user.uid,
          uploaderName: user.displayName,
          storageTarget: currentTarget,
          isPersonalDrive: currentTarget === 'my_drive',
          driveAccount: driveQuota?.userEmail || user.email || ''
        });
      }
      
      setUploadStatus('success');
      setSyncStatus({ message: `${files.length} dokumen berhasil diunggah!`, type: 'success' });
      setTimeout(() => setSyncStatus(null), 3000);

      setTimeout(() => {
        setIsModalOpen(false);
        setUploadStatus('idle');
        setFiles([]);
        setNewDoc({ 
          name: '', 
          category: viewState.category || 'Pengadaan Pegawai', 
          activityCode: viewState.activity || '01',
          month: MONTHS[new Date().getMonth()],
          year: viewState.year || new Date().getFullYear().toString(),
          updateDate: new Date().toISOString().split('T')[0],
          size: '',
          jenisAsn: 'PNS',
          useCustomFolder: false,
          customFolderName: ''
        });
        setUploadProgress(0);
        setIsQuotaExceeded(false);
      }, 1500);
    } catch (error: any) {
      console.error('Error in handleAddDocument:', error);
      setUploadStatus('error');
      let msg = error.message || '';
      const isQuota = 
        msg.includes('KUOTA_DRIVE_PENUH') || 
        msg.toLowerCase().includes('storage quota') || 
        msg.toLowerCase().includes('quota has been exceeded') ||
        msg.toLowerCase().includes('storagequotaexceeded');

      const isAuthError = 
        msg.includes('SESI_DRIVE_BERAKHIR') ||
        msg.includes('401') ||
        msg.toLowerCase().includes('unauthenticated') ||
        msg.toLowerCase().includes('invalid credentials') ||
        msg.toLowerCase().includes('invalid authentication credentials') ||
        msg.includes('Sesi Google Drive telah berakhir');

      if (isAuthError) {
        setIsAuthExpired(true);
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_drive_token');
        msg = 'Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan hubungkan ulang akun Google Drive Anda di bawah ini.';
      } else if (isQuota) {
        setIsQuotaExceeded(true);
        msg = 'Kapasitas penyimpanan Google Drive Anda telah penuh (Storage Quota Exceeded).';
        checkQuota();
      } else if (msg.includes('insufficient permissions')) {
        msg = 'Izin Ditolak: Pastikan Anda memiliki akses tulis ke folder Google Drive tujuan.';
      }
      setErrorMessage(msg);
      setSyncStatus({ message: 'Gagal mengunggah: ' + msg, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncDrive = async () => {
    console.log('handleSyncDrive triggered');
    if (!googleAccessToken) {
      setSyncStatus({ message: 'Silakan hubungkan ke Google Drive terlebih dahulu.', type: 'error' });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ message: 'Memulai sinkronisasi...', type: 'info' });
    setSyncProgress({ current: 0, total: 0 });
    let addedCount = 0;

    try {
      for (const cat of categories) {
        setSyncStatus({ message: `Memindai kategori: ${cat.name}...`, type: 'info' });
        const folderId = getFolderId(cat.url);
        if (!folderId) continue;

        const driveFiles = await fetchAllFilesRecursively(folderId, googleAccessToken!);

        for (const driveFile of driveFiles) {
          const activityCode = driveFile.activity ? driveFile.activity.split('_')[0] : '01';
          const year = (driveFile.year && /^\d{4}$/.test(driveFile.year)) ? driveFile.year : new Date(driveFile.createdTime).getFullYear().toString();
          const abrv = (ACTIVITY_ABBREVIATIONS[cat.name] || 'DOC').toLowerCase();
          const dateSuff = formatDateForNaming(driveFile.createdTime);
          const extension = driveFile.name.split('.').pop();
          
          // Construct expected name (without extension for comparison)
          const expectedPrefix = `${year}_${abrv}_${activityCode}_`;
          const isFormatted = driveFile.name.startsWith(expectedPrefix) && driveFile.name.includes(`_${dateSuff}.${extension}`);
          
          let finalDriveName = driveFile.name;
          if (!isFormatted) {
            // Rename file in Drive
            const rawName = driveFile.name.split('.')[0];
            finalDriveName = `${year}_${abrv}_${activityCode}_${rawName}_${dateSuff}.${extension}`;
            console.log(`Renaming Drive file: ${driveFile.name} -> ${finalDriveName}`);
            await renameGoogleDriveFile(driveFile.id, finalDriveName, googleAccessToken!);
          }

          const exists = documents.some(doc => doc.driveFileId === driveFile.id);
          
          const parentFolderName = driveFile.parentFolderName || '';
          const matchedMonth = monthNameFallback(parentFolderName);

          if (!exists) {
            const name = finalDriveName.split('_').slice(3, -1).join(' ') || finalDriveName.split('.')[0];

            await addDoc(collection(db, 'documents'), {
              name: name.toUpperCase(),
              category: cat.name,
              activityCode: activityCode,
              year: year,
              month: matchedMonth,
              updateDate: new Date(driveFile.createdTime).toISOString().split('T')[0],
              size: driveFile.size ? (parseInt(driveFile.size) / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB',
              fileName: finalDriveName,
              driveFileId: driveFile.id,
              url: driveFile.webViewLink,
              parentFolderId: driveFile.parentFolderId || '',
              customFolderName: parentFolderName,
              createdAt: new Date().toISOString(),
              uploadedBy: user.uid,
              uploaderName: user.displayName || 'Sistem Sync'
            });
            addedCount++;
          } else {
            // If already exists but name changed, update Firestore
            const existingDoc = documents.find(doc => doc.driveFileId === driveFile.id);
            if (existingDoc && existingDoc.fileName !== finalDriveName) {
              await updateDoc(doc(db, 'documents', existingDoc.id), {
                fileName: finalDriveName,
                name: finalDriveName.split('_').slice(3, -1).join(' ').toUpperCase() || existingDoc.name
              });
            }
          }
        }
      }
      setSyncStatus({ message: `Sinkronisasi selesai! ${addedCount} dokumen baru berhasil didaftarkan.`, type: 'success' });
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (error: any) {
      console.error('Sync Error:', error);
      if (
        error.message?.includes('SESI_DRIVE_BERAKHIR') ||
        error.message?.includes('401') ||
        error.message?.includes('Sesi Google Drive telah berakhir')
      ) {
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_drive_token');
        setIsAuthExpired(true);
      }
      setSyncStatus({ message: 'Terjadi kesalahan saat sinkronisasi: ' + error.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCleanupFolders = async () => {
    if (!googleAccessToken) {
      setSyncStatus({ message: 'Silakan hubungkan ke Google Drive terlebih dahulu.', type: 'error' });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ message: 'Memulai pembersihan data folder...', type: 'info' });
    let deletedCount = 0;

    try {
      // 1. Get all folder IDs in the sync scope
      let allFolderIds: string[] = [];
      for (const cat of categories) {
        const folderId = getFolderId(cat.url);
        if (folderId) {
          const ids = await fetchAllFolderIdsRecursively(folderId, googleAccessToken);
          allFolderIds = [...allFolderIds, ...ids];
        }
      }
      
      const folderIdSet = new Set(allFolderIds);
      
      // 2. Check each document in Firestore
      for (const docItem of documents) {
        if (docItem.driveFileId && folderIdSet.has(docItem.driveFileId)) {
          await deleteDoc(doc(db, 'documents', docItem.id));
          deletedCount++;
        }
      }
      
      setSyncStatus({ message: `Pembersihan selesai! ${deletedCount} data folder berhasil dihapus dari database.`, type: 'success' });
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (error: any) {
      console.error('Cleanup Error:', error);
      if (
        error.message?.includes('SESI_DRIVE_BERAKHIR') ||
        error.message?.includes('401') ||
        error.message?.includes('Sesi Google Drive telah berakhir')
      ) {
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_drive_token');
        setIsAuthExpired(true);
      }
      setSyncStatus({ message: 'Terjadi kesalahan saat pembersihan: ' + error.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const getDocJenisAsn = (doc: any): string | null => {
    if (doc.jenisAsn && doc.jenisAsn.trim()) return doc.jenisAsn.trim();
    const text = `${doc.fileName || ''} ${doc.name || ''}`.toUpperCase();
    if (text.includes('PPPK PARUH WAKTU') || text.includes('PARUH WAKTU')) return 'PPPK Paruh Waktu';
    if (text.includes('PPPK') || text.includes('P3K')) return 'PPPK';
    if (text.includes('PNS') || text.includes('CPNS')) return 'PNS';
    return null;
  };

  const getDocDateString = (doc: any): string | null => {
    if (doc.updateDate) return doc.updateDate;
    if (doc.createdAt) {
      if (typeof doc.createdAt === 'string') return doc.createdAt.split('T')[0];
      if (doc.createdAt.toDate) {
        try {
          return doc.createdAt.toDate().toISOString().split('T')[0];
        } catch (e) {
          // ignore
        }
      }
    }
    return null;
  };

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYear = new Date().getFullYear().toString();
    years.add(currentYear);
    documents.forEach(d => {
      if (d.year) years.add(d.year.toString());
    });
    return Array.from(years).sort().reverse();
  }, [documents]);

  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      // 1. Keyword search (Name, FileName, Category, ActivityCode, Uploader, ASN, Year, Month)
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const docName = (doc.name || '').toLowerCase();
        const fileName = (doc.fileName || '').toLowerCase();
        const cat = (doc.category || '').toLowerCase();
        const act = (doc.activityCode || '').toLowerCase();
        const uploader = (doc.uploaderName || '').toLowerCase();
        const asn = (getDocJenisAsn(doc) || '').toLowerCase();
        const yr = (doc.year || '').toString().toLowerCase();
        const mo = (doc.month || '').toLowerCase();
        const folder = (doc.customFolderName || '').toLowerCase();

        const matchesKeyword = 
          docName.includes(q) ||
          fileName.includes(q) ||
          cat.includes(q) ||
          act.includes(q) ||
          uploader.includes(q) ||
          asn.includes(q) ||
          yr.includes(q) ||
          mo.includes(q) ||
          folder.includes(q);

        if (!matchesKeyword) return false;
      }

      // 2. Category Filter
      if (filterCategory !== 'all') {
        if (filterCategory === 'my_drive') {
          const isPersonal = doc.storageTarget === 'my_drive' || doc.isPersonalDrive === true || (personalDriveFolderId && doc.parentFolderId === personalDriveFolderId);
          if (!isPersonal) return false;
        } else if (doc.category !== filterCategory) {
          return false;
        }
      }

      // 3. Jenis ASN Filter
      if (filterJenisAsn !== 'all') {
        const docAsn = getDocJenisAsn(doc);
        if (docAsn !== filterJenisAsn) return false;
      }

      // 4. Year Filter
      if (filterYear !== 'all') {
        const docYr = doc.year ? doc.year.toString() : '';
        if (docYr !== filterYear) return false;
      }

      // 5. Date Range Filter
      if (filterStartDate || filterEndDate) {
        const docDate = getDocDateString(doc);
        if (!docDate) return false;
        if (filterStartDate && docDate < filterStartDate) return false;
        if (filterEndDate && docDate > filterEndDate) return false;
      }

      return true;
    });
  }, [documents, search, filterCategory, filterJenisAsn, filterYear, filterStartDate, filterEndDate]);

  const activeFilterCount = useMemo(() => {
    return (
      (filterCategory !== 'all' ? 1 : 0) +
      (filterJenisAsn !== 'all' ? 1 : 0) +
      (filterYear !== 'all' ? 1 : 0) +
      (filterStartDate ? 1 : 0) +
      (filterEndDate ? 1 : 0)
    );
  }, [filterCategory, filterJenisAsn, filterYear, filterStartDate, filterEndDate]);

  const handleResetFilters = () => {
    setSearch('');
    setFilterCategory('all');
    setFilterJenisAsn('all');
    setFilterYear('all');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  const handlePresetDateRange = (preset: 'today' | '7days' | '30days' | 'thisMonth' | 'thisYear' | 'all') => {
    const now = new Date();
    const toIso = (d: Date) => d.toISOString().split('T')[0];
    const todayStr = toIso(now);

    if (preset === 'all') {
      setFilterStartDate('');
      setFilterEndDate('');
      return;
    }

    if (preset === 'today') {
      setFilterStartDate(todayStr);
      setFilterEndDate(todayStr);
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      setFilterStartDate(toIso(past));
      setFilterEndDate(todayStr);
    } else if (preset === '30days') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      setFilterStartDate(toIso(past));
      setFilterEndDate(todayStr);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setFilterStartDate(toIso(firstDay));
      setFilterEndDate(todayStr);
    } else if (preset === 'thisYear') {
      const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
      setFilterStartDate(toIso(firstDayOfYear));
      setFilterEndDate(todayStr);
    }
  };

  const getCategoryCount = (catName: string) => {
    return documents.filter(d => d.category === catName).length;
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-black tracking-tight">PUSAT DATA DIGITAL</h1>
          <p className="text-zinc-500 mt-2">Kelola dokumen dan arsip kepegawaian secara terintegrasi dengan Google Drive.</p>
        </div>
        <div className="flex items-center gap-4">
          {!googleAccessToken ? (
            <button 
              onClick={() => handleConnectDrive(false)}
              className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-zinc-200 text-zinc-600 font-bold rounded-2xl hover:border-yellow-400 hover:text-black transition-all shadow-sm"
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="Drive" className="w-full h-full" />
              </div>
              HUBUNGKAN DRIVE
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 text-xs font-bold rounded-xl border border-green-100">
                <CheckCircle2 size={14} /> TERHUBUNG KE DRIVE
              </div>
              {driveQuota && (
                <button
                  type="button"
                  onClick={() => setShowQuotaModal(true)}
                  title="Klik untuk melihat rincian kapasitas & ganti akun Google Drive"
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl border transition-all hover:scale-105 active:scale-95",
                    driveQuota.isExceeded 
                      ? "bg-red-50 text-red-700 border-red-200" 
                      : driveQuota.percentUsed > 85 
                        ? "bg-amber-50 text-amber-800 border-amber-200" 
                        : "bg-zinc-50 text-zinc-600 border-zinc-200"
                  )}
                >
                  <HardDrive size={14} className={driveQuota.isExceeded ? "text-red-600 animate-pulse" : "text-zinc-500"} />
                  <span>
                    Drive: <strong className={driveQuota.isExceeded ? "text-red-700 font-black" : ""}>{driveQuota.usageFormatted} / {driveQuota.limitFormatted}</strong>
                  </span>
                  {driveQuota.isExceeded ? (
                    <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[9px] font-black uppercase tracking-wider">
                      PENUH
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-400">({driveQuota.percentUsed}%)</span>
                  )}
                  <Info size={12} className="text-zinc-400" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                title="Beralih Penyimpanan atau Pengaturan Folder Google Drive"
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-yellow-400 hover:text-black text-zinc-700 text-xs font-bold rounded-xl border border-zinc-200 transition-all shadow-sm active:scale-95"
              >
                <Settings size={14} />
                <span className="hidden sm:inline">Beralih / Atur Drive</span>
              </button>
            </div>
          )}
          {isAuthorized && (
            <div className="flex items-center gap-3">
              <button 
                onClick={handleCleanupFolders}
                disabled={isSyncing}
                title="Bersihkan data folder yang terlanjur tersinkron"
                className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-red-100 text-red-500 font-bold rounded-2xl hover:bg-red-50 transition-all disabled:opacity-50"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={handleSyncDrive}
                disabled={isSyncing}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-black transition-all shadow-lg disabled:opacity-50"
              >
                {isSyncing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Clock size={18} />
                )}
                SINKRONKAN DRIVE
              </button>
            </div>
          )}
        </div>
      </header>

      <AnimatePresence>
        {syncStatus && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`p-4 rounded-2xl border flex items-center justify-between ${
              syncStatus.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' :
              syncStatus.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' :
              'bg-blue-50 border-blue-100 text-blue-700'
            }`}
          >
            <div className="flex items-center gap-3">
              {syncStatus.type === 'info' && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              <span className="text-sm font-bold">{syncStatus.message}</span>
            </div>
            <button onClick={() => setSyncStatus(null)} className="opacity-50 hover:opacity-100">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-black">Tambah Dokumen Baru</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleAddDocument} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                {(!googleAccessToken || isAuthExpired) && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                    <Info className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        {isAuthExpired ? 'Sesi Google Drive Berakhir (HTTP 401)' : 'Drive Belum Terhubung'}
                      </p>
                      <p className="text-[10px] text-amber-700 leading-relaxed">
                        {isAuthExpired 
                          ? 'Token otentikasi Google Drive Anda telah kedaluwarsa. Silakan klik Hubungkan Sekarang untuk memperbarui sesi login.'
                          : 'Anda harus menghubungkan akun ke Google Drive sebelum dapat mengunggah dokumen.'}
                      </p>
                      <button 
                        type="button"
                        onClick={() => handleConnectDrive(false)}
                        className="text-[10px] font-black text-amber-900 underline underline-offset-2 hover:text-amber-600 flex items-center gap-1 mt-1"
                      >
                        <RefreshCw size={12} /> HUBUNGKAN SEKARANG
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Kategori</label>
                    <select 
                      value={newDoc.category}
                      onChange={e => {
                        const cat = e.target.value;
                        setNewDoc({...newDoc, category: cat, activityCode: ACTIVITY_CODES[cat]?.[0]?.code || '01'});
                      }}
                      className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400"
                    >
                      {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Kode Kegiatan</label>
                    <select 
                      value={newDoc.activityCode}
                      onChange={e => setNewDoc({...newDoc, activityCode: e.target.value})}
                      className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400"
                    >
                      {ACTIVITY_CODES[newDoc.category]?.map(item => (
                        <option key={item.code} value={item.code}>{item.code} - {item.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {newDoc.category === 'Informasi Kepegawaiaan' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Jenis ASN</label>
                    <select 
                      value={newDoc.jenisAsn}
                      onChange={e => setNewDoc({...newDoc, jenisAsn: e.target.value})}
                      className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400"
                    >
                      <option value="PNS">PNS</option>
                      <option value="PPPK">PPPK</option>
                      <option value="PPPK PW">PPPK PW</option>
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {newDoc.category !== 'Pengadaan Pegawai' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                        Periode Bulan
                      </label>
                      <select 
                        value={newDoc.month}
                        onChange={e => setNewDoc({...newDoc, month: e.target.value})}
                        className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400"
                      >
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  )}
                  <div className={cn("space-y-1", newDoc.category === 'Pengadaan Pegawai' ? "col-span-2" : "")}>
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Periode Tahun</label>
                    <input 
                      required
                      type="number" 
                      value={newDoc.year}
                      onChange={e => setNewDoc({...newDoc, year: e.target.value})}
                      className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400"
                      placeholder="Contoh: 2024"
                    />
                  </div>
                </div>

                {/* Pengorganisasian Folder Kustom / Nama Proyek Spesifik (Untuk Semua Kategori DataCenter) */}
                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200/80 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-yellow-400/20 text-yellow-700 flex items-center justify-center">
                        <FolderPlus size={16} />
                      </div>
                      <div>
                        <label className="text-xs font-black uppercase tracking-wider text-zinc-800">
                          Folder Kustom / Nama Proyek
                        </label>
                        <p className="text-[11px] text-zinc-500">
                          Organisir dokumen sesuai nama proyek atau kegiatan spesifik
                        </p>
                      </div>
                    </div>
                    {newDoc.useCustomFolder && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-yellow-400 text-black">
                        Folder Kustom Aktif
                      </span>
                    )}
                  </div>

                  {/* Mode Pilihan: Standar vs Folder Kustom */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewDoc({ ...newDoc, useCustomFolder: false, customFolderName: '' })}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        !newDoc.useCustomFolder 
                          ? "bg-black text-white border-black shadow-sm" 
                          : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                      )}
                    >
                      <FolderOpen size={14} /> 
                      {newDoc.category === 'Pengadaan Pegawai' ? 'Folder Utama (Root)' : 'Folder Standar (Bulan)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewDoc({ ...newDoc, useCustomFolder: true })}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        newDoc.useCustomFolder 
                          ? "bg-yellow-400 text-black border-yellow-500 shadow-sm" 
                          : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                      )}
                    >
                      <FolderPlus size={14} className={newDoc.useCustomFolder ? "text-black" : "text-zinc-500"} /> 
                      Folder Kustom / Proyek
                    </button>
                  </div>

                  {newDoc.useCustomFolder && (() => {
                    const existingFolders = Array.from(new Set(
                      documents
                        .filter(d => 
                          d.category === newDoc.category && 
                          d.activityCode === newDoc.activityCode && 
                          d.year === newDoc.year && 
                          d.customFolderName &&
                          !MONTHS.includes(d.customFolderName)
                        )
                        .map(d => d.customFolderName)
                    ));

                    return (
                      <div className="space-y-3 pt-2 border-t border-zinc-200/80 animate-in fade-in duration-200">
                        {existingFolders.length > 0 && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                              Pilih Folder Kustom yang Sudah Ada
                            </label>
                            <select 
                              value={existingFolders.includes(newDoc.customFolderName) ? newDoc.customFolderName : ""}
                              onChange={e => {
                                const val = e.target.value;
                                if (val) {
                                  setNewDoc({ ...newDoc, customFolderName: val });
                                }
                              }}
                              className="w-full p-2.5 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-yellow-400 text-sm font-medium"
                            >
                              <option value="">-- Atau Ketik Nama Folder Baru di Bawah --</option>
                              {existingFolders.map(folder => (
                                <option key={folder} value={folder}>📁 {folder}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center justify-between">
                            <span>Nama Folder Kustom / Proyek Baru</span>
                            <span className="text-amber-600 font-bold">*Wajib diisi</span>
                          </label>
                          <div className="relative">
                            <input 
                              required={newDoc.useCustomFolder}
                              type="text" 
                              value={newDoc.customFolderName}
                              onChange={e => setNewDoc({ ...newDoc, customFolderName: e.target.value.toUpperCase() })}
                              className="w-full p-2.5 pl-9 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-yellow-400 text-sm font-medium uppercase placeholder:normal-case"
                              placeholder="Contoh: PROYEK ANALISIS KEBUTUHAN ASN, SELEKSI TERBUKA JPT"
                            />
                            <FolderPlus size={15} className="absolute left-3 top-3 text-zinc-400" />
                          </div>
                          <p className="text-[10px] text-zinc-400">
                            Folder ini akan dibuat otomatis di Google Drive dan terdaftar sebagai folder proyek di menu Pusat Data.
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                    {files.length > 1 ? 'Nama Folder / Nama Kelompok' : 'Nama File Baru'}
                  </label>
                  <input 
                    required
                    type="text" 
                    value={newDoc.name}
                    onChange={e => setNewDoc({...newDoc, name: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400"
                    placeholder={files.length > 1 ? "Contoh: BERKAS SELEKSI KOMPETENSI" : "Contoh: SK KENAIKAN PANGKAT"}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Ukuran File (Opsional)</label>
                  <input 
                    type="text" 
                    value={newDoc.size}
                    onChange={e => setNewDoc({...newDoc, size: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400"
                    placeholder="Contoh: 2.4 MB"
                  />
                </div>

                <div className="space-y-1 pt-4 border-t border-zinc-100">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 text-center block w-full">Upload Berkas (Wajib)</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      multiple
                      onChange={e => {
                        const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
                        setFiles(selectedFiles);
                        if (selectedFiles.length === 1) {
                          if (!newDoc.name) {
                            const nameWithoutExt = selectedFiles[0].name.split('.').slice(0, -1).join('.');
                            setNewDoc(prev => ({ ...prev, name: nameWithoutExt.toUpperCase() }));
                          }
                        }
                      }}
                      className="hidden"
                      id="file-upload"
                    />
                    <label 
                      htmlFor="file-upload"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const droppedFiles = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
                        if (droppedFiles.length > 0) {
                          setFiles(droppedFiles);
                          if (droppedFiles.length === 1 && !newDoc.name) {
                            const nameWithoutExt = droppedFiles[0].name.split('.').slice(0, -1).join('.');
                            setNewDoc(prev => ({ ...prev, name: nameWithoutExt.toUpperCase() }));
                          }
                        }
                      }}
                      className={cn(
                        "w-full p-4 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all",
                        files.length > 0 ? "border-yellow-400 bg-yellow-50" : "border-zinc-200 hover:border-yellow-400 hover:bg-zinc-50"
                      )}
                    >
                      <Upload className={files.length > 0 ? "text-yellow-600" : "text-zinc-400"} size={24} />
                      <span className="text-sm font-medium text-zinc-600 text-center">
                        {files.length > 0 
                          ? `${files.length} file dipilih: ${files.map(f => f.name).join(', ').substring(0, 50)}${files.map(f => f.name).join(', ').length > 50 ? '...' : ''}` 
                          : 'Klik untuk pilih file (bisa banyak) atau seret ke sini'}
                      </span>
                    </label>
                  </div>

                  {/* Target Folder Selector */}
                  <div className="pt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tujuan Penyimpanan Drive</label>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {uploadTarget === 'shared' ? 'Folder Bersama Kategori' : 'My Drive Akun Pribadi'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setUploadTarget('shared')}
                        className={cn(
                          "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                          uploadTarget === 'shared' 
                            ? "bg-black text-white border-black shadow-sm" 
                            : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                        )}
                      >
                        <FolderOpen size={14} /> Folder Kategori
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadTarget('my_drive');
                          setIsPersonalDriveEnabled(true);
                          localStorage.setItem('cloudp_personal_drive_enabled_' + (user?.uid || 'user'), 'true');
                        }}
                        className={cn(
                          "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                          uploadTarget === 'my_drive' 
                            ? "bg-black text-white border-black shadow-sm" 
                            : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                        )}
                      >
                        <HardDrive size={14} /> My Drive Pribadi
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400">
                      {uploadTarget === 'shared' 
                        ? 'Tersimpan di folder kategori Cloud-P. Jika kuota pemilik folder penuh, gunakan opsi "My Drive Pribadi".' 
                        : 'Tersimpan otomatis di folder "Cloud-P Dokumen" di Google Drive pribadi Anda.'}
                    </p>
                    {uploadTarget === 'my_drive' && (
                      <div className="p-2.5 bg-yellow-50 border border-yellow-200/80 rounded-xl flex items-center gap-2 text-[11px] font-bold text-yellow-900 animate-in fade-in">
                        <CheckCircle2 size={14} className="text-yellow-600 shrink-0" />
                        <span>
                          Kartu Jembatan atas nama <strong>{userDriveName}</strong> aktif di menu Pusat Data & Arsip Digital!
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {isSubmitting && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                        <span className={cn(
                          "transition-colors",
                          uploadStatus === 'error' ? "text-red-500" : "text-zinc-500"
                        )}>
                          {uploadStatus === 'uploading' ? `Mengunggah ke Drive... ${uploadProgress}%` : 
                           uploadStatus === 'saving' ? 'Menyimpan Data ke Sistem...' : 
                           uploadStatus === 'success' ? 'Berhasil!' : 'Terjadi Kesalahan'}
                        </span>
                        <span className="text-yellow-600">{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          className={cn(
                            "h-full transition-all duration-300",
                            uploadStatus === 'success' ? "bg-green-500" : 
                            uploadStatus === 'error' ? "bg-red-500" : "bg-yellow-400"
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {isAuthExpired && (
                    <div className="p-4 bg-amber-50/95 border-2 border-amber-300 rounded-2xl space-y-3 mt-3 animate-in fade-in duration-300">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
                        <div className="space-y-1 text-left flex-1">
                          <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                            Sesi Google Drive Berakhir (HTTP 401)
                          </h4>
                          <p className="text-xs text-amber-900/90 leading-relaxed">
                            Token otorisasi Google Drive Anda telah berakhir demi keamanan. Silakan klik tombol di bawah ini untuk menghubungkan ulang akun Anda. File dan data yang telah Anda pilih tidak akan hilang.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const token = await handleConnectDrive(false);
                          if (token) {
                            setIsAuthExpired(false);
                            setErrorMessage(null);
                            setUploadStatus('idle');
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-yellow-400 hover:bg-yellow-500 text-black font-black rounded-xl text-xs tracking-wider transition-all shadow-md active:scale-95"
                      >
                        <RefreshCw size={15} /> HUBUNGKAN ULANG GOOGLE DRIVE SEKARANG
                      </button>
                    </div>
                  )}

                  {uploadStatus === 'error' && errorMessage && !isQuotaExceeded && !isAuthExpired && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-bold flex items-center gap-2">
                      <AlertTriangle size={16} className="shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {isQuotaExceeded && (
                    <div className="p-4 bg-amber-50/95 border-2 border-amber-300 rounded-2xl space-y-3.5 mt-3 animate-in fade-in duration-300">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
                        <div className="space-y-1.5 text-left flex-1">
                          <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                            Penyimpanan Google Penuh (Storage Quota Exceeded)
                          </h4>
                          <p className="text-xs text-amber-900/90 leading-relaxed">
                            Google API menolak penambahan file/folder baru karena kapasitas akun Google telah mencapai batas maksimal (15 GB).
                          </p>

                          {driveQuota && (
                            <div className="p-3 bg-white/95 rounded-xl border border-amber-200 text-xs text-zinc-700 space-y-2 mt-1 shadow-sm">
                              <div className="flex justify-between items-center text-[11px] pb-1 border-b border-zinc-100">
                                <span className="text-zinc-500 font-medium">Akun Google:</span>
                                <span className="font-bold text-zinc-800 truncate max-w-[180px]">{driveQuota.userEmail}</span>
                              </div>
                              <div className="flex justify-between font-bold">
                                <span>Total Akun Google (Drive+Gmail+Foto):</span>
                                <span className="text-red-600 font-black">{driveQuota.usageFormatted} / {driveQuota.limitFormatted}</span>
                              </div>
                              <div className="flex justify-between text-[11px] text-zinc-600">
                                <span>Khusus File Google Drive:</span>
                                <span className="font-bold text-zinc-800">{driveQuota.usageInDriveFormatted}</span>
                              </div>
                              {driveQuota.usageInDriveTrash > 0 && (
                                <div className="flex justify-between text-[11px] text-amber-800">
                                  <span>Sampah di Drive (Trash):</span>
                                  <span className="font-bold">{driveQuota.trashFormatted} (bisa dikosongkan)</span>
                                </div>
                              )}
                              <p className="text-[10px] text-zinc-500 leading-tight pt-1 border-t border-zinc-100 italic">
                                *Catatan: Jika file Drive Anda baru 6 GB, penyebab batas 15 GB terlampaui adalah akumulasi bersama dari Gmail (lampiran email) dan Google Photos.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 pt-1 border-t border-amber-200">
                        <p className="text-[11px] font-bold text-amber-900">Solusi & Tindakan Cepat:</p>
                        
                        {uploadTarget === 'shared' && (
                          <button
                            type="button"
                            onClick={() => handleAddDocument(undefined, 'my_drive')}
                            disabled={isSubmitting}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-900 hover:bg-black text-white font-black rounded-xl text-xs tracking-wider transition-all shadow-md"
                          >
                            <HardDrive size={15} /> 1. COBA UNGGAH KE MY DRIVE PRIBADI
                          </button>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleConnectDrive(true)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white hover:bg-yellow-400 hover:text-black border border-zinc-300 text-zinc-800 rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            <RefreshCw size={13} /> Ganti Akun Google
                          </button>
                          <a 
                            href="https://drive.google.com/drive/trash" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all text-center"
                          >
                            <Trash2 size={13} /> Kosongkan Sampah ↗
                          </a>
                        </div>
                        
                        <button
                          type="button"
                          onClick={handleSaveWithoutDriveUpload}
                          disabled={isSubmitting}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-xs tracking-wider transition-all shadow-md shadow-amber-500/20"
                        >
                          <Database size={14} /> TETAP SIMPAN DATA DOKUMEN KE CLOUD-P
                        </button>
                        <p className="text-[10px] text-amber-700 text-center">
                          Data formulir tetap tersimpan aman di database Cloud-P tanpa mengunggah file fisik ke Drive.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <button 
                  disabled={isSubmitting}
                  className={cn(
                    "w-full py-4 text-white font-black rounded-2xl transition-all mt-4 disabled:opacity-50 flex items-center justify-center gap-2",
                    uploadStatus === 'success' ? "bg-green-500" : 
                    uploadStatus === 'error' ? "bg-red-500" : "bg-black hover:bg-zinc-800"
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {uploadStatus === 'uploading' ? 'Mengunggah...' : 'Menyimpan...'}
                    </>
                  ) : uploadStatus === 'success' ? (
                    <>
                      <CheckCircle2 size={20} /> BERHASIL DISIMPAN
                    </>
                  ) : uploadStatus === 'error' ? (
                    <>
                      <RefreshCw size={18} /> COBA UNGGAH ULANG
                    </>
                  ) : 'SIMPAN DOKUMEN'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {viewState.view !== 'main' && (
        <button 
          onClick={() => {
            if (viewState.view === 'month') setViewState({ ...viewState, view: 'year', month: null });
            else if (viewState.view === 'year') setViewState({ ...viewState, view: 'activity', year: null });
            else if (viewState.view === 'activity') setViewState({ ...viewState, view: 'category', activity: null });
            else if (viewState.view === 'category') setViewState({ ...viewState, view: 'main', category: null });
          }}
          className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-black transition-colors mb-4"
        >
          <ArrowLeft size={16} /> Kembali
        </button>
      )}

      {viewState.view === 'main' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-xl flex items-center gap-2">
                  <BarChart3 className="text-yellow-500" /> Statistik Input Data
                </h3>
                <select className="bg-zinc-50 border-none text-sm font-medium rounded-lg px-3 py-1">
                  <option>6 Bulan Terakhir</option>
                </select>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="data" name="Input Dokumen" fill="#FACC15" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="requests" name="Permintaan Data" fill="#000000" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
              <h3 className="font-bold text-xl mb-8 flex items-center gap-2">
                <Database className="text-yellow-500" /> Distribusi Kategori Data
              </h3>
              <div className="h-[300px] w-full flex items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-4 pr-8">
                  {pieData.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-6", isPersonalDriveCardVisible ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
            {categories.map((cat, i) => (
              <motion.div 
                whileHover={{ y: -5 }}
                key={i} 
                onClick={() => setViewState({ ...viewState, view: 'category', category: cat.name })}
                className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="w-14 h-14 bg-yellow-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <cat.icon size={28} />
                </div>
                <h3 className="font-bold text-xl">{cat.name}</h3>
                <p className="text-sm text-zinc-400 mt-2">{getCategoryCount(cat.name)} File Tersimpan</p>
                <div className="mt-6 flex items-center text-xs font-bold text-yellow-600 uppercase tracking-wider">
                  Buka Kegiatan <ChevronRight size={14} />
                </div>
              </motion.div>
            ))}

            {/* Kartu Jembatan Google Drive Pribadi User */}
            {isPersonalDriveCardVisible && (
              <motion.div 
                whileHover={{ y: -5 }}
                className="relative bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-white p-8 rounded-3xl border-2 border-yellow-400/50 shadow-xl hover:shadow-2xl hover:border-yellow-400 transition-all cursor-pointer group overflow-hidden flex flex-col justify-between"
                onClick={() => window.open(personalDriveUrl, '_blank')}
                title="Buka Google Drive Pribadi Anda"
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-400/10 rounded-full blur-2xl pointer-events-none" />

                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-14 h-14 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center p-3 border border-white/10 group-hover:scale-110 transition-transform shadow-inner">
                      <img 
                        src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" 
                        alt="Google Drive" 
                        className="w-full h-full object-contain" 
                      />
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-yellow-400 text-black border border-yellow-300 shadow-sm flex items-center gap-1">
                      <HardDrive size={11} /> Jembatan Drive
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-black text-xl text-white group-hover:text-yellow-400 transition-colors flex items-center gap-1.5 truncate">
                      Drive Pribadi
                    </h3>
                    <p className="text-xs font-bold text-zinc-300 truncate" title={userDriveName}>
                      {userDriveName}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate mt-1">
                      Folder: <span className="text-yellow-300 font-mono">Cloud-P Dokumen</span>
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400">
                    <strong className="text-white">{personalDocs.length}</strong> File Tersimpan
                  </span>
                  <div className="flex items-center gap-1 text-xs font-black text-yellow-400 group-hover:translate-x-1 transition-transform">
                    <span>Buka Drive</span>
                    <ExternalLink size={13} />
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </>
      ) : viewState.view === 'category' ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4 mb-2">
            <button 
              onClick={() => setViewState({ ...viewState, view: 'main', category: null })}
              className="p-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-2xl font-black">{viewState.category}</h2>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-zinc-500 font-medium">Pilih sub-kegiatan di bawah ini</p>
            <button 
              onClick={() => {
                setNewDoc({ 
                  ...newDoc, 
                  category: viewState.category!, 
                  activityCode: ACTIVITY_CODES[viewState.category!][0].code,
                  jenisAsn: 'PNS',
                  useCustomFolder: false,
                  customFolderName: ''
                });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-500 transition-all shadow-lg shadow-yellow-400/20"
            >
              <PlusCircle size={20} /> TAMBAH DOKUMEN
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {ACTIVITY_CODES[viewState.category!]?.map((activity, i) => (
              <motion.div 
                whileHover={{ y: -5 }}
                key={i} 
                onClick={() => setViewState({ ...viewState, view: 'activity', activity: activity.code })}
                className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-yellow-100 transition-colors">
                  <FileText className="text-zinc-400 group-hover:text-yellow-600" size={24} />
                </div>
                <h3 className="font-bold text-lg leading-tight">{activity.label}</h3>
                <div className="mt-6 flex items-center text-xs font-bold text-zinc-400 uppercase tracking-wider group-hover:text-yellow-600">
                  Lihat Periode <ChevronRight size={14} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : viewState.view === 'activity' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setViewState({ ...viewState, view: 'category', activity: null })}
                className="p-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-2xl font-black">{ACTIVITY_CODES[viewState.category!]?.find(a => a.code === viewState.activity)?.label}</h2>
                <p className="text-zinc-500">Pilih periode tahun dokumen</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setNewDoc({ 
                  ...newDoc, 
                  category: viewState.category!, 
                  activityCode: viewState.activity!,
                  jenisAsn: 'PNS',
                  useCustomFolder: false,
                  customFolderName: ''
                });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-500 transition-all shadow-lg shadow-yellow-400/20"
            >
              <PlusCircle size={20} /> TAMBAH DOKUMEN
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {(() => {
              const defaultYears = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
              const docYears = documents
                .filter(d => d.category === viewState.category && d.activityCode === viewState.activity)
                .map(d => d.year);
              const allYears = Array.from(new Set([...defaultYears, ...docYears])).sort((a, b) => Number(b) - Number(a));
              
              return allYears.map(year => (
                <button 
                  key={year}
                  onClick={() => setViewState({ ...viewState, view: 'year', year: year })}
                  className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:border-yellow-400 hover:shadow-md transition-all text-center group"
                >
                  <span className="text-xl font-black group-hover:text-yellow-600">{year}</span>
                </button>
              ));
            })()}
          </div>
        </div>
      ) : viewState.view === 'year' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setViewState({ ...viewState, view: 'activity', year: null })}
                className="p-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-2xl font-black">Periode {viewState.year}</h2>
                <p className="text-zinc-500">{ACTIVITY_CODES[viewState.category!]?.find(a => a.code === viewState.activity)?.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => {
                  setNewDoc({ 
                    ...newDoc, 
                    category: viewState.category!, 
                    activityCode: viewState.activity!, 
                    year: viewState.year!,
                    jenisAsn: 'PNS',
                    useCustomFolder: true,
                    customFolderName: ''
                  });
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-zinc-200 hover:border-yellow-400 text-zinc-800 font-bold rounded-2xl transition-all shadow-sm active:scale-95"
                title="Buat folder kustom baru untuk mengelompokkan dokumen proyek atau kegiatan spesifik"
              >
                <FolderPlus size={18} className="text-yellow-600" />
                <span className="hidden sm:inline">BUAT FOLDER PROYEK</span>
              </button>
              <button 
                onClick={() => {
                  setNewDoc({ 
                    ...newDoc, 
                    category: viewState.category!, 
                    activityCode: viewState.activity!, 
                    year: viewState.year!,
                    jenisAsn: 'PNS',
                    useCustomFolder: false,
                    customFolderName: ''
                  });
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-500 transition-all shadow-lg shadow-yellow-400/20 active:scale-95"
              >
                <PlusCircle size={20} /> TAMBAH DOKUMEN
              </button>
            </div>
          </div>
          
          {(() => {
            const yearDocs = documents.filter(d => 
              d.category === viewState.category && 
              d.activityCode === viewState.activity && 
              d.year === viewState.year
            );
            
            const customFolders = Array.from(new Set(
              yearDocs
                .filter(d => d.customFolderName && !MONTHS.includes(d.customFolderName))
                .map(d => d.customFolderName)
            ));
            
            const pengadaanRootDocs = yearDocs.filter(d => !d.customFolderName);

            return (
              <div className="space-y-8">
                {/* Bagian Folder Kustom / Proyek Spesifik (Tampil untuk semua kategori jika ada) */}
                {customFolders.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FolderPlus className="text-yellow-600" size={18} />
                        <h3 className="font-black text-sm uppercase tracking-wider text-zinc-700">
                          Folder Kustom & Proyek Spesifik ({customFolders.length})
                        </h3>
                      </div>
                      <span className="text-xs font-bold text-zinc-400">
                        Klik folder untuk membuka dokumen proyek
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {customFolders.map(folder => {
                        const countInFolder = yearDocs.filter(d => d.customFolderName === folder).length;
                        return (
                          <motion.button 
                            key={folder}
                            whileHover={{ y: -5 }}
                            onClick={() => setViewState({ ...viewState, view: 'customFolder', customFolder: folder })}
                            className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm hover:border-yellow-400 hover:shadow-md transition-all flex items-center justify-between text-left group"
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:bg-yellow-100 group-hover:text-yellow-600 shrink-0">
                                <FolderPlus size={22} />
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-sm leading-tight uppercase line-clamp-2 text-zinc-900 group-hover:text-yellow-600">
                                  {folder}
                                </span>
                                <span className="text-[11px] text-zinc-400 font-medium">
                                  {countInFolder} Dokumen
                                </span>
                              </div>
                            </div>
                            <ChevronRight size={16} className="text-zinc-300 group-hover:text-yellow-600 shrink-0 ml-2" />
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Untuk Kategori Berbasis Bulan (Informasi Kepegawaiaan & Kinerja Pegawai) */}
                {viewState.category !== 'Pengadaan Pegawai' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="text-zinc-500" size={18} />
                        <h3 className="font-black text-sm uppercase tracking-wider text-zinc-700">
                          Berdasarkan Periode Bulan
                        </h3>
                      </div>
                      <span className="text-xs font-bold text-zinc-400">Pilih bulan dokumen</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {MONTHS.map(month => {
                        const countInMonth = yearDocs.filter(d => d.month === month || d.customFolderName === month).length;
                        return (
                          <button 
                            key={month}
                            onClick={() => setViewState({ ...viewState, view: 'month', month: month })}
                            className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:border-yellow-400 hover:shadow-md transition-all text-center group flex flex-col items-center justify-center"
                          >
                            <span className="font-bold group-hover:text-yellow-600">{month}</span>
                            <span className="text-[11px] text-zinc-400 font-medium mt-1">
                              {countInMonth} Dokumen
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Untuk Pengadaan Pegawai: Tampilkan Tabel Dokumen Tanpa Folder Kustom */
                  <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                      <h3 className="font-bold">Daftar Dokumen (Tanpa Folder Kustom)</h3>
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{pengadaanRootDocs.length} File</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-zinc-50 text-xs font-bold uppercase tracking-widest text-zinc-400">
                          <tr>
                            <th className="px-6 py-4">Nama File</th>
                            <th className="px-6 py-4">Update</th>
                            <th className="px-6 py-4">Oleh</th>
                            <th className="px-6 py-4 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {pengadaanRootDocs.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 text-sm">Belum ada dokumen di luar folder kustom tahun ini.</td>
                            </tr>
                          ) : pengadaanRootDocs.map((file, i) => (
                            <tr key={i} className="hover:bg-zinc-50 transition-colors group">
                              <td className="px-6 py-4">
                                <div 
                                  className="flex items-center gap-3 cursor-pointer group/item"
                                  onClick={() => setPreviewDoc(file)}
                                  title="Klik untuk pratinjau isi berkas"
                                >
                                  <FileText size={16} className="text-zinc-400 group-hover/item:text-yellow-600 transition-colors shrink-0" />
                                  <span className="text-sm font-bold group-hover/item:text-yellow-600 group-hover/item:underline">{file.fileName || file.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-zinc-500">
                                {file.updateDate ? new Date(file.updateDate).toLocaleDateString('id-ID') : '-'}
                              </td>
                              <td className="px-6 py-4 text-sm text-zinc-500">{file.uploaderName || 'Sistem'}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button 
                                    type="button"
                                    onClick={() => setPreviewDoc(file)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-[10px] font-black rounded-lg transition-all shadow-sm active:scale-95"
                                    title="Pratinjau isi dokumen langsung di aplikasi"
                                  >
                                    <Eye size={12} />
                                    <span>Pratinjau</span>
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => file.url && window.open(file.url, '_blank')}
                                    className="p-1.5 bg-zinc-900 hover:bg-black text-white rounded-lg transition-all disabled:opacity-30"
                                    disabled={!file.url}
                                    title="Buka di tab baru Google Drive"
                                  >
                                    <ExternalLink size={12} />
                                  </button>
                                  {file.parentFolderId && (
                                    <button 
                                      type="button"
                                      onClick={() => window.open(`https://drive.google.com/drive/folders/${file.parentFolderId}`, '_blank')}
                                      className="p-1.5 text-zinc-400 hover:text-yellow-600 rounded-lg hover:bg-zinc-100 transition-colors"
                                      title="Buka Folder Drive"
                                    >
                                      <FolderOpen size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : viewState.view === 'customFolder' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setViewState({ ...viewState, view: 'year', customFolder: null })}
                className="p-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-2xl font-black">{viewState.customFolder}</h2>
                <p className="text-zinc-500">{viewState.year} - {ACTIVITY_CODES[viewState.category!]?.find(a => a.code === viewState.activity)?.label}</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setNewDoc({ 
                  ...newDoc, 
                  category: viewState.category!, 
                  activityCode: viewState.activity!, 
                  year: viewState.year!,
                  jenisAsn: 'PNS',
                  useCustomFolder: true,
                  customFolderName: viewState.customFolder || ''
                });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-500 transition-all shadow-lg shadow-yellow-400/20"
            >
              <PlusCircle size={20} /> TAMBAH DOKUMEN
            </button>
          </div>
          
          <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="font-bold">Daftar Dokumen dalam Folder</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 text-xs font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-6 py-4">Nama File</th>
                    <th className="px-6 py-4">Update</th>
                    <th className="px-6 py-4">Oleh</th>
                    <th className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {(() => {
                    const folderDocs = documents.filter(d => 
                      d.category === viewState.category && 
                      d.activityCode === viewState.activity && 
                      d.year === viewState.year && 
                      d.customFolderName === viewState.customFolder
                    );

                    if (folderDocs.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 text-sm">
                            Belum ada dokumen di dalam folder proyek ini. Klik tombol Tambah Dokumen untuk mengunggah berkas.
                          </td>
                        </tr>
                      );
                    }

                    return folderDocs.map((file, i) => (
                      <tr key={i} className="hover:bg-zinc-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div 
                            className="flex items-center gap-3 cursor-pointer group/item"
                            onClick={() => setPreviewDoc(file)}
                            title="Klik untuk pratinjau isi berkas"
                          >
                            <FileText size={16} className="text-zinc-400 group-hover/item:text-yellow-600 transition-colors shrink-0" />
                            <span className="text-sm font-bold group-hover/item:text-yellow-600 group-hover/item:underline">{file.fileName || file.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">
                          {file.updateDate ? new Date(file.updateDate).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">{file.uploaderName || 'Sistem'}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              type="button"
                              onClick={() => setPreviewDoc(file)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-[10px] font-black rounded-lg transition-all shadow-sm active:scale-95"
                              title="Pratinjau isi dokumen langsung di aplikasi"
                            >
                              <Eye size={12} />
                              <span>Pratinjau</span>
                            </button>
                            <button 
                              type="button"
                              onClick={() => file.url && window.open(file.url, '_blank')}
                              className="p-1.5 bg-zinc-900 hover:bg-black text-white rounded-lg transition-all disabled:opacity-30"
                              disabled={!file.url}
                              title="Buka di tab baru Google Drive"
                            >
                              <ExternalLink size={12} />
                            </button>
                            {file.parentFolderId && (
                              <button 
                                type="button"
                                onClick={() => window.open(`https://drive.google.com/drive/folders/${file.parentFolderId}`, '_blank')}
                                className="p-1.5 text-zinc-400 hover:text-yellow-600 rounded-lg hover:bg-zinc-100 transition-colors"
                                title="Buka Folder Drive"
                              >
                                <FolderOpen size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setViewState({ ...viewState, view: 'year', month: null })}
                className="p-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2 className="text-2xl font-black">{viewState.month} {viewState.year}</h2>
                <p className="text-zinc-500">{ACTIVITY_CODES[viewState.category!]?.find(a => a.code === viewState.activity)?.label}</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setNewDoc({ 
                  ...newDoc, 
                  category: viewState.category!, 
                  activityCode: viewState.activity!, 
                  year: viewState.year!, 
                  month: viewState.month!,
                  jenisAsn: 'PNS',
                  useCustomFolder: false,
                  customFolderName: ''
                });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-yellow-400 text-black font-black rounded-2xl hover:bg-yellow-500 transition-all shadow-lg shadow-yellow-400/20"
            >
              <PlusCircle size={20} /> TAMBAH DOKUMEN
            </button>
          </div>
          <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100">
              <h3 className="font-bold">Daftar Dokumen</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 text-xs font-bold uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-6 py-4">Nama File</th>
                    <th className="px-6 py-4">Update</th>
                    <th className="px-6 py-4">Oleh</th>
                    <th className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {documents
                    .filter(d => 
                      d.category === viewState.category && 
                      d.activityCode === viewState.activity && 
                      d.year === viewState.year && 
                      (viewState.category === 'Pengadaan Pegawai' || d.month === viewState.month || d.customFolderName === viewState.month)
                    )
                    .map((file, i) => (
                      <tr key={i} className="hover:bg-zinc-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div 
                            className="flex items-center gap-3 cursor-pointer group/item"
                            onClick={() => setPreviewDoc(file)}
                            title="Klik untuk pratinjau isi berkas"
                          >
                            <FileText size={16} className="text-zinc-400 group-hover/item:text-yellow-600 transition-colors shrink-0" />
                            <span className="text-sm font-bold group-hover/item:text-yellow-600 group-hover/item:underline">{file.fileName || file.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">
                          {file.updateDate ? new Date(file.updateDate).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">{file.uploaderName || 'Sistem'}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              type="button"
                              onClick={() => setPreviewDoc(file)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-[10px] font-black rounded-lg transition-all shadow-sm active:scale-95"
                              title="Pratinjau isi dokumen langsung di aplikasi"
                            >
                              <Eye size={12} />
                              <span>Pratinjau</span>
                            </button>
                            <button 
                              type="button"
                              onClick={() => file.url && window.open(file.url, '_blank')}
                              className="p-1.5 bg-zinc-900 hover:bg-black text-white rounded-lg transition-all disabled:opacity-30"
                              disabled={!file.url}
                              title="Buka di tab baru Google Drive"
                            >
                              <ExternalLink size={12} />
                            </button>
                            {file.parentFolderId && (
                              <button 
                                type="button"
                                onClick={() => window.open(`https://drive.google.com/drive/folders/${file.parentFolderId}`, '_blank')}
                                className="p-1.5 text-zinc-400 hover:text-yellow-600 rounded-lg hover:bg-zinc-100 transition-colors"
                                title="Buka Folder Drive"
                              >
                                <FolderOpen size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {viewState.view === 'main' && (
        <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
          {/* Header & Advanced Search Filter Bar */}
          <div className="p-6 border-b border-zinc-100 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-black tracking-tight">Pusat Arsip Dokumen</h3>
                  {activeFilterCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-yellow-400 text-black shadow-sm">
                      {activeFilterCount} Filter Aktif
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Menampilkan <strong className="text-zinc-800 font-bold">{filteredDocs.length}</strong> dari <strong>{documents.length}</strong> dokumen tersimpan
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search Box */}
                <div className="relative flex-1 sm:w-72 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                  <input 
                    type="text" 
                    placeholder="Cari nama, file, kode, pengunggah..." 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl text-xs font-medium focus:ring-2 focus:ring-yellow-400 focus:outline-none transition-all"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black p-0.5"
                      title="Hapus pencarian"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Toggle Filter Button */}
                <button
                  type="button"
                  onClick={() => setIsAdvancedFilterOpen(prev => !prev)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all active:scale-95 shadow-sm",
                    isAdvancedFilterOpen || activeFilterCount > 0
                      ? "bg-black text-white border-black"
                      : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                  )}
                >
                  <SlidersHorizontal size={14} className={isAdvancedFilterOpen ? "text-yellow-400" : ""} />
                  <span>Filter Lanjutan</span>
                  {activeFilterCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-black flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* Reset Filters button if any active */}
                {(activeFilterCount > 0 || search) && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    title="Reset semua pencarian & filter"
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all border border-red-100"
                  >
                    <RotateCcw size={13} />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                )}

                {/* Display Limit */}
                <div className="flex items-center gap-1.5 bg-zinc-50 px-2.5 py-1.5 rounded-xl border border-zinc-200/60">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Baris:</span>
                  <select 
                    value={displayLimit}
                    onChange={(e) => setDisplayLimit(Number(e.target.value))}
                    className="bg-transparent border-none text-xs font-bold py-0.5 px-1 focus:ring-0 text-zinc-800 cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Collapsible Advanced Filters Drawer */}
            {isAdvancedFilterOpen && (
              <div className="pt-4 border-t border-zinc-100 space-y-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* 1. Kategori Filter */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <FolderOpen size={12} /> Kategori Dokumen
                    </label>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-800 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                    >
                      <option value="all">Semua Kategori</option>
                      <option value="Pengadaan Pegawai">Pengadaan Pegawai</option>
                      <option value="Informasi Kepegawaiaan">Informasi Kepegawaiaan</option>
                      <option value="Kinerja Pegawai">Kinerja Pegawai</option>
                      {isPersonalDriveCardVisible && (
                        <option value="my_drive">⭐ Drive Pribadi ({userDriveName})</option>
                      )}
                    </select>
                  </div>

                  {/* 2. Jenis ASN Filter */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <Users size={12} /> Jenis ASN
                    </label>
                    <select
                      value={filterJenisAsn}
                      onChange={(e) => setFilterJenisAsn(e.target.value)}
                      className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-800 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                    >
                      <option value="all">Semua Jenis ASN</option>
                      <option value="PNS">PNS (Pegawai Negeri Sipil)</option>
                      <option value="PPPK">PPPK</option>
                      <option value="PPPK Paruh Waktu">PPPK Paruh Waktu</option>
                    </select>
                  </div>

                  {/* 3. Tahun Berkas */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <Clock size={12} /> Tahun Berkas
                    </label>
                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                      className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-800 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                    >
                      <option value="all">Semua Tahun</option>
                      {availableYears.map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Rentang Tanggal Update */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <Calendar size={12} /> Rentang Tanggal
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                        placeholder="Dari"
                        className="w-full p-2 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] font-medium text-zinc-800 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                        title="Tanggal Mulai"
                      />
                      <input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                        placeholder="Sampai"
                        className="w-full p-2 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] font-medium text-zinc-800 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                        title="Tanggal Akhir"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Presets for Date Range */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-100 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1">Preset Tanggal:</span>
                    <button
                      type="button"
                      onClick={() => handlePresetDateRange('today')}
                      className="px-2.5 py-1 bg-zinc-100 hover:bg-yellow-400 hover:text-black text-zinc-700 rounded-lg text-[11px] font-semibold transition-colors"
                    >
                      Hari Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetDateRange('7days')}
                      className="px-2.5 py-1 bg-zinc-100 hover:bg-yellow-400 hover:text-black text-zinc-700 rounded-lg text-[11px] font-semibold transition-colors"
                    >
                      7 Hari Terakhir
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetDateRange('30days')}
                      className="px-2.5 py-1 bg-zinc-100 hover:bg-yellow-400 hover:text-black text-zinc-700 rounded-lg text-[11px] font-semibold transition-colors"
                    >
                      30 Hari
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetDateRange('thisMonth')}
                      className="px-2.5 py-1 bg-zinc-100 hover:bg-yellow-400 hover:text-black text-zinc-700 rounded-lg text-[11px] font-semibold transition-colors"
                    >
                      Bulan Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetDateRange('thisYear')}
                      className="px-2.5 py-1 bg-zinc-100 hover:bg-yellow-400 hover:text-black text-zinc-700 rounded-lg text-[11px] font-semibold transition-colors"
                    >
                      Tahun Ini
                    </button>
                    {(filterStartDate || filterEndDate) && (
                      <button
                        type="button"
                        onClick={() => handlePresetDateRange('all')}
                        className="px-2.5 py-1 text-red-500 hover:text-red-700 text-[11px] font-bold"
                      >
                        Hapus Tanggal
                      </button>
                    )}
                  </div>

                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="text-xs text-red-600 hover:underline font-bold flex items-center gap-1"
                    >
                      <RotateCcw size={12} /> Bersihkan Semua Filter
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Active Filters Badges Bar */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Filter Aktif:</span>
                {filterCategory !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-900 text-white shadow-sm">
                    Kategori: {filterCategory === 'my_drive' ? `Drive Pribadi (${userDriveName})` : filterCategory}
                    <button onClick={() => setFilterCategory('all')} className="hover:text-yellow-400">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filterJenisAsn !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-600 text-white shadow-sm">
                    ASN: {filterJenisAsn}
                    <button onClick={() => setFilterJenisAsn('all')} className="hover:text-yellow-300">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filterYear !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-800 text-white shadow-sm">
                    Tahun: {filterYear}
                    <button onClick={() => setFilterYear('all')} className="hover:text-yellow-400">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {(filterStartDate || filterEndDate) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-700 text-white shadow-sm">
                    Rentang: {filterStartDate || 'Awal'} s/d {filterEndDate || 'Kini'}
                    <button onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }} className="hover:text-yellow-300">
                      <X size={12} />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-[11px] font-bold text-red-600 hover:underline ml-1"
                >
                  Reset Semua
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-zinc-50 text-xs font-bold uppercase tracking-widest text-zinc-400">
                <tr>
                  <th className="px-6 py-4">Nama File / Deskripsi</th>
                  <th className="px-6 py-4">Kategori (Kode)</th>
                  <th className="px-6 py-4">Jenis ASN</th>
                  <th className="px-6 py-4">Bulan/Tahun</th>
                  <th className="px-6 py-4">Tanggal Update</th>
                  <th className="px-6 py-4">Oleh</th>
                  <th className="px-6 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-6 py-4 h-16 bg-zinc-50/50" />
                    </tr>
                  ))
                ) : filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                          <Search size={22} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-zinc-800">
                            Tidak ada dokumen yang cocok dengan kriteria filter
                          </p>
                          <p className="text-xs text-zinc-400">
                            Coba ubah kata kunci pencarian, kategori, jenis ASN, atau rentang tanggal.
                          </p>
                        </div>
                        {(activeFilterCount > 0 || search) && (
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all flex items-center gap-1.5 mt-2 shadow-sm"
                          >
                            <RotateCcw size={12} /> Reset Semua Filter
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : filteredDocs.slice(0, displayLimit).map((file, i) => (
                  <tr key={i} className="hover:bg-zinc-50 transition-colors group">
                    <td className="px-6 py-4 font-medium">
                      <div 
                        className="flex items-center gap-3 cursor-pointer group/title"
                        onClick={() => setPreviewDoc(file)}
                        title="Klik untuk pratinjau isi dokumen"
                      >
                        <div className="w-8 h-8 bg-zinc-100 rounded flex items-center justify-center text-zinc-400 group-hover/title:bg-yellow-100 group-hover/title:text-yellow-600 transition-colors shrink-0">
                          <FileText size={16} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm text-black font-bold truncate max-w-[240px] group-hover/title:text-yellow-600 group-hover/title:underline" title={file.fileName || file.name}>
                            {file.fileName || file.name}
                          </span>
                          <span className="text-[10px] text-zinc-400 uppercase tracking-tight truncate max-w-[240px]">
                            {file.name}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-zinc-700">{file.category}</span>
                        <span className="text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200/60 px-1.5 py-0.5 rounded w-fit mt-0.5">
                          KODE: {file.activityCode}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const asn = getDocJenisAsn(file);
                        if (!asn) return <span className="text-zinc-300 text-xs font-medium">-</span>;
                        if (asn === 'PNS') {
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                              PNS
                            </span>
                          );
                        }
                        if (asn === 'PPPK Paruh Waktu') {
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                              PPPK Paruh Waktu
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                            {asn}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-600 font-bold whitespace-nowrap">
                      {file.month || monthNameFallback(file.customFolderName) ? `${file.month || monthNameFallback(file.customFolderName)} ` : ''}{file.year}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 whitespace-nowrap">
                      {file.updateDate ? new Date(file.updateDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 whitespace-nowrap">{file.uploaderName || 'Sistem'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          type="button"
                          onClick={() => setPreviewDoc(file)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-[10px] font-black rounded-lg transition-all shadow-sm active:scale-95"
                          title="Pratinjau isi dokumen langsung di dalam aplikasi"
                        >
                          <Eye size={12} />
                          <span>Pratinjau</span>
                        </button>
                        <button 
                          type="button"
                          onClick={() => file.url && window.open(file.url, '_blank')}
                          className="px-2.5 py-1.5 bg-zinc-900 hover:bg-black text-white text-[10px] font-bold rounded-lg transition-all disabled:opacity-30"
                          disabled={!file.url}
                          title="Buka langsung di Google Drive"
                        >
                          <ExternalLink size={12} />
                        </button>
                        {file.parentFolderId && (
                          <button 
                            type="button"
                            onClick={() => window.open(`https://drive.google.com/drive/folders/${file.parentFolderId}`, '_blank')}
                            className="p-1.5 text-zinc-400 hover:text-yellow-600 rounded-lg hover:bg-zinc-100 transition-colors"
                            title="Buka Folder Drive"
                          >
                            <FolderOpen size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Pratinjau Dokumen */}
      <DocumentPreviewModal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />

      {/* Modal Rincian Kuota & Ganti Akun Google Drive */}
      <DriveQuotaModal
        isOpen={showQuotaModal}
        onClose={() => setShowQuotaModal(false)}
        quota={driveQuota}
        onRefresh={() => checkQuota()}
        isRefreshing={isCheckingQuota}
        onSwitchAccount={() => handleConnectDrive(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* Modal Pengaturan & Pengalihan Folder Google Drive */}
      <DriveSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        quota={driveQuota}
        onSwitchAccount={() => handleConnectDrive(true)}
        folderUrls={folderUrls}
        onUpdateFolderUrls={(newUrls) => setFolderUrls(newUrls)}
      />
    </div>
  );
};

const ArsipDigital = ({ user, userData, googleAccessToken, setGoogleAccessToken }: { user: any, userData: any, googleAccessToken: string | null, setGoogleAccessToken: (token: string | null) => void }) => {
  const [archives, setArchives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewDoc, setPreviewDoc] = useState<DocumentPreviewItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newArchive, setNewArchive] = useState({ 
    name: '', 
    category: 'Pengadaan Pegawai', 
    archiveType: 'Surat Rekomendasi TPP',
    month: MONTHS[new Date().getMonth()],
    year: new Date().getFullYear().toString(),
    updateDate: new Date().toISOString().split('T')[0],
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [driveQuota, setDriveQuota] = useState<DriveQuotaDetails | null>(null);
  const [isCheckingQuota, setIsCheckingQuota] = useState(false);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<'shared' | 'my_drive'>('shared');
  const [isPersonalDriveEnabled, setIsPersonalDriveEnabled] = useState<boolean>(() => {
    return localStorage.getItem('cloudp_personal_drive_enabled_' + (user?.uid || 'user')) === 'true';
  });
  const [folderUrls, setFolderUrls] = useState<Record<string, string>>(getStoredDriveFolders);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(10);
  const [syncStatus, setSyncStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isAuthExpired, setIsAuthExpired] = useState(false);

  const personalDriveFolderId = localStorage.getItem('cloudp_personal_folder_' + (user?.uid || 'user'));
  const personalDriveUrl = personalDriveFolderId 
    ? `https://drive.google.com/drive/folders/${personalDriveFolderId}` 
    : 'https://drive.google.com/drive/my-drive';

  const userDriveName = driveQuota?.userEmail 
    ? driveQuota.userEmail 
    : user?.displayName 
      ? user.displayName 
      : user?.email || 'Google Drive Pribadi';

  const personalArchives = useMemo(() => {
    return archives.filter(a => 
      a.storageTarget === 'my_drive' || 
      a.isPersonalDrive === true || 
      (personalDriveFolderId && a.parentFolderId === personalDriveFolderId)
    );
  }, [archives, personalDriveFolderId]);

  const isPersonalDriveCardVisible = isPersonalDriveEnabled || uploadTarget === 'my_drive' || personalArchives.length > 0;

  const isAuthorized = userData?.status === 'authorized' || user?.email === 'saininda@gmail.com';

  const checkQuota = async (token?: string | null) => {
    const activeToken = token || googleAccessToken;
    if (!activeToken) return;
    setIsCheckingQuota(true);
    try {
      const quota = await fetchDriveStorageQuota(activeToken);
      if (quota) {
        setDriveQuota(quota);
        setIsAuthExpired(false);
        if (quota.isExceeded) {
          setIsQuotaExceeded(true);
        }
      }
    } catch (err: any) {
      if (err?.message === 'TOKEN_EXPIRED_401') {
        console.warn('Google Drive token expired (HTTP 401) in ArsipDigital. Resetting token.');
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_drive_token');
        setDriveQuota(null);
        setIsAuthExpired(true);
      }
    } finally {
      setIsCheckingQuota(false);
    }
  };

  useEffect(() => {
    if (googleAccessToken) {
      checkQuota(googleAccessToken);
    } else {
      setDriveQuota(null);
      setIsQuotaExceeded(false);
    }
  }, [googleAccessToken]);

  useEffect(() => {
    const q = query(collection(db, 'archives'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setArchives(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'archives');
    });
    return () => unsubscribe();
  }, []);

  const archiveFolders = [
    { name: 'Arsip Digital (Pusat)', icon: ShieldCheck, url: folderUrls['Arsip Digital (Pusat)'] || DEFAULT_DRIVE_FOLDERS['Arsip Digital (Pusat)'] },
  ];

  const archiveTypes = [
    'Surat Rekomendasi TPP',
    'SK Kenaikan Pangkat',
    'SK Pensiun',
    'Surat Tugas',
    'Sertifikat Pelatihan',
    'Lainnya'
  ];

  const getFolderId = (url: string) => {
    const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  const handleConnectDrive = async (forceSelectAccount = false): Promise<string | null> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive');
      if (forceSelectAccount) {
        provider.setCustomParameters({ prompt: 'select_account' });
      }
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) {
        setGoogleAccessToken(token);
        sessionStorage.setItem('google_drive_token', token);
        setIsAuthExpired(false);
        setErrorMessage(null);
        if (uploadStatus === 'error') setUploadStatus('idle');
        await checkQuota(token);
        return token;
      }
      return null;
    } catch (error) {
      console.error('Error connecting to Drive:', error);
      alert('Gagal menghubungkan ke Google Drive.');
      return null;
    }
  };

  const uploadToGoogleDrive = async (file: File, fileName: string, folderId: string, accessToken: string) => {
    console.group(`[ArsipDigital:uploadToGoogleDrive] Mengunggah file arsip "${fileName}" ke Google Drive`);
    console.log('[ArsipDigital:uploadToGoogleDrive] Parameter input:', {
      fileName,
      folderId,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB (${file.size} bytes)`,
      fileType: file.type || 'unknown/binary',
      tokenAvailable: Boolean(accessToken)
    });

    // 1. Validasi Keberadaan dan Format folderId
    if (!folderId || typeof folderId !== 'string' || !folderId.trim() || folderId === 'null' || folderId === 'undefined') {
      console.error('[ArsipDigital:uploadToGoogleDrive] ERROR: folderId tidak valid atau kosong!', { folderId });
      console.groupEnd();
      throw new Error(`ID Folder tujuan arsip tidak valid: "${folderId}". Proses pengunggahan dibatalkan.`);
    }

    const cleanFolderId = folderId.trim();

    // 2. Pemeriksaan Asinkron Folder Google Drive
    if (cleanFolderId !== 'root') {
      console.log(`[ArsipDigital:uploadToGoogleDrive] Melakukan verifikasi asinkron ke Google Drive API untuk folder ID: "${cleanFolderId}"...`);
      try {
        const verifyRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${cleanFolderId}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json'
            }
          }
        );

        console.log(`[ArsipDigital:uploadToGoogleDrive] Hasil verifikasi folder API: HTTP ${verifyRes.status} ${verifyRes.statusText}`);

        if (!verifyRes.ok) {
          const errBody = await verifyRes.text().catch(() => '');
          console.error('[ArsipDigital:uploadToGoogleDrive] Validasi folder gagal (response.ok = false):', {
            status: verifyRes.status,
            statusText: verifyRes.statusText,
            body: errBody
          });

          if (verifyRes.status === 401) {
            console.groupEnd();
            throw new Error('SESI_DRIVE_BERAKHIR: Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan hubungkan ulang akun Google Drive Anda.');
          } else if (verifyRes.status === 404) {
            console.groupEnd();
            throw new Error(`FOLDER_TIDAK_DITEMUKAN: Folder arsip tujuan (ID: "${cleanFolderId}") tidak ditemukan atau telah dihapus di Google Drive.`);
          } else if (verifyRes.status === 403) {
            console.groupEnd();
            throw new Error(`AKSES_DITOLAK: Akun Google Anda tidak memiliki izin untuk mengakses folder arsip (ID: "${cleanFolderId}"). Pastikan Anda memiliki akses Editor.`);
          } else {
            console.groupEnd();
            throw new Error(`Gagal memverifikasi folder arsip di Google Drive (HTTP ${verifyRes.status}): ${errBody || verifyRes.statusText}`);
          }
        }

        const folderData = await verifyRes.json();
        console.log('[ArsipDigital:uploadToGoogleDrive] Folder arsip tujuan berhasil diverifikasi secara asinkron:', {
          id: folderData.id,
          name: folderData.name,
          mimeType: folderData.mimeType,
          trashed: folderData.trashed,
          canAddChildren: folderData.capabilities?.canAddChildren
        });

        if (folderData.trashed) {
          console.groupEnd();
          throw new Error(`FOLDER_DI_TRASH: Folder arsip "${folderData.name}" (ID: ${cleanFolderId}) berada di tempat sampah (Trash) Google Drive.`);
        }

        if (folderData.mimeType !== 'application/vnd.google-apps.folder') {
          console.groupEnd();
          throw new Error(`BUKAN_FOLDER: Objek Google Drive "${cleanFolderId}" (${folderData.name}) bukan folder (tipe: ${folderData.mimeType}).`);
        }
      } catch (verifyErr: any) {
        if (
          verifyErr.message?.startsWith('SESI_DRIVE_BERAKHIR') || 
          verifyErr.message?.startsWith('FOLDER_TIDAK_DITEMUKAN') || 
          verifyErr.message?.startsWith('AKSES_DITOLAK') ||
          verifyErr.message?.startsWith('FOLDER_DI_TRASH') ||
          verifyErr.message?.startsWith('BUKAN_FOLDER')
        ) {
          throw verifyErr;
        }
        console.warn('[ArsipDigital:uploadToGoogleDrive] Catatan: Pengecekan asinkron folder mengalami kendala non-fatal, melanjutkan ke proses upload:', verifyErr);
      }
    }

    // 3. Menyiapkan Data Multipart Form untuk Pengunggahan
    console.log('[ArsipDigital:uploadToGoogleDrive] Menyusun payload multipart upload dengan parent folder:', cleanFolderId);
    const metadata = {
      name: fileName,
      parents: [cleanFolderId],
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    const uploadEndpoint = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,parents,size&supportsAllDrives=true';
    console.log(`[ArsipDigital:uploadToGoogleDrive] Mengirim request POST ke Google Drive API: ${uploadEndpoint}`);

    const response = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    console.log(`[ArsipDigital:uploadToGoogleDrive] Respon diterima dari Google Drive API: HTTP ${response.status} ${response.statusText}`);

    // 4. Validasi response.ok Sebelum Memproses Respons
    if (!response.ok) {
      console.error(`[ArsipDigital:uploadToGoogleDrive] Upload GAGAL (response.ok = false). Status: HTTP ${response.status}`);
      let errorData: any = {};
      let rawErrorText = '';
      try {
        rawErrorText = await response.text();
        errorData = JSON.parse(rawErrorText);
      } catch {
        // Fallback jika bukan format JSON
      }

      console.error('[ArsipDigital:uploadToGoogleDrive] Rincian error pengunggahan:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        rawErrorText: rawErrorText.slice(0, 300)
      });
      console.groupEnd();

      if (response.status === 401) {
        throw new Error('SESI_DRIVE_BERAKHIR: Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan hubungkan ulang akun Google Drive Anda.');
      }

      const errMsg = errorData.error?.message || rawErrorText || 'Gagal mengunggah ke Google Drive';
      const reason = errorData.error?.errors?.[0]?.reason || '';

      if (
        reason === 'storageQuotaExceeded' || 
        errMsg.toLowerCase().includes('storage quota') || 
        errMsg.toLowerCase().includes('quota has been exceeded')
      ) {
        throw new Error('KUOTA_DRIVE_PENUH: Kapasitas penyimpanan Google Drive akun Anda telah habis (Storage Quota Exceeded).');
      }

      if (response.status === 404 || errMsg.toLowerCase().includes('file not found')) {
        throw new Error(`FOLDER_INDUK_TIDAK_DITEMUKAN: Folder tujuan (ID: ${cleanFolderId}) tidak ditemukan di Google Drive.`);
      }

      throw new Error(`Google Drive Upload Error (${response.status}): ${errMsg}`);
    }

    // 5. Respons Terverifikasi OK -> Memproses Payload JSON
    console.log('[ArsipDigital:uploadToGoogleDrive] Validasi response.ok = TRUE. Memproses respons JSON...');
    const result = await response.json();

    if (!result || !result.id) {
      console.error('[ArsipDigital:uploadToGoogleDrive] Format respons tidak valid, ID file tidak ditemukan:', result);
      console.groupEnd();
      throw new Error('Google Drive merespon sukses tetapi tidak mengembalikan ID file yang valid.');
    }

    console.log('[ArsipDigital:uploadToGoogleDrive] Pengunggahan berhasil diselesaikan:', {
      fileId: result.id,
      fileName: result.name || fileName,
      targetFolderId: cleanFolderId,
      parents: result.parents,
      webViewLink: result.webViewLink
    });
    console.groupEnd();

    return result;
  };

  const handleSaveArchiveWithoutDriveUpload = async () => {
    if (files.length === 0 && !newArchive.name) {
      alert('Silakan pilih file atau masukkan nama arsip terlebih dahulu.');
      return;
    }

    setIsSubmitting(true);
    setUploadStatus('saving');

    try {
      const itemsToSave = files.length > 0 ? files : [{ name: `${newArchive.name || 'ARSIP'}.pdf`, size: 0 } as any];

      for (let i = 0; i < itemsToSave.length; i++) {
        const currentFile = itemsToSave[i];
        const fileExtension = currentFile.name ? currentFile.name.split('.').pop() : 'pdf';
        const rawName = itemsToSave.length > 1 ? currentFile.name.split('.')[0] : (newArchive.name || currentFile.name.split('.')[0]);
        const sanitizedName = rawName.replace(/[^a-z0-9]/gi, '-').toUpperCase();
        const customFileName = `ARSIP_${newArchive.year}_${newArchive.archiveType.replace(/\s+/g, '_').toUpperCase()}_${sanitizedName}.${fileExtension}`;
        const fileSize = currentFile.size > 0 ? (currentFile.size / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB';

        await addDoc(collection(db, 'archives'), {
          ...newArchive,
          name: itemsToSave.length > 1 ? currentFile.name.split('.')[0].toUpperCase() : (newArchive.name || rawName).toUpperCase(),
          fileName: customFileName,
          driveFileId: null,
          url: '',
          storageStatus: 'quota_exceeded',
          size: fileSize,
          createdAt: new Date().toISOString(),
          uploadedBy: user.uid,
          uploaderName: user.displayName || user.email || 'Pengguna',
          note: 'Tersimpan di Cloud-P (Pengunggahan Google Drive ditangguhkan karena kuota penyimpanan Drive penuh).'
        });
      }

      setUploadStatus('success');
      setSyncStatus({ 
        message: `${itemsToSave.length} data arsip berhasil dicatat di sistem Cloud-P!`, 
        type: 'success' 
      });
      setTimeout(() => setSyncStatus(null), 4000);

      setTimeout(() => {
        setIsModalOpen(false);
        setUploadStatus('idle');
        setFiles([]);
        setNewArchive({ 
          name: '', 
          category: 'Pengadaan Pegawai', 
          archiveType: 'Surat Rekomendasi TPP',
          month: MONTHS[new Date().getMonth()],
          year: new Date().getFullYear().toString(),
          updateDate: new Date().toISOString().split('T')[0],
          description: ''
        });
        setUploadProgress(0);
        setIsQuotaExceeded(false);
        setErrorMessage(null);
        setIsSubmitting(false);
      }, 1500);
    } catch (err: any) {
      console.error('Error in handleSaveArchiveWithoutDriveUpload:', err);
      setUploadStatus('error');
      setErrorMessage('Gagal menyimpan arsip: ' + (err.message || ''));
      setIsSubmitting(false);
    }
  };

  const handleAddArchive = async (e?: React.FormEvent, overrideTarget?: 'shared' | 'my_drive') => {
    if (e) e.preventDefault();
    if (files.length === 0) {
      alert('Silakan pilih file terlebih dahulu.');
      return;
    }

    let activeToken = googleAccessToken;
    if (!activeToken) {
      activeToken = await handleConnectDrive(false);
      if (!activeToken) {
        setErrorMessage('Silakan hubungkan ke Google Drive terlebih dahulu.');
        setUploadStatus('error');
        return;
      }
    }

    const currentTarget = overrideTarget || uploadTarget;
    if (overrideTarget) {
      setUploadTarget(overrideTarget);
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setIsQuotaExceeded(false);
    setIsAuthExpired(false);
    
    try {
      let rootFolderId: string | null = null;
      if (currentTarget === 'my_drive') {
        setSyncStatus({ message: 'Menyiapkan folder Cloud-P di My Drive pribadi...', type: 'info' });
        const baseAppFolder = await getOrCreateFolder('Cloud-P Dokumen', 'root', activeToken);
        localStorage.setItem('cloudp_personal_folder_' + (user?.uid || 'user'), baseAppFolder);
        setIsPersonalDriveEnabled(true);
        localStorage.setItem('cloudp_personal_drive_enabled_' + (user?.uid || 'user'), 'true');
        rootFolderId = await getOrCreateFolder('Arsip Digital', baseAppFolder, activeToken);
      } else {
        const categoryObj = archiveFolders.find(c => c.name === newArchive.category);
        rootFolderId = categoryObj ? getFolderId(categoryObj.url) : null;
      }

      if (!rootFolderId) {
        setIsSubmitting(false);
        alert('ID Folder Google Drive tidak ditemukan.');
        return;
      }

      setSyncStatus({ message: 'Menyiapkan folder di Google Drive...', type: 'info' });

      // 1. Get or create Month folder (e.g., "Maret 2026")
      const monthFolderName = `${newArchive.month} ${newArchive.year}`;
      const monthFolderId = await getOrCreateFolder(monthFolderName, rootFolderId, activeToken);

      // 2. Get or create Archive Type folder (e.g., "SURAT_REKOMENDASI_TPP")
      const archiveFolderName = newArchive.archiveType.replace(/\s+/g, '_').toUpperCase();
      const finalFolderId = await getOrCreateFolder(archiveFolderName, monthFolderId, activeToken);

      let uploadFolderId = finalFolderId;
      let effectiveFolderName = '';

      if (files.length > 1) {
        setSyncStatus({ message: `Membuat folder kelompok arsip: ${newArchive.name}...`, type: 'info' });
        uploadFolderId = await getOrCreateFolder(newArchive.name.toUpperCase(), finalFolderId, activeToken);
        effectiveFolderName = newArchive.name.toUpperCase();
      }

      for (let i = 0; i < files.length; i++) {
        const currentFile = files[i];
        setUploadStatus('uploading');
        setUploadProgress(0);
        setSyncStatus({ message: `Mengunggah arsip ${i + 1} dari ${files.length}: ${currentFile.name}`, type: 'info' });

        const fileExtension = currentFile.name.split('.').pop();
        const rawName = files.length > 1 ? currentFile.name.split('.')[0] : (newArchive.name || currentFile.name.split('.')[0]);
        const sanitizedName = rawName.replace(/[^a-z0-9]/gi, '-').toUpperCase();
        const customFileName = `ARSIP_${newArchive.year}_${newArchive.archiveType.replace(/\s+/g, '_').toUpperCase()}_${sanitizedName}.${fileExtension}`;

        const progressInterval = setInterval(() => {
          setUploadProgress(prev => (prev < 90 ? prev + 10 : prev));
        }, 300);

        const driveResult = await uploadToGoogleDrive(currentFile, customFileName, uploadFolderId, activeToken);
        
        clearInterval(progressInterval);
        setUploadProgress(100);
        
        setUploadStatus('saving');
        await addDoc(collection(db, 'archives'), {
          ...newArchive,
          name: files.length > 1 ? currentFile.name.split('.')[0].toUpperCase() : newArchive.name.toUpperCase(),
          fileName: customFileName,
          driveFileId: driveResult.id,
          url: driveResult.webViewLink,
          parentFolderId: uploadFolderId,
          customFolderName: effectiveFolderName,
          size: (currentFile.size / (1024 * 1024)).toFixed(2) + ' MB',
          createdAt: new Date().toISOString(),
          uploadedBy: user.uid,
          uploaderName: user.displayName,
          storageTarget: currentTarget,
          isPersonalDrive: currentTarget === 'my_drive',
          driveAccount: driveQuota?.userEmail || user.email || ''
        });
      }
      
      setUploadStatus('success');
      setSyncStatus({ message: `${files.length} arsip berhasil diunggah!`, type: 'success' });
      setTimeout(() => setSyncStatus(null), 3000);

      setTimeout(() => {
        setIsModalOpen(false);
        setUploadStatus('idle');
        setFiles([]);
        setNewArchive({ 
          name: '', 
          category: 'Pengadaan Pegawai', 
          archiveType: 'Surat Rekomendasi TPP',
          month: MONTHS[new Date().getMonth()],
          year: new Date().getFullYear().toString(),
          updateDate: new Date().toISOString().split('T')[0],
          description: ''
        });
        setUploadProgress(0);
        setIsSubmitting(false);
        setIsQuotaExceeded(false);
      }, 1500);
    } catch (error: any) {
      setUploadStatus('error');
      setSyncStatus(null);
      let msg = error.message || 'Gagal mengunggah arsip.';
      const isQuota = 
        msg.includes('KUOTA_DRIVE_PENUH') || 
        msg.toLowerCase().includes('storage quota') || 
        msg.toLowerCase().includes('quota has been exceeded') ||
        msg.toLowerCase().includes('storagequotaexceeded');

      const isAuthError = 
        msg.includes('SESI_DRIVE_BERAKHIR') ||
        msg.includes('401') ||
        msg.toLowerCase().includes('unauthenticated') ||
        msg.toLowerCase().includes('invalid credentials') ||
        msg.toLowerCase().includes('invalid authentication credentials') ||
        msg.includes('Sesi Google Drive telah berakhir');

      if (isAuthError) {
        setIsAuthExpired(true);
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_drive_token');
        msg = 'Sesi otorisasi Google Drive telah berakhir (HTTP 401: Token Kedaluwarsa). Silakan klik tombol "Hubungkan Ulang Google Drive" di bawah ini.';
      } else if (isQuota) {
        setIsQuotaExceeded(true);
        msg = 'Kapasitas penyimpanan Google Drive Anda telah penuh (Storage Quota Exceeded).';
        checkQuota();
      }
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  const handleSyncArchives = async () => {
    console.log('handleSyncArchives triggered');
    if (!googleAccessToken) {
      setSyncStatus({ message: 'Silakan hubungkan ke Google Drive terlebih dahulu.', type: 'error' });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ message: 'Memulai sinkronisasi arsip...', type: 'info' });
    setSyncProgress({ current: 0, total: 0 });
    let addedCount = 0;

    try {
      for (const cat of archiveFolders) {
        setSyncStatus({ message: `Memindai folder arsip: ${cat.name}...`, type: 'info' });
        const folderId = getFolderId(cat.url);
        if (!folderId) continue;

        const driveFiles = await fetchAllFilesRecursively(folderId, googleAccessToken!);

        for (const driveFile of driveFiles) {
          const exists = archives.some(a => a.driveFileId === driveFile.id);
          
          if (!exists) {
            // Try to parse metadata from filename (ARSIP_YEAR_TYPE_NAME.ext)
            const parts = driveFile.name.split('_');
            const year = parts[1] && /^\d{4}$/.test(parts[1]) ? parts[1] : new Date(driveFile.createdTime).getFullYear().toString();
            const archiveType = parts[2] ? parts[2].replace(/_/g, ' ') : 'Arsip Umum';
            const name = parts[3] ? parts[3].replace(/-/g, ' ').toUpperCase() : driveFile.name.split('.')[0].toUpperCase();
            const matchedMonth = monthNameFallback(driveFile.parentFolderName || '');

            await addDoc(collection(db, 'archives'), {
              name: name,
              category: cat.name,
              archiveType: archiveType,
              year: year,
              month: matchedMonth,
              updateDate: new Date(driveFile.createdTime).toISOString().split('T')[0],
              size: driveFile.size ? (parseInt(driveFile.size) / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB',
              fileName: driveFile.name,
              driveFileId: driveFile.id,
              url: driveFile.webViewLink,
              parentFolderId: driveFile.parentFolderId || '',
              customFolderName: driveFile.parentFolderName || '',
              createdAt: new Date().toISOString(),
              uploadedBy: user.uid,
              uploaderName: user.displayName || 'Sistem Sync'
            });
            addedCount++;
          }
        }
      }
      setSyncStatus({ message: `Sinkronisasi arsip selesai! ${addedCount} arsip baru berhasil didaftarkan.`, type: 'success' });
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (error: any) {
      console.error('Sync Error:', error);
      if (
        error.message?.includes('SESI_DRIVE_BERAKHIR') ||
        error.message?.includes('401') ||
        error.message?.includes('Sesi Google Drive telah berakhir')
      ) {
        setGoogleAccessToken(null);
        sessionStorage.removeItem('google_drive_token');
        setIsAuthExpired(true);
      }
      setSyncStatus({ message: 'Terjadi kesalahan saat sinkronisasi arsip: ' + error.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetArchives = async () => {
    if (!confirm('PERINGATAN: Ini akan menghapus SELURUH metadata arsip dari database aplikasi (bukan file di Drive). Gunakan ini jika Anda telah mengganti link folder dan ingin memulai dari nol. Lanjutkan?')) return;
    
    setIsSyncing(true);
    setSyncStatus({ message: 'Membersihkan seluruh database arsip...', type: 'info' });
    let deletedCount = 0;

    try {
      // In a real environment, we would batch delete. 
      // For simplicity here, we iterate.
      for (const archiveItem of archives) {
        await deleteDoc(doc(db, 'archives', archiveItem.id));
        deletedCount++;
      }
      
      setSyncStatus({ message: `Database berhasil dikosongkan. ${deletedCount} data dihapus. Silakan sinkronkan ulang dengan folder baru.`, type: 'success' });
      setTimeout(() => setSyncStatus(null), 5000);
    } catch (error: any) {
      console.error('Reset Error:', error);
      setSyncStatus({ message: 'Terjadi kesalahan saat mengosongkan database: ' + error.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredArchives = archives.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.archiveType.toLowerCase().includes(search.toLowerCase())
  );

  const stats = [
    { label: 'Total Arsip', value: archives.length, icon: Database, color: 'bg-black text-white' },
    { label: 'Rekomendasi TPP', value: archives.filter(a => a.archiveType === 'Surat Rekomendasi TPP').length, icon: FileText, color: 'bg-yellow-400' },
    { label: 'Update Terbaru', value: archives.length > 0 ? new Date(archives[0].createdAt).toLocaleDateString('id-ID') : '-', icon: Clock, color: 'bg-zinc-100' },
  ];

  const pieData = Object.entries(
    archives.reduce((acc: any, curr) => {
      acc[curr.archiveType] = (acc[curr.archiveType] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const COLORS = ['#000000', '#FACC15', '#71717A', '#E4E4E7', '#FDE047'];

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-black tracking-tight">ARSIP DIGITAL PRODUK JADI</h1>
          <p className="text-zinc-500 mt-2">Penyimpanan dokumen resmi dan surat keputusan hasil olah data Bidang Cloud-P.</p>
        </div>
        <div className="flex items-center gap-4">
          {!googleAccessToken ? (
            <button 
              onClick={() => handleConnectDrive(false)}
              className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-zinc-200 text-zinc-600 font-bold rounded-2xl hover:border-yellow-400 hover:text-black transition-all shadow-sm"
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" alt="Drive" className="w-full h-full" />
              </div>
              HUBUNGKAN DRIVE
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 text-xs font-bold rounded-xl border border-green-100">
                <CheckCircle2 size={14} /> TERHUBUNG
              </div>
              {driveQuota && (
                <button
                  type="button"
                  onClick={() => setShowQuotaModal(true)}
                  disabled={isCheckingQuota}
                  title="Klik untuk melihat rincian kapasitas & ganti akun Google Drive"
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl border transition-all hover:scale-105 active:scale-95",
                    driveQuota.isExceeded 
                      ? "bg-red-50 text-red-700 border-red-200" 
                      : driveQuota.percentUsed > 85 
                        ? "bg-amber-50 text-amber-800 border-amber-200" 
                        : "bg-zinc-50 text-zinc-600 border-zinc-200"
                  )}
                >
                  <HardDrive size={14} className={driveQuota.isExceeded ? "text-red-600 animate-pulse" : "text-zinc-500"} />
                  <span>
                    Drive: <strong className={driveQuota.isExceeded ? "text-red-700 font-black" : ""}>{driveQuota.usageFormatted} / {driveQuota.limitFormatted}</strong>
                  </span>
                  {driveQuota.isExceeded ? (
                    <span className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[9px] font-black uppercase tracking-wider">
                      PENUH
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-400">({driveQuota.percentUsed}%)</span>
                  )}
                  <Info size={12} className="text-zinc-400" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                title="Beralih Penyimpanan atau Pengaturan Folder Google Drive"
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-yellow-400 hover:text-black text-zinc-700 text-xs font-bold rounded-xl border border-zinc-200 transition-all shadow-sm active:scale-95"
              >
                <Settings size={14} />
                <span className="hidden sm:inline">Beralih / Atur Drive</span>
              </button>
            </div>
          )}
          {isAuthorized && (
            <div className="flex items-center gap-3">
              <button 
                onClick={handleResetArchives}
                disabled={isSyncing}
                title="Kosongkan database untuk ganti link"
                className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-red-100 text-red-500 font-bold rounded-2xl hover:bg-red-50 transition-all disabled:opacity-50"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={handleSyncArchives}
                disabled={isSyncing}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-black transition-all shadow-lg disabled:opacity-50"
              >
                {isSyncing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Clock size={18} />
                )}
                SINKRONKAN DRIVE
              </button>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-black text-white font-black rounded-2xl hover:bg-zinc-800 transition-all shadow-lg shadow-black/20"
              >
                <PlusCircle size={20} /> UNGGAH ARSIP BARU
              </button>
            </div>
          )}
        </div>
      </header>

      <AnimatePresence>
        {syncStatus && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`p-4 rounded-2xl border flex items-center justify-between ${
              syncStatus.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' :
              syncStatus.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' :
              'bg-blue-50 border-blue-100 text-blue-700'
            }`}
          >
            <div className="flex items-center gap-3">
              {syncStatus.type === 'info' && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              <span className="text-sm font-bold">{syncStatus.message}</span>
            </div>
            <button onClick={() => setSyncStatus(null)} className="opacity-50 hover:opacity-100">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={i}
            className={cn("p-6 rounded-3xl shadow-sm border border-black/5 flex items-center justify-between", stat.color)}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-60">{stat.label}</p>
              <p className="text-3xl font-black mt-1">{stat.value}</p>
            </div>
            <stat.icon size={32} className="opacity-20" />
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black">Statistik Jenis Arsip</h3>
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
              <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
              BERDASARKAN PRODUK JADI
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-900 p-8 rounded-[2.5rem] text-white shadow-xl">
          <h3 className="text-xl font-black mb-6">Keterangan</h3>
          <div className="space-y-4">
            {pieData.map((item: any, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="text-sm font-bold truncate max-w-[150px]">{item.name}</span>
                </div>
                <span className="text-lg font-black text-yellow-400">{item.value}</span>
              </div>
            ))}
            {pieData.length === 0 && (
              <div className="text-center py-8 text-zinc-500 italic">
                Belum ada data arsip
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-6", isPersonalDriveCardVisible ? "lg:grid-cols-4" : "sm:grid-cols-3")}>
        {archiveFolders.map((cat, i) => (
          <motion.div 
            whileHover={{ y: -5 }}
            key={i} 
            onClick={() => window.open(cat.url, '_blank')}
            className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 bg-zinc-900 text-yellow-400 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <cat.icon size={24} />
            </div>
            <h3 className="font-bold text-lg">{cat.name}</h3>
            <p className="text-sm text-zinc-400 mt-1">{archives.filter(a => a.category === cat.name).length} Arsip Tersimpan</p>
            <div className="mt-4 flex items-center text-xs font-bold text-zinc-900 uppercase tracking-wider">
              Buka Folder <ChevronRight size={14} />
            </div>
          </motion.div>
        ))}

        {/* Kartu Jembatan Google Drive Pribadi User */}
        {isPersonalDriveCardVisible && (
          <motion.div 
            whileHover={{ y: -5 }}
            className="relative bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-white p-6 rounded-3xl border-2 border-yellow-400/50 shadow-xl hover:shadow-2xl hover:border-yellow-400 transition-all cursor-pointer group overflow-hidden flex flex-col justify-between"
            onClick={() => window.open(personalDriveUrl, '_blank')}
            title="Buka Google Drive Pribadi Anda"
          >
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-400/10 rounded-full blur-2xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center p-2.5 border border-white/10 group-hover:scale-110 transition-transform shadow-inner">
                  <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" 
                    alt="Google Drive" 
                    className="w-full h-full object-contain" 
                  />
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-yellow-400 text-black border border-yellow-300 shadow-sm flex items-center gap-1">
                  <HardDrive size={11} /> Jembatan Drive
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="font-black text-lg text-white group-hover:text-yellow-400 transition-colors flex items-center gap-1.5 truncate">
                  Drive Pribadi
                </h3>
                <p className="text-xs font-bold text-zinc-300 truncate" title={userDriveName}>
                  {userDriveName}
                </p>
                <p className="text-[11px] text-zinc-400 truncate mt-1">
                  Folder: <span className="text-yellow-300 font-mono">Cloud-P Dokumen</span>
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">
                <strong className="text-white">{personalArchives.length}</strong> Arsip Tersimpan
              </span>
              <div className="flex items-center gap-1 text-xs font-black text-yellow-400 group-hover:translate-x-1 transition-transform">
                <span>Buka Drive</span>
                <ExternalLink size={13} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="font-bold">Daftar Arsip Produk Jadi</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Tampilkan:</span>
              <select 
                value={displayLimit}
                onChange={(e) => setDisplayLimit(Number(e.target.value))}
                className="bg-zinc-50 border-none rounded-xl text-xs font-bold py-2 px-3 focus:ring-2 focus:ring-yellow-400"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input 
                type="text" 
                placeholder="Cari arsip..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 bg-zinc-50 border-none rounded-xl text-sm w-64 focus:ring-2 focus:ring-yellow-400"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-zinc-50 text-xs font-bold uppercase tracking-widest text-zinc-400">
              <tr>
                <th className="px-6 py-4">Nama Arsip</th>
                <th className="px-6 py-4">Jenis Produk</th>
                <th className="px-6 py-4">Kategori</th>
                <th className="px-6 py-4">Bulan/Tahun</th>
                <th className="px-6 py-4">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-6 py-4 h-16 bg-zinc-50/50 animate-pulse" />
                  </tr>
                ))
              ) : filteredArchives.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 font-medium">
                    Belum ada arsip produk jadi.
                  </td>
                </tr>
              ) : (
                filteredArchives.slice(0, displayLimit).map((archive) => (
                  <tr key={archive.id} className="hover:bg-zinc-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div 
                        className="flex items-center gap-3 cursor-pointer group/item"
                        onClick={() => setPreviewDoc(archive)}
                        title="Klik untuk pratinjau isi arsip"
                      >
                        <div className="w-8 h-8 bg-zinc-900 text-yellow-400 rounded-lg flex items-center justify-center shrink-0 group-hover/item:scale-105 transition-transform">
                          <ShieldCheck size={16} />
                        </div>
                        <span className="font-bold text-sm group-hover/item:text-yellow-600 group-hover/item:underline">{archive.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-500">{archive.archiveType}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">{archive.category}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500">
                      {archive.month || monthNameFallback(archive.customFolderName) ? `${archive.month || monthNameFallback(archive.customFolderName)} ` : ''}{archive.year}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <button 
                          type="button"
                          onClick={() => setPreviewDoc(archive)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-[10px] font-black rounded-lg transition-all shadow-sm active:scale-95"
                          title="Pratinjau isi arsip langsung di dalam aplikasi"
                        >
                          <Eye size={12} />
                          <span>Pratinjau</span>
                        </button>
                        <button 
                          type="button"
                          onClick={() => window.open(archive.url, '_blank')}
                          className="p-1.5 bg-zinc-900 hover:bg-black text-white rounded-lg transition-all"
                          title="Buka langsung di Google Drive"
                        >
                          <ExternalLink size={12} />
                        </button>
                        {archive.parentFolderId && (
                          <button 
                            type="button"
                            onClick={() => window.open(`https://drive.google.com/drive/folders/${archive.parentFolderId}`, '_blank')}
                            className="p-1.5 text-zinc-400 hover:text-yellow-600 rounded-lg hover:bg-zinc-100 transition-colors"
                            title="Buka Folder Drive"
                          >
                            <FolderOpen size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-black">Unggah Arsip Produk Jadi</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleAddArchive} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                {(!googleAccessToken || isAuthExpired) && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                    <Info className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        {isAuthExpired ? 'Sesi Google Drive Berakhir (HTTP 401)' : 'Drive Belum Terhubung'}
                      </p>
                      <p className="text-[10px] text-amber-700 leading-relaxed">
                        {isAuthExpired 
                          ? 'Token otorisasi Google Drive Anda telah kedaluwarsa. Silakan klik Hubungkan Sekarang untuk memperbarui sesi login.'
                          : 'Anda harus menghubungkan akun ke Google Drive sebelum dapat mengunggah arsip.'}
                      </p>
                      <button 
                        type="button"
                        onClick={() => handleConnectDrive()}
                        className="text-[10px] font-black text-amber-900 underline underline-offset-2 hover:text-amber-600 flex items-center gap-1 mt-1"
                      >
                        <RefreshCw size={12} /> HUBUNGKAN SEKARANG
                      </button>
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">File Produk Jadi (Wajib)</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      multiple
                      onChange={e => {
                        const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
                        setFiles(selectedFiles);
                        if (selectedFiles.length === 1) {
                          if (!newArchive.name) {
                            const nameWithoutExt = selectedFiles[0].name.split('.').slice(0, -1).join('.');
                            setNewArchive(prev => ({ ...prev, name: nameWithoutExt.toUpperCase() }));
                          }
                        }
                      }}
                      className="hidden"
                      id="archive-upload"
                    />
                    <label 
                      htmlFor="archive-upload"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const droppedFiles = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
                        if (droppedFiles.length > 0) {
                          setFiles(droppedFiles);
                          if (droppedFiles.length === 1 && !newArchive.name) {
                            const nameWithoutExt = droppedFiles[0].name.split('.').slice(0, -1).join('.');
                            setNewArchive(prev => ({ ...prev, name: nameWithoutExt.toUpperCase() }));
                          }
                        }
                      }}
                      className={cn(
                        "w-full p-4 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all",
                        files.length > 0 ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50"
                      )}
                    >
                      <Upload className={files.length > 0 ? "text-zinc-900" : "text-zinc-400"} size={24} />
                      <span className="text-sm font-medium text-zinc-600 text-center">
                        {files.length > 0 
                          ? `${files.length} file dipilih: ${files.map(f => f.name).join(', ').substring(0, 50)}${files.map(f => f.name).join(', ').length > 50 ? '...' : ''}` 
                          : 'Klik untuk pilih file produk jadi (bisa banyak)'}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Target Penyimpanan Google Drive */}
                <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                      Target Lokasi Penyimpanan Google Drive
                    </label>
                    <span className="text-[10px] font-bold text-zinc-500">
                      {uploadTarget === 'shared' ? 'Folder Bersama Pusat' : 'My Drive Akun Pribadi'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadTarget('shared')}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        uploadTarget === 'shared' 
                          ? "bg-black text-white border-black shadow-sm" 
                          : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                      )}
                    >
                      <FolderOpen size={14} /> Folder Pusat
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadTarget('my_drive');
                        setIsPersonalDriveEnabled(true);
                        localStorage.setItem('cloudp_personal_drive_enabled_' + (user?.uid || 'user'), 'true');
                      }}
                      className={cn(
                        "p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        uploadTarget === 'my_drive' 
                          ? "bg-black text-white border-black shadow-sm" 
                          : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                      )}
                    >
                      <HardDrive size={14} /> My Drive Pribadi
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    {uploadTarget === 'shared' 
                      ? 'Tersimpan di folder arsip pusat Cloud-P. Jika kuota penuh, beralih ke opsi "My Drive Pribadi".' 
                      : 'Tersimpan otomatis di folder "Cloud-P Dokumen/Arsip Digital" di Google Drive akun pribadi Anda.'}
                  </p>
                  {uploadTarget === 'my_drive' && (
                    <div className="p-2.5 bg-yellow-50 border border-yellow-200/80 rounded-xl flex items-center gap-2 text-[11px] font-bold text-yellow-900 animate-in fade-in">
                      <CheckCircle2 size={14} className="text-yellow-600 shrink-0" />
                      <span>
                        Kartu Jembatan atas nama <strong>{userDriveName}</strong> aktif di menu Arsip Digital & Pusat Data!
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Kategori Data Sumber</label>
                    <select 
                      value={newArchive.category}
                      onChange={e => setNewArchive({...newArchive, category: e.target.value})}
                      className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    >
                      {archiveFolders.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Jenis Produk</label>
                    <select 
                      value={newArchive.archiveType}
                      onChange={e => setNewArchive({...newArchive, archiveType: e.target.value})}
                      className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    >
                      {archiveTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Bulan Produk</label>
                    <select 
                      value={newArchive.month}
                      onChange={e => setNewArchive({...newArchive, month: e.target.value})}
                      className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    >
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tahun Produk</label>
                    <input 
                      required
                      type="number" 
                      value={newArchive.year}
                      onChange={e => setNewArchive({...newArchive, year: e.target.value})}
                      className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tanggal TTD</label>
                  <input 
                    required
                    type="date" 
                    value={newArchive.updateDate}
                    onChange={e => setNewArchive({...newArchive, updateDate: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                    {files.length > 1 ? 'Nama Kelompok Arsip / Folder' : 'Nama Dokumen / No. Surat'}
                  </label>
                  <input 
                    required
                    type="text" 
                    value={newArchive.name}
                    onChange={e => setNewArchive({...newArchive, name: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900"
                    placeholder={files.length > 1 ? "Contoh: BUNDEL SK PEMBERHENTIAN 2024" : "Contoh: 800/123/BKPSDM/2024"}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Keterangan Tambahan</label>
                  <textarea 
                    value={newArchive.description}
                    onChange={e => setNewArchive({...newArchive, description: e.target.value})}
                    className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-zinc-900 h-20"
                    placeholder="Catatan mengenai arsip ini..."
                  />
                </div>

                {isSubmitting && (
                  <div className="space-y-2">
                    <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        className={cn(
                          "h-full transition-all duration-300",
                          uploadStatus === 'success' ? "bg-green-500" : 
                          uploadStatus === 'error' ? "bg-red-500" : "bg-zinc-900"
                        )}
                      />
                    </div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase text-center">
                      {uploadStatus === 'uploading' ? `Mengirim ke Drive... ${uploadProgress}%` : 
                       uploadStatus === 'saving' ? 'Menyimpan ke Database...' : 
                       uploadStatus === 'success' ? 'Selesai!' : 'Terjadi Kesalahan'}
                    </p>
                  </div>
                )}

                {isAuthExpired && (
                  <div className="p-4 bg-amber-50/95 border-2 border-amber-300 rounded-2xl space-y-3 mt-3 animate-in fade-in duration-300">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
                      <div className="space-y-1 text-left flex-1">
                        <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                          Sesi Google Drive Berakhir (HTTP 401)
                        </h4>
                        <p className="text-xs text-amber-900/90 leading-relaxed">
                          Token otorisasi Google Drive Anda telah berakhir demi keamanan. Silakan klik tombol di bawah ini untuk menghubungkan ulang akun Anda. File yang telah Anda pilih tidak akan hilang.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const token = await handleConnectDrive();
                        if (token) {
                          setIsAuthExpired(false);
                          setErrorMessage(null);
                          setUploadStatus('idle');
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-yellow-400 hover:bg-yellow-500 text-black font-black rounded-xl text-xs tracking-wider transition-all shadow-md active:scale-95"
                    >
                      <RefreshCw size={15} /> HUBUNGKAN ULANG GOOGLE DRIVE SEKARANG
                    </button>
                  </div>
                )}

                {uploadStatus === 'error' && errorMessage && !isQuotaExceeded && !isAuthExpired && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-bold flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {isQuotaExceeded && (
                  <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-2xl space-y-3 mt-3 animate-in fade-in duration-300">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
                      <div className="space-y-1 text-left flex-1">
                        <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                          Penyimpanan Google Drive Penuh (Quota Exceeded)
                        </h4>
                        <p className="text-xs text-amber-800 leading-relaxed">
                          Google menolak pengunggahan karena kuota penyimpanan Google Drive akun Anda telah mencapai batas maksimal (15 GB).
                        </p>
                        {driveQuota && (
                          <div className="p-2.5 bg-white/90 rounded-xl border border-amber-200 text-xs text-zinc-700 space-y-1 mt-1">
                            <div className="flex justify-between font-bold">
                              <span>Penggunaan Total:</span>
                              <span className="text-red-600 font-black">{driveQuota.usageFormatted} / {driveQuota.limitFormatted}</span>
                            </div>
                            {driveQuota.usageInDriveTrash > 0 && (
                              <div className="flex justify-between text-[11px] text-amber-900">
                                <span>Sampah di Drive (Trash):</span>
                                <span className="font-bold">{driveQuota.trashFormatted} (dapat dikosongkan)</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-amber-200">
                      <p className="text-[11px] font-bold text-amber-900">Solusi & Tindakan Cepat:</p>
                      
                      {uploadTarget === 'shared' && (
                        <button
                          type="button"
                          onClick={() => handleAddArchive(undefined, 'my_drive')}
                          disabled={isSubmitting}
                          className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-900 hover:bg-black text-white font-black rounded-xl text-xs tracking-wider transition-all shadow-md"
                        >
                          <HardDrive size={15} /> 1. COBA UNGGAH KE MY DRIVE PRIBADI
                        </button>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleConnectDrive(true)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white hover:bg-yellow-400 hover:text-black border border-zinc-300 text-zinc-800 rounded-xl text-xs font-bold transition-all shadow-sm"
                        >
                          <RefreshCw size={13} /> Ganti Akun Google
                        </button>
                        <a 
                          href="https://drive.google.com/drive/trash" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all text-center"
                        >
                          <Trash2 size={13} /> Kosongkan Sampah ↗
                        </a>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2">
                        <a 
                          href="https://one.google.com/storage" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all text-center"
                        >
                          <ExternalLink size={13} /> Kelola Google One ↗
                        </a>
                      </div>
                      
                      <button
                        type="button"
                        onClick={handleSaveArchiveWithoutDriveUpload}
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-xs tracking-wider transition-all shadow-md shadow-amber-500/20"
                      >
                        <Database size={14} /> TETAP SIMPAN ARSIP KE CLOUD-P
                      </button>
                      <p className="text-[10px] text-amber-700 text-center">
                        Metadata arsip tersimpan aman di database Cloud-P dan dapat disinkronkan ke Drive di masa mendatang.
                      </p>
                    </div>
                  </div>
                )}

                <button 
                  disabled={isSubmitting}
                  className={cn(
                    "w-full py-4 text-white font-black rounded-2xl transition-all mt-4 disabled:opacity-50 flex items-center justify-center gap-2",
                    uploadStatus === 'success' ? "bg-green-500" : 
                    uploadStatus === 'error' ? "bg-red-500" : "bg-black hover:bg-zinc-800"
                  )}
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : uploadStatus === 'success' ? (
                    <>
                      <CheckCircle2 size={20} /> ARSIP BERHASIL DISIMPAN
                    </>
                  ) : uploadStatus === 'error' ? (
                    <>
                      <RefreshCw size={18} /> COBA UNGGAH ULANG
                    </>
                  ) : 'UNGGAH ARSIP'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Pratinjau Dokumen */}
      <DocumentPreviewModal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />

      {/* Modal Rincian Kuota & Ganti Akun Google Drive */}
      <DriveQuotaModal
        isOpen={showQuotaModal}
        onClose={() => setShowQuotaModal(false)}
        quota={driveQuota}
        onRefresh={() => checkQuota()}
        isRefreshing={isCheckingQuota}
        onSwitchAccount={() => handleConnectDrive(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* Modal Pengaturan & Pengalihan Folder Google Drive */}
      <DriveSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        quota={driveQuota}
        onSwitchAccount={() => handleConnectDrive(true)}
        folderUrls={folderUrls}
        onUpdateFolderUrls={(newUrls) => setFolderUrls(newUrls)}
      />
    </div>
  );
};

const RequestManagement = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      if (auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      }
    });
    return () => unsubscribe();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'requests', id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requests/${id}`);
    }
  };

  const filteredRequests = requests.filter(r => filter === 'all' || r.status === filter);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-black tracking-tight uppercase">Manajemen Permintaan</h1>
          <p className="text-zinc-500 mt-2">Kelola dan proses permintaan data dari pihak eksternal.</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-black/5 shadow-sm">
          {['all', 'pending', 'processing', 'completed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
                filter === f ? "bg-black text-white" : "hover:bg-zinc-100 text-zinc-400"
              )}
            >
              {f === 'all' ? 'Semua' : f === 'pending' ? 'Antrean' : f === 'processing' ? 'Proses' : 'Selesai'}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[3rem] border border-black/5">
            <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-zinc-400 font-bold uppercase tracking-widest text-xs">Memuat Permintaan...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[3rem] border border-black/5">
            <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300">
              <Bell size={40} />
            </div>
            <h3 className="font-bold text-xl">Tidak Ada Permintaan</h3>
            <p className="text-zinc-400">Belum ada permintaan data untuk kategori ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredRequests.map((req) => (
              <motion.div 
                layout
                key={req.id}
                className="bg-white p-6 rounded-[2.5rem] border border-black/5 shadow-sm hover:shadow-xl transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    req.status === 'pending' ? "bg-yellow-100 text-yellow-700" :
                    req.status === 'processing' ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                  )}>
                    {req.status}
                  </div>
                  <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                    <Clock size={12} /> {new Date(req.createdAt).toLocaleDateString('id-ID')}
                  </span>
                </div>

                <h3 className="font-black text-lg mb-1 uppercase leading-tight">{req.requesterName}</h3>
                <p className="text-xs font-bold text-zinc-400 mb-4">{req.unit}</p>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400">
                      <Database size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Jenis Data</p>
                      <p className="font-bold text-zinc-700">{req.dataType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400">
                      <Mail size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Kontak</p>
                      <p className="font-bold text-zinc-700">{req.contact || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-50 p-4 rounded-2xl mb-6 space-y-4">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Deskripsi Data</p>
                    <p className="text-xs text-zinc-700 leading-relaxed">{req.dataDescription || 'Tidak ada deskripsi'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Alasan</p>
                    <p className="text-xs text-zinc-600 leading-relaxed italic">"{req.reason}"</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {req.status === 'pending' && (
                    <button 
                      onClick={() => updateStatus(req.id, 'processing')}
                      className="flex-1 py-3 bg-black text-white text-[10px] font-black rounded-xl hover:bg-zinc-800 transition-all uppercase tracking-widest"
                    >
                      Proses
                    </button>
                  )}
                  {req.status === 'processing' && (
                    <button 
                      onClick={() => updateStatus(req.id, 'completed')}
                      className="flex-1 py-3 bg-emerald-500 text-white text-[10px] font-black rounded-xl hover:bg-emerald-600 transition-all uppercase tracking-widest"
                    >
                      Selesai
                    </button>
                  )}
                  {req.status !== 'pending' && (
                    <button 
                      onClick={() => updateStatus(req.id, 'pending')}
                      className="py-3 px-4 bg-zinc-100 text-zinc-400 text-[10px] font-black rounded-xl hover:bg-zinc-200 transition-all uppercase tracking-widest"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const WorkHub = ({ isAdmin }: { isAdmin: boolean }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState<'event' | 'task' | 'announcement' | null>(null);

  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  // Adjust padding for Monday start (Date.getDay() 0 is Sunday, 1 is Monday)
  const padding = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const calendar = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const calendarWithPadding = [...Array(padding).fill(null), ...calendar];

  useEffect(() => {
    const qEvents = query(collection(db, 'events'), orderBy('date', 'asc'));
    const qTasks = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const qAnnouncements = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));

    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, error => handleFirestoreError(error, OperationType.LIST, 'events'));

    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, error => handleFirestoreError(error, OperationType.LIST, 'tasks'));

    const unsubAnnouncements = onSnapshot(qAnnouncements, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, error => handleFirestoreError(error, OperationType.LIST, 'announcements'));

    return () => {
      unsubEvents();
      unsubTasks();
      unsubAnnouncements();
    };
  }, []);

  const deleteItem = async (collectionName: string, id: string) => {
    if (!confirm('Hapus item ini?')) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, collectionName);
    }
  };

  const updateTaskStatus = async (taskId: string, currentStatus: string) => {
    const statuses = ['Pending', 'In Progress', 'Completed'];
    const nextStatus = statuses[(statuses.indexOf(currentStatus) + 1) % statuses.length];
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: nextStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tasks');
    }
  };

  const AddModal = () => {
    const [formData, setFormData] = useState<any>({});
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
        const collectionName = showAddModal + 's';
        await addDoc(collection(db, collectionName), {
          ...formData,
          createdAt: new Date().toISOString()
        });
        setShowAddModal(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, showAddModal + 's');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black uppercase tracking-tight">Tambah {showAddModal}</h3>
            <button onClick={() => setShowAddModal(null)} className="p-2 hover:bg-zinc-100 rounded-full"><X size={20}/></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {showAddModal === 'event' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Judul Kegiatan</label>
                  <input required type="text" onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tanggal</label>
                  <input required type="date" onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400" />
                </div>
              </>
            )}
            {showAddModal === 'task' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Nama Tugas</label>
                  <input required type="text" onChange={e => setFormData({...formData, task: e.target.value})} className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Prioritas</label>
                  <select required onChange={e => setFormData({...formData, priority: e.target.value, status: 'Pending'})} className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400">
                    <option value="">Pilih Prioritas</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </>
            )}
            {showAddModal === 'announcement' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Judul Pengumuman</label>
                  <input required type="text" onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Waktu</label>
                    <input required type="text" placeholder="14:00 WITA" onChange={e => setFormData({...formData, time: e.target.value})} className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tanggal/Ket</label>
                    <input required type="text" placeholder="Besok / 20 Mar" onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Warna Aksen</label>
                  <select required onChange={e => setFormData({...formData, color: e.target.value})} className="w-full p-3 bg-zinc-50 border-none rounded-xl focus:ring-2 focus:ring-yellow-400">
                    <option value="">Pilih Warna</option>
                    <option value="border-yellow-400">Kuning</option>
                    <option value="border-rose-400">Merah</option>
                    <option value="border-emerald-400">Hijau</option>
                    <option value="border-blue-400">Biru</option>
                    <option value="border-zinc-700">Abu-abu</option>
                  </select>
                </div>
              </>
            )}
            <button disabled={submitting} type="submit" className="w-full py-4 bg-yellow-400 text-black font-black rounded-2xl shadow-lg hover:bg-yellow-500 transition-all disabled:opacity-50">
              {submitting ? 'MENYIMPAN...' : 'SIMPAN'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500">
      {showAddModal && <AddModal />}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-black tracking-tight">WORK HUB</h1>
          <p className="text-zinc-500 mt-2">Pusat kolaborasi dan manajemen tugas harian staf.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Calendar Section */}
          <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-xl flex items-center gap-2">
                <Calendar className="text-yellow-500" /> Kalender Kegiatan
              </h3>
              <div className="flex items-center gap-4">
                <span className="font-bold px-4 py-2 bg-zinc-50 rounded-xl text-sm">
                  {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(today)}
                </span>
                <button 
                  onClick={() => setShowAddModal('event')}
                  className="p-2 bg-yellow-400 text-black rounded-xl hover:bg-yellow-500 transition-all shadow-sm"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {days.map(day => (
                <div key={day} className="text-center text-xs font-bold text-zinc-400 py-2 uppercase tracking-widest">{day}</div>
              ))}
              {calendarWithPadding.map((date, index) => {
                if (date === null) {
                  return <div key={`padding-${index}`} className="aspect-square" />;
                }
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                const dayEvents = events.filter(e => e.date === dateStr);
                const isToday = date === today.getDate();

                return (
                  <div 
                    key={date} 
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-2xl text-sm font-medium transition-all cursor-pointer relative group",
                      isToday ? "bg-black text-yellow-400" : "hover:bg-yellow-50 bg-zinc-50/50",
                      dayEvents.length > 0 && "after:content-[''] after:absolute after:bottom-2 after:w-1 after:h-1 after:bg-yellow-500 after:rounded-full"
                    )}
                  >
                    {date}
                    {dayEvents.length > 0 && (
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-zinc-900 text-white p-3 rounded-2xl text-xs shadow-2xl">
                          {dayEvents.map((e, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 mb-1 last:mb-0">
                              <span className="font-bold truncate">{e.title}</span>
                              <button 
                                onClick={(ev) => { ev.stopPropagation(); deleteItem('events', e.id); }}
                                className="text-rose-400 hover:text-rose-300 pointer-events-auto"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tasks Section */}
          <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-xl">Tugas Tim Cloud-P</h3>
              <button 
                onClick={() => setShowAddModal('task')}
                className="p-2 bg-zinc-900 text-white rounded-xl hover:bg-black transition-all"
              >
                <Plus size={20} />
              </button>
            </div>
            <div className="space-y-4">
              {tasks.length === 0 ? (
                <p className="text-center py-8 text-zinc-400 text-sm italic">Belum ada tugas tim.</p>
              ) : (
                tasks.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => updateTaskStatus(item.id, item.status)}
                        className={cn(
                          "w-5 h-5 rounded-lg border-2 transition-all flex items-center justify-center",
                          item.status === 'Completed' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-300 hover:border-yellow-400'
                        )}
                      >
                        {item.status === 'Completed' && <CheckCircle2 size={12} />}
                      </button>
                      <div>
                        <p className={cn("font-bold text-sm", item.status === 'Completed' && "line-through text-zinc-400")}>{item.task}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                            item.priority === 'High' ? 'bg-rose-100 text-rose-600' : item.priority === 'Medium' ? 'bg-yellow-100 text-yellow-600' : 'bg-zinc-100 text-zinc-600'
                          )}>
                            {item.priority}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{item.status}</span>
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => deleteItem('tasks', item.id)}
                        className="p-2 text-zinc-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Announcements Section */}
        <div className="bg-zinc-900 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="flex items-center justify-between mb-8 relative z-10">
            <h3 className="font-bold text-xl">Papan Pengumuman</h3>
            <button 
              onClick={() => setShowAddModal('announcement')}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="space-y-8 relative z-10 flex-1">
            {announcements.length === 0 ? (
              <p className="text-center py-8 text-zinc-500 text-sm italic">Belum ada pengumuman.</p>
            ) : (
              announcements.map((news) => (
                <div key={news.id} className={cn("pl-4 border-l-2 space-y-1 group relative", news.color)}>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{news.date} • {news.time}</p>
                  <h4 className="font-bold text-sm leading-tight pr-8">{news.title}</h4>
                  {isAdmin && (
                    <button 
                      onClick={() => deleteItem('announcements', news.id)}
                      className="absolute top-0 right-0 p-1 text-zinc-700 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <button className="w-full mt-12 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-all">
            LIHAT SEMUA PENGUMUMAN
          </button>
        </div>
      </div>
    </div>
  );
};

const BerAKHLAK = () => {
  const values = [
    { 
      title: 'Berorientasi Pelayanan', 
      desc: 'Portal ini menyediakan Form Permintaan Data yang responsif untuk memenuhi kebutuhan staf dengan cepat.',
      icon: Heart,
      color: 'text-rose-500'
    },
    { 
      title: 'Akuntabel', 
      desc: 'Setiap data terdokumentasi dengan baik di Pusat Data Digital, menjamin transparansi dan tanggung jawab.',
      icon: ShieldCheck,
      color: 'text-blue-500'
    },
    { 
      title: 'Kompeten', 
      desc: 'Fitur Work Hub memfasilitasi peningkatan kinerja staf melalui manajemen tugas yang terorganisir.',
      icon: BarChart3,
      color: 'text-emerald-500'
    },
    { 
      title: 'Harmonis', 
      desc: 'Papan Pengumuman digital memastikan seluruh staf mendapatkan informasi yang sama untuk keselarasan kerja.',
      icon: Handshake,
      color: 'text-orange-500'
    },
    { 
      title: 'Loyal', 
      desc: 'Sistem keamanan data yang ketat menjaga kerahasiaan informasi negara dan instansi.',
      icon: CheckCircle2,
      color: 'text-indigo-500'
    },
    { 
      title: 'Adaptif', 
      desc: 'Transformasi dari penyimpanan fisik ke Digital Hub menunjukkan kesiapan Cloud-P menghadapi era digital.',
      icon: Zap,
      color: 'text-yellow-500'
    },
    { 
      title: 'Kolaboratif', 
      desc: 'Work Hub menjadi ruang kerja bersama untuk mencapai tujuan organisasi secara kolektif.',
      icon: Users,
      color: 'text-purple-500'
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-black text-black tracking-tight">ASN BerAKHLAK</h1>
        <p className="text-zinc-500 mt-2">Bagaimana Portal Cloud-P mengimplementasikan nilai-nilai inti ASN.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {values.map((v, i) => (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            key={i} 
            className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm hover:shadow-xl transition-all"
          >
            <v.icon size={32} className={cn("mb-4", v.color)} />
            <h3 className="font-bold text-xl mb-3">{v.title}</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">{v.desc}</p>
          </motion.div>
        ))}
      </div>

      <div className="bg-yellow-400 p-12 rounded-[3rem] text-center space-y-6 mt-12">
        <h2 className="text-3xl font-black">Membangun Budaya Kerja Digital</h2>
        <p className="text-black/70 max-w-xl mx-auto font-medium">
          "Portal ini bukan sekadar alat, melainkan manifestasi integritas dan dedikasi kita sebagai pelayan publik di BKPSDM Polewali Mandar."
        </p>
        <div className="flex justify-center gap-4">
          <div className="w-12 h-1 bg-black rounded-full" />
          <div className="w-12 h-1 bg-black/20 rounded-full" />
          <div className="w-12 h-1 bg-black/20 rounded-full" />
        </div>
      </div>
    </div>
  );
};

const PanduanCepat = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in zoom-in duration-500">
      <div className="bg-yellow-400 rounded-[3rem] p-12 text-black shadow-2xl shadow-yellow-400/20 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-black/5 rounded-full blur-3xl"></div>
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-black text-white rounded-3xl flex items-center justify-center mb-6 shadow-xl">
             <Smartphone size={40} />
          </div>
          <h1 className="text-5xl font-black tracking-tighter uppercase mb-4">SIM-ASN PORTAL</h1>
          <p className="text-xl font-bold opacity-80 uppercase tracking-widest">Digitalisasi Administrasi Bidang Cloud-P</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { title: "AKSES MUDAH", icon: Smartphone, desc: "Buka portal melalui browser Laptop atau Tablet Anda kapanpun." },
          { title: "INPUT CERDAS", icon: Database, desc: "Sistem menamai file secara otomatis sesuai standar kepegawaian." },
          { title: "AMAN & RAPI", icon: ShieldCheck, desc: "Terintegrasi Cloud Storage Google Drive tanpa risiko data hilang." }
        ].map((item, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-black/5 shadow-xl shadow-black/[0.02]">
            <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center mb-6 text-black">
              <item.icon size={24} />
            </div>
            <h3 className="text-lg font-black uppercase mb-3">{item.title}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 rounded-[3rem] p-12 text-white">
        <h2 className="text-3xl font-black mb-8 text-center uppercase tracking-tight italic">"Stop Silo Data, Mulai Berkolaborasi!"</h2>
        <div className="space-y-6 max-w-xl mx-auto">
          {[
            "Gunakan Deskripsi yang Jelas & Informatif.",
            "Pastikan Dokumen dalam Format Final.",
            "Lakukan Sinkronisasi Berkala untuk File Lama.",
            "Hubungi Operator jika Mengalami Kendala Akses."
          ].map((text, i) => (
            <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
              <div className="w-8 h-8 bg-yellow-400 text-black rounded-lg flex items-center justify-center font-black flex-shrink-0">
                {i + 1}
              </div>
              <p className="font-bold text-sm tracking-wide">{text}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="text-center text-zinc-400 text-xs font-bold uppercase tracking-[0.2em] pb-12">
        Bidang Pengembangan Informasi Kepegawaian & Pembinaan Aparatur <br/> Kabupaten Polewali Mandar © 2026
      </footer>
    </div>
  );
};

const InfografisAlur = () => {
  const steps = [
    {
      title: "Identifikasi & Finalisasi",
      desc: "Pastikan dokumen pekerjaan sudah dalam format final (disahkan/ditandatangani).",
      icon: ShieldCheck,
      color: "bg-blue-50 text-blue-600",
      stats: "01"
    },
    {
      title: "Proses Input SIM-ASN",
      desc: "Masukkan data periode dan deskripsi. Sistem akan melakukan Standarisasi Nama Otomatis.",
      icon: Database,
      color: "bg-yellow-50 text-yellow-600",
      stats: "02"
    },
    {
      title: "Upload & Auto-Relocate",
      desc: "File diunggah ke Google Drive dan langsung dipindahkan ke folder kategori yang tepat.",
      icon: Upload,
      color: "bg-green-50 text-green-600",
      stats: "03"
    },
    {
      title: "Hapus Silo Data",
      desc: "Data kini terpusat, transparan, dan dapat diakses oleh pimpinan maupun rekan sebidang.",
      icon: Heart,
      color: "bg-red-50 text-red-600",
      stats: "04"
    }
  ];

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-black text-black tracking-tight uppercase mb-4">Infografis Alur Kerja</h1>
        <p className="text-zinc-500">Visualisasi proses digitalisasi administrasi kepegawaian di Bidang Cloud-P untuk menghindari silo data.</p>
      </header>

      <div className="relative">
        {/* Connection Line (Desktop) */}
        <div className="hidden lg:block absolute top-[120px] left-[10%] right-[10%] h-1 bg-zinc-100 -z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-yellow-400 to-red-400 animate-pulse"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
          {steps.map((step, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.2 }}
              className="bg-white p-8 rounded-[3rem] border border-black/5 shadow-xl shadow-black/[0.02] flex flex-col items-center text-center group hover:-translate-y-2 transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-black text-xl mb-8 -mt-12 shadow-xl ring-8 ring-zinc-50 uppercase">
                {step.stats}
              </div>
              
              <div className={`w-20 h-20 ${step.color} rounded-[2rem] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                <step.icon size={32} />
              </div>

              <h3 className="text-lg font-black uppercase tracking-tight mb-4">{step.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{step.desc}</p>
              
              {i < steps.length - 1 && (
                <div className="lg:hidden mt-8 text-zinc-300">
                  <ArrowRightCircle size={32} className="rotate-90 md:rotate-0" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 text-white rounded-[3rem] p-12 text-center overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Database size={200} />
        </div>
        <div className="relative z-10">
          <h2 className="text-3xl font-black mb-4 uppercase">Hasil Akhir: Satu Data Cloud-P</h2>
          <p className="text-zinc-400 max-w-xl mx-auto mb-8">
            Dengan mengikuti alur ini, kita menjamin keamanan dokumen dan memudahkan proses pencarian data untuk kebutuhan audit maupun pelayanan.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
             <div className="bg-white/10 px-6 py-3 rounded-full backdrop-blur-md border border-white/10 text-sm font-bold">
               ✓ Terpusat di Drive
             </div>
             <div className="bg-white/10 px-6 py-3 rounded-full backdrop-blur-md border border-white/10 text-sm font-bold">
               ✓ Kolaboratif
             </div>
             <div className="bg-white/10 px-6 py-3 rounded-full backdrop-blur-md border border-white/10 text-sm font-bold">
               ✓ Penamaan Standar
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PusatTutorial = () => {
  const tutorials = [
    {
      title: "Panduan Pengunggahan Dokumen",
      desc: "Cara mengunggah berkas baru dengan standarisasi penamaan otomatis tahun, kode, dan deskripsi.",
      videoId: "dQw4w9WgXcQ", // Placeholder - ganti dengan ID video aslinya
      duration: "03:45",
      category: "Dasar"
    },
    {
      title: "Sinkronisasi Google Drive",
      desc: "Menghubungkan aplikasi dengan folder Cloud Storage dan merapikan file secara massal.",
      videoId: "dQw4w9WgXcQ", // Placeholder - ganti dengan ID video aslinya
      duration: "05:20",
      category: "Lanjutan"
    },
    {
      title: "Manajemen Arsip Digital",
      desc: "Mencari, memfilter, dan mengelola arsip statis untuk kebutuhan pelaporan.",
      videoId: "dQw4w9WgXcQ", // Placeholder - ganti dengan ID video aslinya
      duration: "04:10",
      category: "Arsip"
    },
    {
      title: "Pemanfaatan Work Hub",
      desc: "Menggunakan papan pengumuman dan manajemen tugas tim di Bidang Cloud-P.",
      videoId: "dQw4w9WgXcQ", // Placeholder - ganti dengan ID video aslinya
      duration: "06:15",
      category: "Kolaborasi"
    }
  ];

  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-black tracking-tight uppercase">Pusat Tutorial</h1>
          <p className="text-zinc-500 mt-2">Pelajari cara mengoptimalkan penggunaan portal SIM-ASN melalui panduan video.</p>
        </div>
        <div className="bg-yellow-400/10 px-4 py-2 rounded-2xl border border-yellow-400/20 flex items-center gap-2">
          <Youtube className="text-yellow-600" size={20} />
          <span className="text-yellow-700 font-bold text-sm">{tutorials.length} Video Panduan</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tutorials.map((t, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="group bg-white rounded-[2.5rem] border border-black/5 overflow-hidden hover:shadow-2xl hover:shadow-black/5 transition-all"
          >
            <div 
              className="aspect-video bg-zinc-100 relative overflow-hidden cursor-pointer"
              onClick={() => setSelectedVideo(t.videoId)}
            >
               {/* Video Thumbnail Placeholder */}
               <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/[0.03] group-hover:bg-zinc-900/[0.08] transition-colors">
                  <PlayCircle size={64} className="text-yellow-400 group-hover:scale-110 transition-transform shadow-2xl" />
               </div>
               <div className="absolute bottom-4 right-4 bg-black/80 text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
                 {t.duration}
               </div>
               <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-black/5">
                 {t.category}
               </div>
            </div>
            <div className="p-8">
              <h3 className="text-2xl font-black mb-3 group-hover:text-yellow-600 transition-colors uppercase tracking-tight">{t.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed mb-6">{t.desc}</p>
              <button 
                onClick={() => setSelectedVideo(t.videoId)}
                className="flex items-center gap-2 font-black text-xs uppercase tracking-[0.1em] text-black hover:text-yellow-600 transition-colors"
              >
                Putar Sekarang <ChevronRight size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {selectedVideo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 lg:p-12"
            onClick={() => setSelectedVideo(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-5xl aspect-video bg-black rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 relative"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setSelectedVideo(null)}
                className="absolute top-6 right-6 z-10 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-all"
              >
                <X size={24} />
              </button>
              <iframe 
                width="100%" 
                height="100%" 
                src={`https://www.youtube.com/embed/${selectedVideo}?autoplay=1`}
                title="YouTube video player" 
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen
              ></iframe>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const UnauthorizedPage = ({ onLogout }: { onLogout: () => void }) => {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-xl text-center border border-black/5"
      >
        <div className="w-20 h-20 bg-rose-100 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <ShieldCheck size={40} />
        </div>
        <h1 className="text-2xl font-black text-black mb-4">AKSES DITOLAK</h1>
        <p className="text-zinc-500 text-sm leading-relaxed mb-8">
          Maaf, akun Google Anda belum terdaftar dalam sistem Cloud-P. 
          Silakan hubungi Administrator untuk mendapatkan izin akses.
        </p>
        <button 
          onClick={onLogout}
          className="w-full py-4 bg-black text-white font-black rounded-2xl hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
        >
          <LogOut size={20} /> KELUAR & COBA LAGI
        </button>
      </motion.div>
    </div>
  );
};

const UserManagement = ({ user, userData }: { user?: any; userData?: any }) => {
  return (
    <UserManagementView
      currentUserEmail={user?.email || ''}
      currentUserId={user?.uid}
      currentUserRole={userData?.role}
    />
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(sessionStorage.getItem('google_drive_token'));
  const userSnapshotUnsubscribe = useRef<(() => void) | null>(null);

  const handleLoginSuccess = (token: string | null) => {
    setGoogleAccessToken(token);
    if (token) {
      sessionStorage.setItem('google_drive_token', token);
    } else {
      sessionStorage.removeItem('google_drive_token');
    }
  };

  const handleConnectDrive = async (): Promise<string | null> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;
      if (token) {
        setGoogleAccessToken(token);
        sessionStorage.setItem('google_drive_token', token);
      }
      return token;
    } catch (err) {
      console.error('Error connecting Google Drive:', err);
      alert('Gagal menghubungkan ke Google Drive.');
      return null;
    }
  };

  useEffect(() => {
    // 1. Initial Auth Listener
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setUserData(null);
        setAuthReady(true);
      }
    });

    // 2. Network Status
    const handleOffline = () => {
      alert("Koneksi internet terputus. Anda akan dialihkan ke halaman login untuk keamanan.");
      signOut(auth);
    };
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribeAuth();
      window.removeEventListener('offline', handleOffline);
      if (userSnapshotUnsubscribe.current) {
        userSnapshotUnsubscribe.current();
        userSnapshotUnsubscribe.current = null;
      }
    };
  }, []);

  // 3. User Data Listener & Profile Sync
  useEffect(() => {
    if (!user) return;

    let isSubscribed = true;
    const userRef = doc(db, 'users', user.uid);
    const isAdminUser = user.email === 'saininda@gmail.com' || user.uid === 'lUGYop8JDvcT2SJxjiEzBC8PD2p2';

    const syncProfile = async () => {
      try {
        console.log("Starting profile sync for:", user.uid);
        const userDoc = await getDoc(userRef);
        if (!isSubscribed) return;
        
        const existingData = userDoc.exists() ? userDoc.data() : null;
        console.log("Existing user data found:", !!existingData);

        const profileData = {
          displayName: (user.displayName || user.email || 'User').substring(0, 200),
          email: (user.email || '').substring(0, 200),
          photoURL: (user.photoURL || '').substring(0, 1000),
          lastLogin: new Date().toISOString(),
          updatedAt: serverTimestamp(),
          role: isAdminUser ? 'super_admin' : (existingData?.role || 'staff'),
          status: isAdminUser ? 'authorized' : (existingData?.status || 'pending'),
          createdAt: existingData?.createdAt || serverTimestamp(),
        };

        try {
          console.log("Attempting setDoc for profile sync with data:", JSON.stringify(profileData, null, 2));
          await setDoc(userRef, profileData, { merge: true });
          console.log("Profile data synced successfully");
        } catch (setErr) {
          console.error("setDoc failed during profile sync:", setErr);
          handleFirestoreError(setErr, OperationType.WRITE, `users/${user.uid}`);
          throw setErr;
        }
        
        if (!isSubscribed) return;

        // Cleanup previous listener before starting new one
        if (userSnapshotUnsubscribe.current) {
          userSnapshotUnsubscribe.current();
          userSnapshotUnsubscribe.current = null;
        }

        userSnapshotUnsubscribe.current = onSnapshot(userRef, (snapshot) => {
          if (isSubscribed && snapshot.exists()) {
            setUserData(snapshot.data());
          }
          setAuthReady(true);
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
          console.error("User snapshot error:", err.message);
          // If we have existing cached data, use it
          if (existingData) setUserData(existingData);
          setAuthReady(true);
        });

      } catch (err: any) {
        console.error("Profile sync error details:", err.message || err);
        // Fallback for authorized admins if check fails
        if (isAdminUser) {
          setUserData({ status: 'authorized', role: 'super_admin' });
        }
        setAuthReady(true);
      }
    };

    syncProfile();

    return () => {
      isSubscribed = false;
      if (userSnapshotUnsubscribe.current) {
        userSnapshotUnsubscribe.current();
        userSnapshotUnsubscribe.current = null;
      }
    };
  }, [user?.uid]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-yellow-400 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Multi-Level Access Control (RBAC):
  const isOwner = user.email === 'saininda@gmail.com' || user.uid === 'lUGYop8JDvcT2SJxjiEzBC8PD2p2';
  const effectiveRole: UserRole = isOwner ? 'super_admin' : (userData?.role as UserRole) || 'staff';
  const isSuperAdmin = isOwner || effectiveRole === 'super_admin';
  const isAdmin = isSuperAdmin || effectiveRole === 'admin';
  const isStaff = effectiveRole === 'staff';
  const isViewer = effectiveRole === 'viewer';
  const isAuthorized = userData?.status === 'authorized' || isOwner;

  if (!isAuthorized) {
    return <UnauthorizedPage onLogout={() => signOut(auth)} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard user={user} />;
      case 'datacenter': return (
        <DataCenter 
          user={user} 
          userData={userData} 
          googleAccessToken={googleAccessToken} 
          setGoogleAccessToken={handleLoginSuccess} 
        />
      );
      case 'arsipdigital': return (
        <ArsipDigital 
          user={user} 
          userData={userData} 
          googleAccessToken={googleAccessToken} 
          setGoogleAccessToken={handleLoginSuccess} 
        />
      );
      case 'spkpppk': return (
        <SPKMonitoringView 
          adminGoogleAccessToken={googleAccessToken} 
          onConnectAdminDrive={handleConnectDrive} 
        />
      );
      case 'requests': return <RequestManagement />;
      case 'workhub': return <WorkHub isAdmin={isAdmin} />;
      case 'infografis': return <InfografisAlur />;
      case 'panduancepat': return <PanduanCepat />;
      case 'tutorials': return <PusatTutorial />;
      case 'berakhlak': return <BerAKHLAK />;
      case 'usermanagement': return (
        <UserManagementView 
          currentUserEmail={user.email || ''} 
          currentUserId={user.uid}
          currentUserRole={effectiveRole}
        />
      );
      default: return <Dashboard user={user} />;
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 selection:bg-yellow-200">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          isOpen={isSidebarOpen} 
          setIsOpen={setIsSidebarOpen} 
          isAdmin={isAdmin}
          isSuperAdmin={isSuperAdmin}
          userRole={effectiveRole}
        />

        <main className={cn(
          "transition-all duration-300 min-h-screen p-4 lg:p-8",
          isSidebarOpen ? "lg:ml-64" : "lg:ml-20"
        )}>
          <div className="max-w-7xl mx-auto">
            {/* Top Bar */}
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-4">
                <div className="hidden lg:block">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em]">Selamat Datang,</p>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      effectiveRole === 'super_admin'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : effectiveRole === 'admin'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : effectiveRole === 'viewer'
                        ? 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {effectiveRole === 'super_admin' ? '👑 Super Admin' : 
                       effectiveRole === 'admin' ? '⭐ Admin Bidang' : 
                       effectiveRole === 'viewer' ? '👁️ Viewer' : '💼 Staf Operator'}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold">{user.displayName || 'Staf Cloud-P'}</h2>
                </div>
                <div className="lg:hidden">
                  {!isSidebarOpen && (
                    <button 
                      onClick={() => setIsSidebarOpen(true)}
                      className="p-3 bg-yellow-400 text-black rounded-2xl shadow-lg shadow-yellow-400/20 hover:bg-yellow-500 transition-all"
                    >
                      <Menu size={20} />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-black/5">
                <button className="p-2 hover:bg-zinc-100 rounded-xl transition-colors relative">
                  <Bell size={20} />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-yellow-500 rounded-full border-2 border-white" />
                </button>
                <div className="h-8 w-[1px] bg-zinc-100" />
                <div className="flex items-center gap-3 px-2">
                  <div className="text-right hidden sm:block">
                    <div className="flex items-center justify-end gap-1.5">
                      <p className="text-xs font-bold">{user.displayName || 'User'}</p>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        effectiveRole === 'super_admin' ? 'bg-purple-100 text-purple-700' :
                        effectiveRole === 'admin' ? 'bg-amber-100 text-amber-800' :
                        effectiveRole === 'viewer' ? 'bg-zinc-100 text-zinc-600' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {effectiveRole === 'super_admin' ? 'Super Admin' :
                         effectiveRole === 'admin' ? 'Admin' :
                         effectiveRole === 'viewer' ? 'Viewer' : 'Operator'}
                      </span>
                    </div>
                    <button 
                      onClick={handleLogout}
                      className="text-[10px] text-rose-500 font-bold uppercase tracking-wider hover:underline"
                    >
                      Keluar
                    </button>
                  </div>
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center font-black">
                      {user.displayName?.substring(0, 2).toUpperCase() || 'AD'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content Area */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <footer className="mt-20 py-8 border-t border-zinc-200 text-center">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
              © 2026 Bidang Cloud-P BKPSDM Polewali Mandar • Portal Cloud-P
            </p>
          </footer>
        </main>
      </div>
    </ErrorBoundary>
  );
}
