import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  ExternalLink, 
  FolderOpen, 
  Building2, 
  Briefcase, 
  Users, 
  Clock, 
  RefreshCw,
  FileCheck,
  CheckCircle2,
  Calendar,
  FolderPlus,
  Cloud,
  Sparkles
} from 'lucide-react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { SPK_DRIVE_ROOT_URL, SpkSubmissionRecord, getOpdNames } from '../data/pppkData';
import { getSpkAppsScriptUrl } from '../services/spkDriveService';
import { GoogleDriveAutomationModal } from './GoogleDriveAutomationModal';

interface SPKMonitoringViewProps {
  adminGoogleAccessToken?: string | null;
  onConnectAdminDrive?: () => Promise<string | null>;
}

export const SPKMonitoringView: React.FC<SPKMonitoringViewProps> = ({
  adminGoogleAccessToken,
  onConnectAdminDrive
}) => {
  const [submissions, setSubmissions] = useState<SpkSubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOpdFilter, setSelectedOpdFilter] = useState('');
  const [isAutomationModalOpen, setIsAutomationModalOpen] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState<boolean | null>(null);

  const opdList = useMemo(() => getOpdNames(), []);

  // Check Drive Web App connection status
  useEffect(() => {
    getSpkAppsScriptUrl()
      .then((url) => {
        setIsDriveConnected(Boolean(url && url.trim()));
      })
      .catch(() => setIsDriveConnected(false));
  }, [isAutomationModalOpen]);

  useEffect(() => {
    try {
      const q = query(
        collection(db, 'spk_pppk_submissions'),
        orderBy('uploadedAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs: SpkSubmissionRecord[] = [];
        snapshot.forEach((doc) => {
          docs.push({ id: doc.id, ...doc.data() } as SpkSubmissionRecord);
        });
        setSubmissions(docs);
        setLoading(false);
      }, (err) => {
        console.error('Error fetching SPK submissions:', err);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, []);

  // Filtered submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      const matchesSearch = 
        !searchQuery ||
        sub.nip.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.fileName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesOpd = !selectedOpdFilter || sub.opd === selectedOpdFilter;

      return matchesSearch && matchesOpd;
    });
  }, [submissions, searchQuery, selectedOpdFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = submissions.length;
    const opdSet = new Set(submissions.map((s) => s.opd));
    const unitSet = new Set(submissions.map((s) => `${s.opd}_${s.unitKerja}`));
    return {
      total,
      uniqueOpd: opdSet.size,
      uniqueUnits: unitSet.size,
    };
  }, [submissions]);

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-zinc-950 text-white rounded-3xl p-6 sm:p-8 border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-bold uppercase tracking-wider mb-2">
              <FileCheck size={14} />
              Monitoring Berkas Kepegawaian
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Pusat Berkas SPK PPPK Paruh Waktu
            </h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-xl">
              Pemantauan berkas Surat Perjanjian Kerja (SPK) yang telah diunggah oleh teman-teman pegawai PPPK Paruh Waktu se-Kabupaten Polewali Mandar.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap self-start md:self-auto">
            <button
              onClick={() => setIsAutomationModalOpen(true)}
              className="px-5 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-yellow-400 border border-yellow-400/40 hover:border-yellow-400 font-bold text-xs sm:text-sm rounded-2xl flex items-center gap-2 transition shadow-lg shrink-0"
            >
              <Sparkles size={16} />
              <span>⚡ Setup Folder & Web App Drive</span>
            </button>

            <a
              href={SPK_DRIVE_ROOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs sm:text-sm rounded-2xl flex items-center gap-2 transition shadow-lg shadow-yellow-400/20 shrink-0"
            >
              <FolderOpen size={16} />
              <span>Akses Folder Google Drive</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>

      {/* Drive Integration Status Banner for Admins */}
      {isDriveConnected === false ? (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-200/80 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles size={20} />
            </div>
            <div>
              <h4 className="font-bold text-sm sm:text-base">
                Peringatan: Jembatan Google Apps Script Web App Belum Terhubung
              </h4>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed max-w-2xl">
                Berkas SPK yang diunggah peserta akan tercatat di SIM ASN, namun <strong>belum otomatis masuk ke folder Google Drive</strong> (OPD &gt; Unit Kerja) karena URL Web App belum diaktifkan. Klik tombol di samping untuk konfigurasi.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsAutomationModalOpen(true)}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-xl shadow-sm transition shrink-0 self-start sm:self-auto flex items-center gap-2"
          >
            <span>Hubungkan Web App Sekarang</span>
            <ExternalLink size={13} />
          </button>
        </div>
      ) : isDriveConnected === true ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 flex items-center justify-between text-emerald-900 text-xs">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>Jembatan Google Drive Aktif: Berkas baru otomatis masuk ke folder OPD &gt; Unit Kerja dengan format nama resmi <strong className="font-mono text-emerald-800">SPK_NIP_Nama.pdf</strong>.</span>
          </div>
          <button
            onClick={() => setIsAutomationModalOpen(true)}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-xs underline underline-offset-2 shrink-0 ml-4"
          >
            Kelola Setup
          </button>
        </div>
      ) : null}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider block">Total SPK Terunggah</span>
            <span className="text-2xl sm:text-3xl font-black text-zinc-900 mt-1 block">
              {stats.total}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-yellow-400/20 text-yellow-600 flex items-center justify-center">
            <FileText size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider block">OPD Pengunggah</span>
            <span className="text-2xl sm:text-3xl font-black text-zinc-900 mt-1 block">
              {stats.uniqueOpd}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-700 flex items-center justify-center">
            <Building2 size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-zinc-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-zinc-400 text-xs font-bold uppercase tracking-wider block">Unit Kerja Terdata</span>
            <span className="text-2xl sm:text-3xl font-black text-zinc-900 mt-1 block">
              {stats.uniqueUnits}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <Briefcase size={24} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-zinc-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Cari NIP, nama pegawai, atau file..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-900 text-xs sm:text-sm focus:outline-none focus:border-yellow-400 focus:bg-white transition"
          />
        </div>

        <div className="w-full md:w-auto flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <select
              value={selectedOpdFilter}
              onChange={(e) => setSelectedOpdFilter(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-8 py-2.5 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs sm:text-sm focus:outline-none focus:border-yellow-400 cursor-pointer appearance-none"
            >
              <option value="">Semua OPD ({opdList.length})</option>
              {opdList.map((opd) => (
                <option key={opd} value={opd}>
                  {opd}
                </option>
              ))}
            </select>
          </div>

          {(searchQuery || selectedOpdFilter) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedOpdFilter('');
              }}
              className="px-3 py-2.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-bold transition"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Submissions List */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-400 space-y-3">
            <div className="w-8 h-8 border-3 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium">Memuat data berkas SPK...</p>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
              <FileText size={28} />
            </div>
            <h3 className="text-base font-bold text-zinc-800">
              {searchQuery || selectedOpdFilter ? 'Tidak Ada Hasil yang Cocok' : 'Belum Ada Berkas SPK yang Diunggah'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              {searchQuery || selectedOpdFilter
                ? 'Coba gunakan kata kunci pencarian lain atau ubah filter OPD Anda.'
                : 'Teman-teman PPPK Paruh Waktu dapat mengunggah berkas SPK melalui tombol di halaman utama (Login).'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-4 px-6">Pegawai (NIP & Nama)</th>
                  <th className="py-4 px-6">OPD & Unit Kerja</th>
                  <th className="py-4 px-6">Nama Berkas (SPK_NIP_Nama)</th>
                  <th className="py-4 px-6">Status Drive</th>
                  <th className="py-4 px-6">Waktu Unggah</th>
                  <th className="py-4 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredSubmissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-zinc-50/80 transition">
                    <td className="py-4 px-6">
                      <div className="font-bold text-zinc-900">{sub.nama}</div>
                      <div className="font-mono text-xs text-zinc-500 mt-0.5">NIP: {sub.nip}</div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-zinc-800">{sub.opd}</div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                        <Briefcase size={12} className="shrink-0" />
                        <span>{sub.unitKerja}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 font-bold text-[10px] uppercase border border-rose-200">
                          PDF
                        </span>
                        <span className="font-mono font-semibold text-zinc-800 truncate max-w-[220px]" title={sub.fileName}>
                          {sub.fileName}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2">
                        <span>{formatFileSize(sub.fileSize)}</span>
                        {sub.originalFileName && sub.originalFileName !== sub.fileName && (
                          <span className="text-[10px] text-zinc-400 italic" title={`Nama asli saat diunggah: ${sub.originalFileName}`}>
                            (asli: {sub.originalFileName.length > 20 ? sub.originalFileName.slice(0, 18) + '...' : sub.originalFileName})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {sub.driveFileUrl ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                          <CheckCircle2 size={12} />
                          <span>Tersimpan di Drive</span>
                        </span>
                      ) : (
                        <span 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200"
                          title="Berkas tercatat di sistem SIM ASN. Belum ada di folder Google Drive karena Web App belum terhubung saat peserta mengunggah."
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>Belum Masuk Drive</span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-zinc-600 flex items-center gap-1.5">
                        <Clock size={13} className="text-zinc-400 shrink-0" />
                        <span>{formatDate(sub.uploadedAt)}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {sub.driveFileUrl ? (
                          <a
                            href={sub.driveFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 font-bold text-xs transition"
                            title="Buka Berkas PDF Fisik di Google Drive"
                          >
                            <FileText size={13} />
                            <span>Lihat PDF</span>
                            <ExternalLink size={11} />
                          </a>
                        ) : null}
                        <a
                          href={sub.driveFolderUrl || sub.targetDriveUrl || SPK_DRIVE_ROOT_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-yellow-400 hover:text-black text-zinc-700 font-bold text-xs transition"
                          title="Buka Folder Drive Penyimpanan"
                        >
                          <FolderOpen size={13} />
                          <span>Folder Drive</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Google Drive Automation Modal */}
      <GoogleDriveAutomationModal
        isOpen={isAutomationModalOpen}
        onClose={() => setIsAutomationModalOpen(false)}
        adminGoogleAccessToken={adminGoogleAccessToken}
        onConnectAdminDrive={onConnectAdminDrive}
      />
    </div>
  );
};
