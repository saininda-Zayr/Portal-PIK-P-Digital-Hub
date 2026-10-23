import React, { useState, useMemo, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Search, 
  Building2, 
  Briefcase, 
  User, 
  ChevronDown,
  RotateCcw,
  ShieldCheck,
  FolderOpen,
  ArrowRight
} from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  PppkPegawai, 
  searchPegawai, 
  getOpdNames, 
  getUnitKerjaByOpd,
  SPK_DRIVE_ROOT_URL, 
  MAX_SPK_FILE_SIZE_BYTES 
} from '../data/pppkData';
import { getSpkAppsScriptUrl, uploadSpkToGoogleDriveWebapp } from '../services/spkDriveService';

interface SPKUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SPKUploadModal: React.FC<SPKUploadModalProps> = ({ isOpen, onClose }) => {
  // Form State
  const [selectedPegawai, setSelectedPegawai] = useState<PppkPegawai | null>(null);
  const [pegawaiQuery, setPegawaiQuery] = useState('');
  const [isSearchingPegawai, setIsSearchingPegawai] = useState(false);
  
  const [selectedOpd, setSelectedOpd] = useState('');
  const [selectedUnitKerja, setSelectedUnitKerja] = useState('');
  
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<{
    nip: string;
    nama: string;
    opd: string;
    unitKerja: string;
    fileName: string;
    fileSize: number;
    uploadedAt: string;
    driveFileUrl?: string;
    driveFolderUrl?: string;
    status?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // OPD list
  const opdList = useMemo(() => getOpdNames(), []);

  // Filtered Unit Kerja list based on selected OPD
  const unitKerjaList = useMemo(() => {
    if (!selectedOpd) return [];
    return getUnitKerjaByOpd(selectedOpd);
  }, [selectedOpd]);

  // Pegawai search results
  const pegawaiResults = useMemo(() => {
    return searchPegawai(pegawaiQuery, 20);
  }, [pegawaiQuery]);

  if (!isOpen) return null;

  // Handle file validation
  const validateAndSetFile = (selectedFile: File) => {
    setFileError(null);
    
    // Check if strictly PDF
    const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setFileError('Format berkas tidak valid! Hanya format berkas PDF (.pdf) yang diperbolehkan.');
      setFile(null);
      return;
    }

    // Check size limit: strictly under 1 MB (< 1048576 bytes)
    if (selectedFile.size > MAX_SPK_FILE_SIZE_BYTES) {
      const sizeMb = (selectedFile.size / (1024 * 1024)).toFixed(2);
      setFileError(`Ukuran berkas (${sizeMb} MB) melebihi batas maksimal 1 MB! Silakan kompresi berkas PDF Anda terlebih dahulu.`);
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const resetForm = () => {
    setSelectedPegawai(null);
    setPegawaiQuery('');
    setSelectedOpd('');
    setSelectedUnitKerja('');
    setFile(null);
    setFileError(null);
    setSubmitError(null);
    setSubmitSuccess(false);
    setLastSubmission(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedPegawai) {
      setSubmitError('Silakan pilih NIP dan Nama Pegawai terlebih dahulu.');
      return;
    }
    if (!selectedOpd) {
      setSubmitError('Silakan pilih OPD pegawai.');
      return;
    }
    if (!selectedUnitKerja) {
      setSubmitError('Silakan pilih Unit Kerja pegawai.');
      return;
    }
    if (!file) {
      setSubmitError('Silakan pilih berkas SPK (PDF < 1 MB) untuk diunggah.');
      return;
    }

    setIsSubmitting(true);
    setSubmittingStatus('Menyiapkan berkas SPK...');

    try {
      let driveFileUrl = '';
      let driveFolderUrl = '';
      let driveFileId = '';
      let submissionStatus = 'Tersimpan';

      // Check if Google Apps Script Web App URL is configured for automatic Drive upload
      const webAppUrl = await getSpkAppsScriptUrl();
      if (webAppUrl) {
        try {
          setSubmittingStatus('Mengunggah berkas PDF langsung ke Google Drive...');
          const driveResult = await uploadSpkToGoogleDriveWebapp({
            webAppUrl,
            nip: selectedPegawai.nip,
            nama: selectedPegawai.nama,
            opd: selectedOpd,
            unitKerja: selectedUnitKerja,
            file
          });

          if (driveResult.success) {
            driveFileUrl = driveResult.fileUrl || '';
            driveFolderUrl = driveResult.folderUrl || '';
            driveFileId = driveResult.fileId || '';
            submissionStatus = 'Tersimpan di Google Drive';
          }
        } catch (driveErr: any) {
          console.warn('Gagal menyimpan berkas ke Google Drive Web App, menyimpan riwayat ke sistem:', driveErr);
          submissionStatus = 'Tercatat (Menunggu Sinkronisasi Drive)';
        }
      }

      setSubmittingStatus('Menyimpan riwayat ke database kepegawaian...');

      const submissionData = {
        nip: selectedPegawai.nip,
        nama: selectedPegawai.nama,
        opd: selectedOpd,
        unitKerja: selectedUnitKerja,
        fileName: file.name,
        fileSize: file.size,
        fileType: 'application/pdf',
        status: submissionStatus,
        targetDriveUrl: SPK_DRIVE_ROOT_URL,
        targetFolderPath: `SPK PPPK / ${selectedOpd} / ${selectedUnitKerja}`,
        driveFileUrl: driveFileUrl || null,
        driveFolderUrl: driveFolderUrl || null,
        driveFileId: driveFileId || null,
        uploadedAt: new Date().toISOString()
      };

      // Save submission to Firestore
      await addDoc(collection(db, 'spk_pppk_submissions'), submissionData);

      setLastSubmission({
        nip: selectedPegawai.nip,
        nama: selectedPegawai.nama,
        opd: selectedOpd,
        unitKerja: selectedUnitKerja,
        fileName: file.name,
        fileSize: file.size,
        driveFileUrl,
        driveFolderUrl,
        status: submissionStatus,
        uploadedAt: new Date().toLocaleString('id-ID', {
          dateStyle: 'full',
          timeStyle: 'medium'
        })
      });

      setSubmitSuccess(true);
    } catch (err: any) {
      console.error('Error saving SPK submission:', err);
      setSubmitError(err.message || 'Gagal menyimpan berkas SPK. Silakan periksa koneksi dan coba lagi.');
    } finally {
      setIsSubmitting(false);
      setSubmittingStatus('');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    const kb = (bytes / 1024).toFixed(1);
    return kb + ' KB';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-zinc-950 text-white rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="relative p-6 sm:p-8 bg-gradient-to-b from-zinc-900 to-zinc-950 border-b border-zinc-800/80">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-700 transition"
            title="Tutup Modal"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-black shadow-lg shadow-yellow-400/20 shrink-0">
              <FileText size={24} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                Layanan PPPK Paruh Waktu
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Unggah Berkas SPK PPPK
              </h2>
              <p className="text-zinc-400 text-xs sm:text-sm">
                BKPSDM Pemerintah Kabupaten Polewali Mandar
              </p>
            </div>
          </div>

          {/* REQUIRED NOTICE BANNER */}
          <div className="mt-5 p-3.5 sm:p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-start gap-3 shadow-sm">
            <AlertTriangle size={20} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-yellow-300 text-xs sm:text-sm font-semibold leading-relaxed">
              sebelum mengunggah berkas pastikan SPK telah bermaterai dan di tanda tangan
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 max-h-[75vh] overflow-y-auto">
          {submitSuccess && lastSubmission ? (
            /* --- SUCCESS CONFIRMATION VIEW --- */
            <div className="space-y-6 text-center py-2 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-xl">
                <CheckCircle2 size={36} />
              </div>

              <div>
                <h3 className="text-2xl font-black text-white tracking-tight">
                  Berkas SPK Berhasil Diunggah!
                </h3>
                <p className="text-zinc-400 text-sm mt-1">
                  Data Surat Perjanjian Kerja Anda telah berhasil dicatat dalam sistem kepegawaian BKPSDM.
                </p>
              </div>

              {/* Submission details card */}
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 text-left space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                  <div>
                    <span className="text-zinc-500 block text-[11px] uppercase tracking-wider">Nama Pegawai</span>
                    <span className="font-bold text-white">{lastSubmission.nama}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[11px] uppercase tracking-wider">NIP PPPK</span>
                    <span className="font-mono font-bold text-yellow-400">{lastSubmission.nip}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[11px] uppercase tracking-wider">OPD</span>
                    <span className="font-medium text-zinc-200">{lastSubmission.opd}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[11px] uppercase tracking-wider">Unit Kerja</span>
                    <span className="font-medium text-zinc-200">{lastSubmission.unitKerja}</span>
                  </div>
                  <div className="sm:col-span-2 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                    <div>
                      <span className="text-zinc-500 block text-[11px] uppercase tracking-wider">Nama Berkas (PDF)</span>
                      <span className="font-medium text-zinc-300 truncate block max-w-xs">{lastSubmission.fileName}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-mono">
                      {formatBytes(lastSubmission.fileSize)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Drive Folder Structure Guide */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-yellow-400/20 text-left">
                <div className="flex items-center gap-2 mb-2 text-yellow-400 font-bold text-xs uppercase tracking-wider">
                  <FolderOpen size={16} />
                  <span>Struktur Folder Penyimpanan Google Drive:</span>
                </div>
                <div className="font-mono text-xs text-zinc-300 bg-black/60 p-3 rounded-xl border border-zinc-800/80 space-y-1">
                  <div className="text-zinc-400">📁 Folder Utama Drive SPK PPPK</div>
                  <div className="pl-4 text-zinc-300">└── 📁 OPD: <span className="text-yellow-400 font-bold">{lastSubmission.opd}</span></div>
                  <div className="pl-8 text-zinc-200">└── 📁 Unit Kerja: <span className="text-white font-bold">{lastSubmission.unitKerja}</span></div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                {lastSubmission.driveFileUrl ? (
                  <a
                    href={lastSubmission.driveFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3.5 px-6 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-black font-black text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-400/20"
                  >
                    <FileText size={18} />
                    <span>Lihat Berkas Fisik di Google Drive</span>
                    <ExternalLink size={16} />
                  </a>
                ) : null}
                <a
                  href={lastSubmission.driveFolderUrl || SPK_DRIVE_ROOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${lastSubmission.driveFileUrl ? 'sm:w-auto' : 'flex-1'} py-3.5 px-6 rounded-2xl bg-yellow-400 hover:bg-yellow-300 text-black font-black text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-yellow-400/20`}
                >
                  <FolderOpen size={18} />
                  <span>Buka Folder Drive OPD</span>
                  <ExternalLink size={16} />
                </a>
                <button
                  type="button"
                  onClick={resetForm}
                  className="py-3.5 px-6 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-sm border border-zinc-800 transition flex items-center justify-center gap-2"
                >
                  <RotateCcw size={16} />
                  <span>Unggah Berkas Lain</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition underline underline-offset-4"
              >
                Kembali ke Beranda
              </button>
            </div>
          ) : (
            /* --- FORM VIEW --- */
            <form onSubmit={handleSubmit} className="space-y-6">
              {submitError && (
                <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs sm:text-sm font-semibold flex items-center gap-3">
                  <AlertTriangle size={18} className="shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* 1. NIP & Nama Pegawai (Searchable Dropdown) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                  1. Pilih NIP & Nama Pegawai <span className="text-yellow-400">*</span>
                </label>

                {selectedPegawai ? (
                  <div className="p-3.5 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-yellow-400 text-black flex items-center justify-center font-black">
                        <User size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm sm:text-base">
                          {selectedPegawai.nama}
                        </div>
                        <div className="text-xs font-mono text-yellow-400">
                          NIP: {selectedPegawai.nip}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPegawai(null);
                        setPegawaiQuery('');
                        setIsSearchingPegawai(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium transition"
                    >
                      Ubah
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Ketik NIP atau Nama Pegawai (contoh: 1980... atau nama)..."
                        value={pegawaiQuery}
                        onChange={(e) => {
                          setPegawaiQuery(e.target.value);
                          setIsSearchingPegawai(true);
                        }}
                        onFocus={() => setIsSearchingPegawai(true)}
                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-yellow-400 transition"
                      />
                    </div>

                    {isSearchingPegawai && (
                      <div className="absolute z-30 left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-1 divide-y divide-zinc-800/50">
                        {pegawaiResults.length === 0 ? (
                          <div className="p-4 text-center text-xs text-zinc-500">
                            Tidak ditemukan pegawai dengan kata kunci &quot;{pegawaiQuery}&quot;.
                          </div>
                        ) : (
                          pegawaiResults.map((p) => (
                            <button
                              key={p.nip}
                              type="button"
                              onClick={() => {
                                setSelectedPegawai(p);
                                setIsSearchingPegawai(false);
                                setPegawaiQuery('');
                              }}
                              className="w-full text-left p-3 hover:bg-yellow-400/10 rounded-xl transition flex items-center justify-between group"
                            >
                              <div>
                                <div className="text-sm font-semibold text-white group-hover:text-yellow-400 transition">
                                  {p.nama}
                                </div>
                                <div className="text-xs font-mono text-zinc-400">
                                  NIP: {p.nip}
                                </div>
                              </div>
                              <span className="text-[11px] font-bold text-zinc-500 group-hover:text-yellow-400 px-2 py-1 rounded bg-zinc-800">
                                Pilih
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. OPD Dropdown */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                  2. Pilih Organisasi Perangkat Daerah (OPD) <span className="text-yellow-400">*</span>
                </label>
                <div className="relative">
                  <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <select
                    value={selectedOpd}
                    onChange={(e) => {
                      setSelectedOpd(e.target.value);
                      setSelectedUnitKerja(''); // reset child unit kerja
                    }}
                    className="w-full pl-11 pr-10 py-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-white text-sm focus:outline-none focus:border-yellow-400 transition appearance-none cursor-pointer"
                  >
                    <option value="">-- Pilih OPD Pegawai --</option>
                    {opdList.map((opd) => (
                      <option key={opd} value={opd} className="bg-zinc-950 text-white">
                        {opd}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* 3. Unit Kerja Dropdown */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                  3. Pilih Unit Kerja Pegawai <span className="text-yellow-400">*</span>
                </label>
                <div className="relative">
                  <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <select
                    value={selectedUnitKerja}
                    disabled={!selectedOpd}
                    onChange={(e) => setSelectedUnitKerja(e.target.value)}
                    className="w-full pl-11 pr-10 py-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-white text-sm focus:outline-none focus:border-yellow-400 transition appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {selectedOpd ? '-- Pilih Unit Kerja --' : '-- Pilih OPD terlebih dahulu --'}
                    </option>
                    {unitKerjaList.map((unit) => (
                      <option key={unit} value={unit} className="bg-zinc-950 text-white">
                        {unit}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
                {selectedOpd && (
                  <p className="text-[11px] text-zinc-500">
                    Tersedia {unitKerjaList.length} opsi unit kerja untuk OPD terpilih.
                  </p>
                )}
              </div>

              {/* 4. Kolom Unggah Berkas PDF (Under 1 MB) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                    4. Unggah Berkas SPK <span className="text-yellow-400">*</span>
                  </label>
                  <span className="text-[11px] font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">
                    PDF Khusus &bull; Maks. 1 MB
                  </span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="spk-file-input"
                />

                {!file ? (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-zinc-800 hover:border-yellow-400/60 rounded-2xl p-6 text-center cursor-pointer transition bg-zinc-900/40 hover:bg-yellow-400/[0.02] group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-zinc-800 group-hover:bg-yellow-400 group-hover:text-black text-yellow-400 flex items-center justify-center mx-auto mb-3 transition shadow-md">
                      <Upload size={22} />
                    </div>
                    <p className="text-sm font-bold text-white group-hover:text-yellow-400 transition">
                      Pilih atau Seret Berkas SPK ke Sini
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Wajib format PDF (.pdf) dengan ukuran di bawah 1 MB
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-emerald-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <FileText size={20} />
                      </div>
                      <div className="truncate">
                        <div className="text-sm font-bold text-white truncate">{file.name}</div>
                        <div className="text-xs text-emerald-400 font-mono">
                          {formatBytes(file.size)} &bull; PDF Valid (&lt; 1 MB)
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="p-2 rounded-xl bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition shrink-0"
                      title="Hapus berkas"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}

                {fileError && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedPegawai || !selectedOpd || !selectedUnitKerja || !file}
                  className="w-full py-4 px-6 rounded-2xl bg-yellow-400 hover:bg-yellow-300 active:scale-[0.99] text-black font-black text-sm tracking-wider uppercase transition shadow-xl shadow-yellow-400/20 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>{submittingStatus || 'Menyimpan Berkas SPK...'}</span>
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      <span>Kirim & Simpan Berkas SPK</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
