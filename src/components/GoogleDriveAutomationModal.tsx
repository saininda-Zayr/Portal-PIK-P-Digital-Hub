import React, { useState, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  ExternalLink, 
  FolderPlus, 
  Play, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Cloud, 
  RefreshCw, 
  ShieldCheck, 
  FileCode, 
  FolderOpen,
  ArrowRight,
  Info
} from 'lucide-react';
import { generateGoogleAppsScriptCode } from '../data/driveScriptHelper';
import { SPK_DRIVE_ROOT_URL, SPK_DRIVE_FOLDER_ID, ALL_OPD } from '../data/pppkData';
import { 
  getSpkAppsScriptUrl, 
  saveSpkAppsScriptUrl, 
  testSpkAppsScriptUrl,
  createAllFoldersInDriveWithOAuth 
} from '../services/spkDriveService';

interface GoogleDriveAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminGoogleAccessToken?: string | null;
  onConnectAdminDrive?: () => Promise<string | null>;
}

export const GoogleDriveAutomationModal: React.FC<GoogleDriveAutomationModalProps> = ({
  isOpen,
  onClose,
  adminGoogleAccessToken,
  onConnectAdminDrive
}) => {
  const [activeTab, setActiveTab] = useState<'script' | 'webapp' | 'inapp'>('script');
  const [copied, setCopied] = useState(false);
  
  // Web App Config State
  const [webAppUrl, setWebAppUrl] = useState('');
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // In-App Runner State
  const [isInAppRunning, setIsInAppRunning] = useState(false);
  const [inAppProgress, setInAppProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [inAppError, setInAppError] = useState<string | null>(null);
  const [inAppSuccess, setInAppSuccess] = useState<string | null>(null);

  const scriptCode = React.useMemo(() => generateGoogleAppsScriptCode(), []);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingConfig(true);
      getSpkAppsScriptUrl()
        .then((url) => {
          setWebAppUrl(url);
          setIsLoadingConfig(false);
        })
        .catch(() => setIsLoadingConfig(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveWebAppUrl = async () => {
    setIsSavingConfig(true);
    setSaveSuccess(false);
    try {
      await saveSpkAppsScriptUrl(webAppUrl);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Gagal menyimpan URL: ' + err.message);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    if (!webAppUrl.trim()) {
      alert('Silakan masukkan URL Web App terlebih dahulu.');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testSpkAppsScriptUrl(webAppUrl);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Gagal menguji koneksi.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRunInAppCreation = async () => {
    let token = adminGoogleAccessToken;
    if (!token && onConnectAdminDrive) {
      token = await onConnectAdminDrive();
    }

    if (!token) {
      alert('Perlu menghubungkan akun Google Admin yang memiliki akses edit ke folder Google Drive tujuan.');
      return;
    }

    setIsInAppRunning(true);
    setInAppError(null);
    setInAppSuccess(null);
    setInAppProgress({ current: 0, total: ALL_OPD.length, message: 'Menyiapkan koneksi ke Google Drive...' });

    try {
      const result = await createAllFoldersInDriveWithOAuth(token, (current, total, message) => {
        setInAppProgress({ current, total, message });
      });

      setInAppSuccess(`Berhasil membuat ${result.createdOpdCount} folder OPD dan ${result.createdUnitCount} subfolder Unit Kerja langsung di Google Drive!`);
    } catch (err: any) {
      setInAppError(err.message || 'Terjadi kesalahan saat membuat folder.');
    } finally {
      setIsInAppRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl bg-zinc-950 text-white rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shrink-0">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-black shadow-lg shadow-yellow-400/20 shrink-0">
              <FolderPlus size={24} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                Solusi Integrasi Google Drive
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Generator Folder & Pengunggahan Otomatis ke Drive
              </h2>
              <p className="text-zinc-400 text-xs sm:text-sm">
                Folder Utama: <span className="font-mono text-zinc-300">1feUjhSZy5yIe_KKBJ_DOJi3z39ROWr1e</span>
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 mt-5 border-t border-zinc-800/80 pt-4 flex-wrap">
            <button
              onClick={() => setActiveTab('script')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'script'
                  ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/20'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <FileCode size={15} />
              1. Skrip Pembuat Folder (Apps Script)
            </button>
            <button
              onClick={() => setActiveTab('webapp')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'webapp'
                  ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/20'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Cloud size={15} />
              2. Hubungkan Pengunggahan Otomatis (Web App)
              {webAppUrl && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('inapp')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'inapp'
                  ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/20'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Sparkles size={15} />
              3. Buat Langsung via Aplikasi
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* TAB 1: SCRIPT & BULK FOLDER CREATION */}
          {activeTab === 'script' && (
            <div className="space-y-6">
              {/* Explanation Note */}
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs sm:text-sm text-blue-200 space-y-2">
                <div className="font-bold flex items-center gap-2 text-blue-400 text-base">
                  <Info size={18} />
                  Cara Membuat Seluruh 45 Folder OPD & Subfolder Sekaligus
                </div>
                <p className="text-zinc-300 leading-relaxed text-xs sm:text-sm">
                  Membuat 45 folder OPD dan ratusan subfolder unit kerja secara manual di Google Drive akan memakan waktu sangat lama. 
                  Gunakan skrip resmi Google Apps Script di bawah ini: cukup <strong>Jalankan sekali (1-Klik)</strong>, skrip akan membuat seluruh struktur folder dan subfolder secara otomatis dalam waktu ± 20 detik!
                </p>
              </div>

              {/* Step by Step Instructions */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 bg-zinc-900/80 rounded-2xl border border-zinc-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <h4 className="font-bold text-white">Buka Apps Script</h4>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    Buka situs Google Apps Script gratis atau dari Google Drive Anda.
                  </p>
                  <a
                    href="https://script.google.com/home/start"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-yellow-400 hover:underline font-bold mt-1"
                  >
                    Buka script.google.com <ExternalLink size={11} />
                  </a>
                </div>

                <div className="p-3.5 bg-zinc-900/80 rounded-2xl border border-zinc-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <h4 className="font-bold text-white">Tempelkan Skrip</h4>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    Klik tombol <strong>"Salin Seluruh Skrip"</strong> di bawah, lalu tempelkan ke editor kode Apps Script.
                  </p>
                </div>

                <div className="p-3.5 bg-zinc-900/80 rounded-2xl border border-zinc-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <h4 className="font-bold text-white">Klik "Jalankan"</h4>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    Pilih fungsi <code>buatSemuaFolderDanSubfolder</code> lalu klik tombol <strong>Jalankan (Run)</strong>.
                  </p>
                </div>

                <div className="p-3.5 bg-zinc-900/80 rounded-2xl border border-zinc-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-400/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                    ✓
                  </div>
                  <h4 className="font-bold text-white">Folder Siap!</h4>
                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    Buka folder Google Drive Anda, seluruh 45 OPD & Unit Kerja sudah tersusun rapi.
                  </p>
                </div>
              </div>

              {/* Code Box with 1-Click Copy */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Kode Google Apps Script Lengkap (45 OPD & Unit Kerja)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                      Termasuk Penampung Unggah Otomatis
                    </span>
                  </div>

                  <button
                    onClick={handleCopyScript}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 ${
                      copied 
                        ? 'bg-emerald-500 text-black' 
                        : 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-lg shadow-yellow-400/20'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check size={14} /> Berhasil Disalin!
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Salin Seluruh Skrip
                      </>
                    )}
                  </button>
                </div>

                <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 p-4 font-mono text-xs text-zinc-300 max-h-64 overflow-y-auto">
                  <pre>{scriptCode.slice(0, 1500)}...</pre>
                  <div className="sticky bottom-0 pt-4 bg-gradient-to-t from-zinc-900 to-transparent flex justify-center">
                    <button
                      onClick={handleCopyScript}
                      className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-yellow-400 text-xs font-bold border border-zinc-700 flex items-center gap-1.5"
                    >
                      <Copy size={12} /> Salin Skrip Lengkap ({scriptCode.length} karakter)
                    </button>
                  </div>
                </div>
              </div>

              {/* Drive Link Button */}
              <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800 flex-wrap gap-3">
                <div className="text-xs text-zinc-400">
                  Folder Tujuan: <strong className="text-white">1feUjhSZy5yIe_KKBJ_DOJi3z39ROWr1e</strong>
                </div>
                <a
                  href={SPK_DRIVE_ROOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  <FolderOpen size={14} className="text-yellow-400" />
                  Buka Folder di Google Drive ↗
                </a>
              </div>
            </div>
          )}

          {/* TAB 2: WEB APP CONFIGURATION & AUTO-UPLOAD */}
          {activeTab === 'webapp' && (
            <div className="space-y-6">
              {/* Clarification about why files were not uploaded before */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm space-y-2.5">
                <div className="font-bold flex items-center gap-2 text-yellow-400 text-base">
                  <AlertCircle size={18} />
                  Mengapa Sebelumnya Berkas Belum Masuk ke Folder Google Drive?
                </div>
                <p className="text-zinc-300 leading-relaxed text-xs sm:text-sm">
                  Google Drive merupakan penyimpanan awan terproteksi. Ketika peserta PPPK mengunggah berkas dari halaman depan tanpa login Google, berkas tercatat di sistem SIM ASN namun memerlukan <strong>Jembatan Aplikasi Web (Web App Bridge)</strong> agar berkas fisik PDF dapat langsung otomatis tersimpan ke dalam folder Google Drive Anda (<span className="text-yellow-400 font-mono text-[11px]">OPD &gt; Unit Kerja</span>).
                </p>
                <div className="p-3 bg-black/40 rounded-xl border border-yellow-400/20 text-xs space-y-1">
                  <span className="text-yellow-400 font-bold uppercase tracking-wider text-[11px] block">
                    ✨ Aturan Penamaan Berkas Terbaru: SPK_[NIP]_[Nama].pdf
                  </span>
                  <span className="text-zinc-300 block">
                    Skrip Apps Script telah diperbarui otomatis! Setiap berkas yang diunggah peserta akan langsung disimpan dengan nama resmi standar BKPSDM: <code className="text-white font-bold bg-zinc-800 px-1.5 py-0.5 rounded">SPK_NIP_Nama.pdf</code>.
                  </span>
                </div>
                <p className="text-zinc-400 leading-relaxed text-xs">
                  Skrip di Tab 1 sudah dilengkapi fungsi <code>doPost</code> untuk menerima file dan menyimpannya ke folder yang tepat. Anda hanya perlu <strong>Menerapkan (Deploy)</strong> skrip sebagai Aplikasi Web satu kali saja di bawah ini.
                </p>
              </div>

              {/* Instructions to Deploy */}
              <div className="p-5 bg-zinc-900 rounded-2xl border border-zinc-800 space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-yellow-400 text-black flex items-center justify-center text-xs font-black">!</span>
                  Cara Mendapatkan URL Aplikasi Web (Hanya 1 Menit):
                </h4>
                <ol className="list-decimal list-inside text-xs text-zinc-300 space-y-2 leading-relaxed">
                  <li>Buka proyek Apps Script yang telah Anda tempelkan kodenya di Tab 1.</li>
                  <li>Di pojok kanan atas, klik tombol biru <strong>"Terapkan" (Deploy)</strong> &gt; pilih <strong>"Deployment baru"</strong>.</li>
                  <li>Klik ikon gerigi di sebelah kiri jenis deployment &gt; pilih <strong>"Aplikasi Web" (Web App)</strong>.</li>
                  <li>Isi konfigurasi berikut:
                    <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-zinc-400">
                      <li>Deskripsi: <span className="text-white font-mono">Server SPK PPPK BKPSDM</span></li>
                      <li>Jalankan sebagai: <strong className="text-white">Saya (Akun Anda)</strong></li>
                      <li>Siapa yang memiliki akses: <strong className="text-yellow-400">Siapa saja (Anyone)</strong> (Wajib, agar para PPPK bisa kirim berkas tanpa harus punya akun admin)</li>
                    </ul>
                  </li>
                  <li>Klik <strong>"Terapkan" (Deploy)</strong>, lalu salin <strong>"URL Aplikasi Web"</strong> yang berakhiran <code>/exec</code>.</li>
                </ol>
              </div>

              {/* Input for Web App URL */}
              <div className="p-5 bg-zinc-900/80 rounded-2xl border border-zinc-800 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
                    <span>URL Aplikasi Web (Google Apps Script Web App URL)</span>
                    {webAppUrl && (
                      <span className="text-[11px] text-emerald-400 font-normal flex items-center gap-1">
                        <CheckCircle2 size={12} /> Tersimpan
                      </span>
                    )}
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Contoh: <code>https://script.google.com/macros/s/AKfycbx.../exec</code>
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={webAppUrl}
                    onChange={(e) => setWebAppUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-200 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                  />
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting || !webAppUrl}
                    className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                  >
                    {isTesting ? <RefreshCw size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                    Tes Koneksi
                  </button>
                  <button
                    onClick={handleSaveWebAppUrl}
                    disabled={isSavingConfig || !webAppUrl}
                    className="px-5 py-3 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black rounded-xl text-xs font-black shadow-md shadow-yellow-400/20 transition flex items-center gap-1.5 shrink-0"
                  >
                    {isSavingConfig ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    Simpan & Aktifkan
                  </button>
                </div>

                {/* Test Result Message */}
                {testResult && (
                  <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    testResult.success 
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' 
                      : 'bg-red-500/15 border border-red-500/30 text-red-300'
                  }`}>
                    {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{testResult.message}</span>
                  </div>
                )}

                {/* Save Success Notice */}
                {saveSuccess && (
                  <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-bold flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    <span>Konfigurasi Web App berhasil disimpan! Mulai saat ini berkas SPK otomatis tersimpan ke Google Drive.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: IN-APP DIRECT GENERATOR */}
          {activeTab === 'inapp' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm space-y-3">
                <div className="font-bold flex items-center gap-2 text-yellow-400 text-base">
                  <Sparkles size={18} />
                  Pembuatan Folder Langsung dari Aplikasi
                </div>
                <p className="text-zinc-300 leading-relaxed text-xs sm:text-sm">
                  Jika Anda adalah Admin BKPSDM yang memiliki hak akses Edit ke Google Drive folder <span className="font-mono text-white">1feUjhSZy5yIe_KKBJ_DOJi3z39ROWr1e</span>, Anda dapat membuat seluruh 45 folder OPD dan subfolder Unit Kerja langsung dari tombol di bawah ini tanpa membuka Google Apps Script.
                </p>

                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-400">
                  Status Akun Admin Google: {adminGoogleAccessToken ? (
                    <strong className="text-emerald-400">Terhubung (Siap Eksekusi)</strong>
                  ) : (
                    <strong className="text-amber-400">Belum Terhubung (Akan meminta otorisasi akun Google)</strong>
                  )}
                </div>
              </div>

              {/* Progress Box */}
              {inAppProgress && (
                <div className="p-5 bg-zinc-900 rounded-2xl border border-zinc-800 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white flex items-center gap-2">
                      <RefreshCw size={13} className="animate-spin text-yellow-400" />
                      {inAppProgress.message}
                    </span>
                    <span className="font-mono text-yellow-400">
                      {inAppProgress.current} / {inAppProgress.total} OPD ({Math.round((inAppProgress.current / inAppProgress.total) * 100)}%)
                    </span>
                  </div>

                  <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden p-0.5 border border-zinc-800">
                    <div 
                      className="h-full bg-yellow-400 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((inAppProgress.current / inAppProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Success Result */}
              {inAppSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-3">
                  <CheckCircle2 size={20} className="shrink-0 text-emerald-400" />
                  <div>
                    <p className="font-black text-sm">{inAppSuccess}</p>
                    <a
                      href={SPK_DRIVE_ROOT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-200 underline mt-1"
                    >
                      Buka Google Drive untuk Melihat Seluruh Folder ↗
                    </a>
                  </div>
                </div>
              )}

              {/* Error Result */}
              {inAppError && (
                <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-3">
                  <AlertCircle size={20} className="shrink-0 text-red-400" />
                  <span>{inAppError}</span>
                </div>
              )}

              {/* Action Button */}
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleRunInAppCreation}
                  disabled={isInAppRunning}
                  className="px-8 py-4 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-black rounded-2xl text-sm shadow-xl shadow-yellow-400/20 transition active:scale-95 flex items-center gap-2"
                >
                  {isInAppRunning ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Sedang Membuat Seluruh Folder di Google Drive...
                    </>
                  ) : (
                    <>
                      <Play size={18} />
                      Mulai Buat Seluruh Folder di Google Drive Sekarang
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex justify-between items-center shrink-0">
          <a
            href={SPK_DRIVE_ROOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 font-bold"
          >
            <FolderOpen size={13} className="text-yellow-400" />
            Buka Root Folder Google Drive <ExternalLink size={11} />
          </a>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
