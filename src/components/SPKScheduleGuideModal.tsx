import React, { useState } from 'react';
import { 
  X, 
  Calendar, 
  Users, 
  Building2, 
  Search, 
  Copy, 
  Check, 
  Share2, 
  ShieldCheck, 
  AlertCircle,
  ExternalLink,
  Clock,
  Sparkles
} from 'lucide-react';
import { OPD_WAVE_SCHEDULES, OpdWaveSchedule } from '../data/opdScheduleData';

interface SPKScheduleGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SPKScheduleGuideModal: React.FC<SPKScheduleGuideModalProps> = ({
  isOpen,
  onClose
}) => {
  const [searchOpd, setSearchOpd] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Filtered waves based on search
  const filteredWaves = OPD_WAVE_SCHEDULES.map((wave) => {
    if (!searchOpd.trim()) return wave;
    const filteredOpds = wave.opdList.filter((opd) =>
      opd.toLowerCase().includes(searchOpd.toLowerCase())
    );
    return {
      ...wave,
      opdList: filteredOpds
    };
  }).filter((wave) => wave.opdList.length > 0 || !searchOpd.trim());

  const totalEmployees = OPD_WAVE_SCHEDULES.reduce((sum, w) => sum + w.estimatedEmployees, 0);

  // Generate WhatsApp announcement text for OPD Coordinators
  const generateBroadcastText = () => {
    let text = `*PEMBERITAHUAN JADWAL UNGGAH BERKAS SPK PPPK PARUH WAKTU TAHUN 2026*\n`;
    text += `*BKPSDM KABUPATEN POLEWALI MANDAR*\n\n`;
    text += `Yth. Bapak/Ibu Pegawai PPPK Paruh Waktu se-Kab. Polewali Mandar,\n`;
    text += `Mengingat jumlah peserta mencapai *${totalEmployees.toLocaleString('id-ID')} pegawai*, untuk mencegah kepadatan lalu lintas server dan antrean transmisi Google Drive, pengunggahan berkas SPK dibagi menjadi *4 GELOMBANG TERJADWAL*:\n\n`;

    OPD_WAVE_SCHEDULES.forEach((wave) => {
      text += `📅 *${wave.waveName.toUpperCase()}*\n`;
      text += `⏱️ Waktu: *${wave.recommendedDays}*\n`;
      text += `👥 Estimasi: ~${wave.estimatedEmployees.toLocaleString('id-ID')} Pegawai\n`;
      text += `🏛️ Sasaran: ${wave.description}\n\n`;
    });

    text += `📌 *Petunjuk Pengunggahan:*\n`;
    text += `1. Format Berkas: Wajib file PDF (.pdf) dengan ukuran *maksimal 1 MB* (disarankan di bawah 500 KB).\n`;
    text += `2. Penamaan berkas otomatis diatur oleh sistem menjadi: *SPK_[NIP]_[Nama].pdf*.\n`;
    text += `3. Mohon mengunggah berkas sesuai jadwal gelombang masing-masing demi kenyamanan bersama.\n\n`;
    text += `Terima kasih atas kerja samanya.\n*BKPSDM Kabupaten Polewali Mandar*`;
    return text;
  };

  const handleCopyBroadcast = () => {
    const text = generateBroadcastText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 text-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center text-yellow-400 shadow-lg">
              <Calendar size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-yellow-400 bg-yellow-400/10 px-2.5 py-0.5 rounded-full border border-yellow-400/20">
                  Manajemen Lalu Lintas 4.300+ PPPK
                </span>
                <span className="text-xs text-zinc-400 flex items-center gap-1">
                  <Users size={12} /> ~{totalEmployees.toLocaleString('id-ID')} Total
                </span>
              </div>
              <h2 className="text-xl font-bold mt-1">
                Rekomendasi Jadwal Unggah SPK Berbasis OPD
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Action Bar / Notice */}
        <div className="p-4 sm:p-6 bg-zinc-900/50 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck size={18} />
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-xl">
              Pembagian 4 gelombang ini dirancang khusus untuk membagi beban <strong>4.300+ pegawai</strong> agar Google Drive Apps Script dan server tidak mengalami *thundering herd / rate-limit* secara simultan.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyBroadcast}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-md ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-yellow-400/20'
              }`}
            >
              {copied ? <Check size={15} /> : <Share2 size={15} />}
              <span>{copied ? 'Teks Tersalin!' : 'Salin Pesan Pengumuman WA'}</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 bg-zinc-950/40 border-b border-zinc-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              value={searchOpd}
              onChange={(e) => setSearchOpd(e.target.value)}
              placeholder="Cari OPD atau Satuan Kerja untuk melihat jadwal gelombangnya..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-800/60 border border-zinc-700/60 rounded-xl text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-yellow-400 transition"
            />
          </div>
        </div>

        {/* Content Body - 4 Waves */}
        <div className="p-6 overflow-y-auto space-y-4">
          {filteredWaves.map((wave) => (
            <div
              key={wave.waveNumber}
              className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center text-yellow-400 font-black text-sm">
                    {wave.waveNumber}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {wave.waveName}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {wave.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 font-medium flex items-center gap-1.5 border border-zinc-700">
                    <Clock size={13} className="text-yellow-400" />
                    {wave.recommendedDays}
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-yellow-400/10 text-yellow-400 font-bold border border-yellow-400/20">
                    ~{wave.estimatedEmployees.toLocaleString('id-ID')} Pegawai
                  </span>
                </div>
              </div>

              {/* OPD Badges */}
              <div className="mt-3">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                  Daftar OPD ({wave.opdList.length} OPD / Satuan):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {wave.opdList.map((opd, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-medium hover:border-zinc-700 transition"
                    >
                      {opd}
                    </span>
                  ))}
                  {wave.opdList.length === 0 && (
                    <span className="text-xs text-zinc-400 italic">
                      Tidak ada OPD yang cocok dengan pencarian di gelombang ini.
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Operational FAQ */}
          <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-2xl p-4 text-xs text-zinc-300 space-y-2">
            <h4 className="font-bold text-white flex items-center gap-2 text-sm">
              <Sparkles size={16} className="text-yellow-400" />
              Catatan Penting Tim Teknis BKPSDM:
            </h4>
            <p>
              • Jadwal gelombang ini adalah <strong>panduan rekomendasi prioritas lalu lintas</strong>. Jika ada pegawai yang mendesak mengunggah di luar gelombangnya, sistem tetap akan menerima berkas tanpa memblokir peserta.
            </p>
            <p>
              • Sistem dilengkapi dengan <em>Exponential Backoff</em>: jika terjadi lonjakan pengguna secara bersamaan, aplikasi akan otomatis mengantre ulang transmisi berkas (maksimal 3 kali percobaan) tanpa membuat user harus mengulang pengisian dari awal.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between shrink-0">
          <span className="text-xs text-zinc-400">
            BKPSDM Kab. Polewali Mandar • Penyelarasan Lalu Lintas Data Berkas
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
