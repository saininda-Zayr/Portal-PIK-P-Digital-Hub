import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  Filter, 
  Users, 
  FileCheck, 
  AlertCircle,
  Building2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import { SpkSubmissionRecord, ALL_PEGAWAI } from '../data/pppkData';
import { 
  exportSpkRecapToExcel, 
  buildExcelExportRows 
} from '../services/spkExcelExportService';

interface SPKExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: SpkSubmissionRecord[];
  activeOpdFilter?: string;
  activeSearchQuery?: string;
}

export const SPKExcelExportModal: React.FC<SPKExcelExportModalProps> = ({
  isOpen,
  onClose,
  submissions,
  activeOpdFilter = '',
  activeSearchQuery = ''
}) => {
  const [scope, setScope] = useState<'active_filter' | 'all_opd'>(
    activeOpdFilter || activeSearchQuery ? 'active_filter' : 'all_opd'
  );
  const [mode, setMode] = useState<'all_with_status' | 'only_uploaded'>('all_with_status');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Preview rows calculation
  const previewRows = useMemo(() => {
    return buildExcelExportRows({
      submissions,
      selectedOpdFilter: activeOpdFilter,
      searchQuery: activeSearchQuery,
      scope,
      mode
    });
  }, [submissions, activeOpdFilter, activeSearchQuery, scope, mode]);

  const stats = useMemo(() => {
    const total = previewRows.length;
    const uploaded = previewRows.filter((r) => r.isUploaded).length;
    const unuploaded = total - uploaded;
    const percent = total > 0 ? Math.round((uploaded / total) * 100) : 0;
    return { total, uploaded, unuploaded, percent };
  }, [previewRows]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsExporting(true);
    setExportSuccess(null);

    try {
      const result = await exportSpkRecapToExcel({
        submissions,
        selectedOpdFilter: activeOpdFilter,
        searchQuery: activeSearchQuery,
        scope,
        mode
      });

      if (result.success) {
        setExportSuccess(`Berhasil mengunduh ${result.totalExported} baris data ke dalam file "${result.fileName}"`);
        setTimeout(() => {
          setIsExporting(false);
        }, 1200);
      }
    } catch (err: any) {
      console.error('Gagal mengekspor Excel:', err);
      alert('Terjadi kesalahan saat mengekspor Excel: ' + (err.message || ''));
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="bg-zinc-950 border border-zinc-800 text-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Ekspor Rekapitulasi Berkas SPK PPPK</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Excel (.xlsx)
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Unduh rekap data peserta, status pengunggahan, dan tautan Google Drive resmi BKPSDM.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition border border-zinc-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Active Filter Notice if present */}
          {(activeOpdFilter || activeSearchQuery) && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-3">
              <Filter size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-bold">Filter Sedang Aktif di Tabel Layar:</span>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-zinc-300">
                  {activeOpdFilter && (
                    <span className="px-2 py-0.5 bg-black/40 rounded-md border border-amber-500/30 font-mono text-[11px] text-amber-200">
                      OPD: {activeOpdFilter}
                    </span>
                  )}
                  {activeSearchQuery && (
                    <span className="px-2 py-0.5 bg-black/40 rounded-md border border-amber-500/30 font-mono text-[11px] text-amber-200">
                      Cari: &quot;{activeSearchQuery}&quot;
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Configuration Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Scope Selection */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                <Layers size={14} className="text-yellow-400" />
                <span>Cakupan OPD</span>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition">
                  <input
                    type="radio"
                    name="scope"
                    value="active_filter"
                    checked={scope === 'active_filter'}
                    onChange={() => setScope('active_filter')}
                    className="accent-yellow-400 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block text-white">Ikuti Filter Aktif</span>
                    <span className="text-[11px] text-zinc-400 block">
                      {activeOpdFilter || activeSearchQuery ? 'Sesuai OPD/Pencarian di layar' : 'Semua (tidak ada filter aktif)'}
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition">
                  <input
                    type="radio"
                    name="scope"
                    value="all_opd"
                    checked={scope === 'all_opd'}
                    onChange={() => setScope('all_opd')}
                    className="accent-yellow-400 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block text-white">Seluruh Kabupaten</span>
                    <span className="text-[11px] text-zinc-400 block">Semua 45 OPD & seluruh unit kerja</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Mode Selection */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                <Users size={14} className="text-emerald-400" />
                <span>Cakupan Status Data</span>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition">
                  <input
                    type="radio"
                    name="mode"
                    value="all_with_status"
                    checked={mode === 'all_with_status'}
                    onChange={() => setMode('all_with_status')}
                    className="accent-emerald-400 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block text-white">Lengkap (Sudah & Belum)</span>
                    <span className="text-[11px] text-zinc-400 block">Menyandingkan seluruh master pegawai</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition">
                  <input
                    type="radio"
                    name="mode"
                    value="only_uploaded"
                    checked={mode === 'only_uploaded'}
                    onChange={() => setMode('only_uploaded')}
                    className="accent-emerald-400 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold block text-white">Hanya Yang Sudah Unggah</span>
                    <span className="text-[11px] text-zinc-400 block">Daftar berkas yang telah diterima</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Real-time Summary Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
              Ringkasan Data yang Akan Diekspor
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-black/40 border border-zinc-800/80">
                <span className="text-[10px] text-zinc-400 block font-medium">TOTAL BARIS</span>
                <span className="text-xl font-mono font-black text-white">{stats.total.toLocaleString('id-ID')}</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] text-emerald-400 block font-medium">SUDAH UNGGAH</span>
                <span className="text-xl font-mono font-black text-emerald-300">{stats.uploaded.toLocaleString('id-ID')}</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <span className="text-[10px] text-amber-400 block font-medium">BELUM UNGGAH</span>
                <span className="text-xl font-mono font-black text-amber-300">{stats.unuploaded.toLocaleString('id-ID')}</span>
              </div>
              <div className="p-3 rounded-xl bg-yellow-400/10 border border-yellow-400/20">
                <span className="text-[10px] text-yellow-400 block font-medium">PROGRES SELESAI</span>
                <span className="text-xl font-mono font-black text-yellow-300">{stats.percent}%</span>
              </div>
            </div>

            {/* Excel Sheet structure preview */}
            <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-800/60 font-mono">
              <span>Format: Microsoft Excel (.xlsx)</span>
              <span>1 Lembar Kerja Terpadu (11 Kolom)</span>
            </div>
          </div>

          {/* Success toast if finished */}
          {exportSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3 animate-in fade-in">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
              <span>{exportSuccess}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-zinc-800/80 bg-zinc-900/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-zinc-500 text-center sm:text-left">
            Disusun sesuai standar nomenklatur berkas: <code className="text-zinc-300 font-mono">SPK_NIP_Nama.pdf</code>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold transition border border-zinc-800"
            >
              Tutup
            </button>
            <button
              onClick={handleDownload}
              disabled={isExporting || stats.total === 0}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} />
              <span>{isExporting ? 'Memproses Berkas...' : `Unduh File Excel (${stats.total.toLocaleString('id-ID')})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
