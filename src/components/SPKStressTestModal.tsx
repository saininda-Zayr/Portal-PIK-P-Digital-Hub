import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Activity, 
  Play, 
  Square, 
  AlertTriangle, 
  CheckCircle2, 
  Gauge, 
  Clock, 
  Server, 
  TrendingUp, 
  FileText, 
  Zap, 
  ShieldAlert, 
  RotateCcw,
  Sparkles,
  Info,
  Calendar
} from 'lucide-react';
import { 
  runSpkLoadTest, 
  LoadTestScenario, 
  LoadTestProgress, 
  LoadTestResult,
  SCENARIO_PRESETS
} from '../services/spkLoadTestService';
import { getSpkAppsScriptUrl } from '../services/spkDriveService';

interface SPKStressTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenScheduleGuide?: () => void;
}

export const SPKStressTestModal: React.FC<SPKStressTestModalProps> = ({
  isOpen,
  onClose,
  onOpenScheduleGuide
}) => {
  const [scenario, setScenario] = useState<LoadTestScenario>('wave');
  const [concurrencyPool, setConcurrencyPool] = useState<number>(20);
  const [payloadSizeKb, setPayloadSizeKb] = useState<number>(350);
  const [includeLiveGasProbe, setIncludeLiveGasProbe] = useState<boolean>(true);
  const [configuredGasUrl, setConfiguredGasUrl] = useState<string>('');

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<LoadTestProgress | null>(null);
  const [result, setResult] = useState<LoadTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      getSpkAppsScriptUrl().then((url) => setConfiguredGasUrl(url || ''));
    }
  }, [isOpen]);

  // Adjust default concurrency pool when scenario changes
  const handleScenarioChange = (sc: LoadTestScenario) => {
    setScenario(sc);
    setConcurrencyPool(SCENARIO_PRESETS[sc].pool);
    setResult(null);
  };

  const handleStartTest = async () => {
    setIsRunning(true);
    setProgress(null);
    setResult(null);
    setError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const preset = SCENARIO_PRESETS[scenario];
      const testResult = await runSpkLoadTest(
        {
          scenario,
          virtualUsers: preset.users,
          concurrencyPool,
          payloadSizeKb,
          liveGasUrl: includeLiveGasProbe ? configuredGasUrl : undefined
        },
        (p) => setProgress(p),
        abortController.signal
      );

      setResult(testResult);
    } catch (err: any) {
      if (err.message?.includes('dibatalkan')) {
        setError('Pengujian beban dihentikan.');
      } else {
        setError(err.message || 'Terjadi kesalahan saat menjalankan simulasi beban.');
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopTest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 text-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-yellow-400 shadow-lg">
              <Activity size={24} className={isRunning ? 'animate-pulse text-yellow-300' : ''} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-yellow-400 bg-yellow-400/10 px-2.5 py-0.5 rounded-full border border-yellow-400/20">
                  Stress & Concurrency Testing Engine
                </span>
                <span className="text-xs text-zinc-400">
                  Target Kapasitas: 4.300+ PPPK
                </span>
              </div>
              <h2 className="text-xl font-bold mt-1">
                Uji Beban & Simulasi Lonjakan Akses Serentak
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="w-10 h-10 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-50 flex items-center justify-center text-zinc-400 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Scenario Selector */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-3">
              Pilih Skenario Beban Akses:
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(Object.keys(SCENARIO_PRESETS) as LoadTestScenario[]).map((scKey) => {
                const item = SCENARIO_PRESETS[scKey];
                const isSelected = scenario === scKey;
                return (
                  <button
                    key={scKey}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleScenarioChange(scKey)}
                    className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-yellow-400/10 border-yellow-400/60 text-white shadow-md'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                          isSelected ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {item.users} Virtual Users
                        </span>
                        {isSelected && <Zap size={14} className="text-yellow-400" />}
                      </div>
                      <h4 className="font-bold text-sm text-white mt-1">
                        {item.label}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Test Parameters */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-5">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Gauge size={14} className="text-yellow-400" />
              Parameter Eksekusi Simulasi
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-zinc-300 block mb-1.5 font-medium">
                  Batas Pekerja Simultan (Concurrency Pool):
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="5"
                    max="35"
                    step="1"
                    disabled={isRunning}
                    value={concurrencyPool}
                    onChange={(e) => setConcurrencyPool(Number(e.target.value))}
                    className="w-full accent-yellow-400 cursor-pointer"
                  />
                  <span className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-mono font-bold text-yellow-400 shrink-0">
                    {concurrencyPool} conn
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  Batas konkurensi Google Apps Script ~30 worker
                </span>
              </div>

              <div>
                <label className="text-xs text-zinc-300 block mb-1.5 font-medium">
                  Ukuran Berkas PDF Rata-Rata:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="100"
                    max="900"
                    step="50"
                    disabled={isRunning}
                    value={payloadSizeKb}
                    onChange={(e) => setPayloadSizeKb(Number(e.target.value))}
                    className="w-full accent-yellow-400 cursor-pointer"
                  />
                  <span className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-mono font-bold text-yellow-400 shrink-0">
                    {payloadSizeKb} KB
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  Batas maksimal berkas sistem: 1.000 KB (1 MB)
                </span>
              </div>

              <div>
                <label className="text-xs text-zinc-300 block mb-1.5 font-medium">
                  Pemeriksaan Probe Live Web App:
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="liveProbeCheck"
                    disabled={isRunning || !configuredGasUrl}
                    checked={includeLiveGasProbe && Boolean(configuredGasUrl)}
                    onChange={(e) => setIncludeLiveGasProbe(e.target.checked)}
                    className="rounded bg-zinc-800 border-zinc-700 text-yellow-400 focus:ring-yellow-400/20"
                  />
                  <label htmlFor="liveProbeCheck" className="text-xs text-zinc-300 cursor-pointer">
                    {configuredGasUrl ? 'Sertakan Ping Nyata Google Apps Script' : 'Web App belum dikonfigurasi (Mode Sintetik)'}
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex items-center gap-3">
            {!isRunning ? (
              <button
                type="button"
                onClick={handleStartTest}
                className="px-6 py-3.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black text-sm rounded-2xl flex items-center gap-2 transition shadow-lg shadow-yellow-400/20"
              >
                <Play size={16} fill="currentColor" />
                <span>Jalankan Pengujian Beban</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopTest}
                className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-sm rounded-2xl flex items-center gap-2 transition shadow-lg shadow-rose-600/20"
              >
                <Square size={16} fill="currentColor" />
                <span>Hentikan Pengujian</span>
              </button>
            )}

            {onOpenScheduleGuide && (
              <button
                type="button"
                onClick={onOpenScheduleGuide}
                className="px-4 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs sm:text-sm rounded-2xl flex items-center gap-2 transition border border-zinc-700"
              >
                <Calendar size={16} className="text-yellow-400" />
                <span>Lihat Solusi Jadwal Gelombang OPD</span>
              </button>
            )}
          </div>

          {/* Error Notice */}
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-3">
              <AlertTriangle size={18} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Running Progress Bar */}
          {isRunning && progress && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-yellow-400 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400"></span>
                  </span>
                  {progress.statusText}
                </span>
                <span className="text-zinc-400 font-mono">
                  {progress.completed} / {progress.total} berkas ({Math.round((progress.completed / progress.total) * 100)}%)
                </span>
              </div>

              {/* Progress Track */}
              <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full transition-all duration-150"
                  style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                />
              </div>

              {/* Live Gauges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">Throughput Saat Ini</div>
                  <div className="text-base font-black text-white mt-0.5 font-mono">
                    {progress.currentRps} <span className="text-xs font-normal text-zinc-400">req/s</span>
                  </div>
                </div>
                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">Pekerja Aktif</div>
                  <div className="text-base font-black text-yellow-400 mt-0.5 font-mono">
                    {progress.activeWorkers} / {concurrencyPool}
                  </div>
                </div>
                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">Rata-rata Latensi</div>
                  <div className="text-base font-black text-white mt-0.5 font-mono">
                    {progress.currentLatencyAvg} <span className="text-xs font-normal text-zinc-400">ms</span>
                  </div>
                </div>
                <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">Tingkat Berhasil</div>
                  <div className="text-base font-black text-emerald-400 mt-0.5 font-mono">
                    {progress.completed > 0 ? Math.round((progress.successCount / progress.completed) * 100) : 100}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Test Result Display */}
          {result && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 space-y-6 animate-in fade-in duration-300">
              {/* Summary Status Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    result.healthStatus === 'optimal'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : result.healthStatus === 'moderate_risk'
                      ? 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/30'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                  }`}>
                    {result.healthStatus === 'optimal' ? (
                      <CheckCircle2 size={26} />
                    ) : result.healthStatus === 'moderate_risk' ? (
                      <AlertTriangle size={26} />
                    ) : (
                      <ShieldAlert size={26} />
                    )}
                  </div>
                  <div>
                    <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                      result.healthStatus === 'optimal'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : result.healthStatus === 'moderate_risk'
                        ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {result.healthStatus === 'optimal' ? 'Status: Kapasitas Optimal' : result.healthStatus === 'moderate_risk' ? 'Status: Perlu Pembagian Gelombang' : 'Status: Bottleneck Serentak Terdeteksi'}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-1">
                      Hasil Simulasi: {SCENARIO_PRESETS[result.scenario].label}
                    </h3>
                  </div>
                </div>

                <div className="text-right self-start sm:self-auto">
                  <div className="text-xs text-zinc-400">Total Durasi Uji</div>
                  <div className="text-base font-black text-white font-mono">
                    {(result.totalDurationMs / 1000).toFixed(1)} detik
                  </div>
                </div>
              </div>

              {/* Key Metrics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl">
                  <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-yellow-400" />
                    Throughput
                  </div>
                  <div className="text-xl font-black text-white mt-1 font-mono">
                    {result.requestsPerSecond} <span className="text-xs font-normal text-zinc-400">req/s</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    Total {result.dataTransferredMb} MB data
                  </div>
                </div>

                <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl">
                  <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <Clock size={14} className="text-yellow-400" />
                    Latensi P95
                  </div>
                  <div className="text-xl font-black text-white mt-1 font-mono">
                    {result.latencies.p95} <span className="text-xs font-normal text-zinc-400">ms</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    Rata-rata: {result.latencies.avg} ms
                  </div>
                </div>

                <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl">
                  <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    Transmisi Sukses
                  </div>
                  <div className="text-xl font-black text-emerald-400 mt-1 font-mono">
                    {result.successCount} <span className="text-xs text-zinc-400">berkas</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {((result.successCount / result.totalRequests) * 100).toFixed(1)}% berhasil
                  </div>
                </div>

                <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl">
                  <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-rose-400" />
                    Gagal / Throttled
                  </div>
                  <div className="text-xl font-black text-rose-400 mt-1 font-mono">
                    {result.failureCount} <span className="text-xs text-zinc-400">berkas</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    Diserap Exponential Backoff
                  </div>
                </div>
              </div>

              {/* Latency Percentile Breakdown */}
              <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-4">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  Distribusi Latensi Respons:
                </div>
                <div className="grid grid-cols-5 gap-2 text-center text-xs font-mono">
                  <div className="bg-zinc-800/60 p-2 rounded-lg">
                    <div className="text-zinc-500 text-[10px]">MIN</div>
                    <div className="font-bold text-zinc-300">{result.latencies.min} ms</div>
                  </div>
                  <div className="bg-zinc-800/60 p-2 rounded-lg">
                    <div className="text-zinc-500 text-[10px]">AVG</div>
                    <div className="font-bold text-zinc-300">{result.latencies.avg} ms</div>
                  </div>
                  <div className="bg-zinc-800/60 p-2 rounded-lg">
                    <div className="text-zinc-500 text-[10px]">P50 (Median)</div>
                    <div className="font-bold text-zinc-300">{result.latencies.p50} ms</div>
                  </div>
                  <div className="bg-zinc-800/60 p-2 rounded-lg">
                    <div className="text-zinc-500 text-[10px]">P95</div>
                    <div className="font-bold text-yellow-400">{result.latencies.p95} ms</div>
                  </div>
                  <div className="bg-zinc-800/60 p-2 rounded-lg">
                    <div className="text-zinc-500 text-[10px]">MAX</div>
                    <div className="font-bold text-rose-400">{result.latencies.max} ms</div>
                  </div>
                </div>
              </div>

              {/* Bottlenecks & Recommendations */}
              <div className="space-y-4">
                {result.bottlenecks.length > 0 && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 space-y-2">
                    <h4 className="font-bold text-rose-300 text-xs uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle size={15} />
                      Analisis Bottleneck Beban Serentak:
                    </h4>
                    <ul className="text-xs text-rose-200/90 space-y-1 list-disc list-inside">
                      {result.bottlenecks.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
                  <h4 className="font-bold text-emerald-400 text-xs uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={15} />
                    Rekomendasi Kapasitas untuk Menangani 4.300+ PPPK:
                  </h4>
                  <ul className="text-xs text-emerald-200/90 space-y-1.5 list-disc list-inside">
                    {result.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Wave Capacity Planning Table */}
              <div>
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <Calendar size={14} className="text-yellow-400" />
                  Alokasi Kuota Unggah Aman Per Gelombang OPD (Total 4.300+ Pegawai):
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-zinc-800 rounded-xl overflow-hidden">
                    <thead className="bg-zinc-800/80 text-zinc-300">
                      <tr>
                        <th className="py-2.5 px-3">Gelombang</th>
                        <th className="py-2.5 px-3">Target Pegawai</th>
                        <th className="py-2.5 px-3">Rekomendasi Hari</th>
                        <th className="py-2.5 px-3 text-right">Laju Unggah Aman</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                      {result.opdDistribution.map((dist, idx) => (
                        <tr key={idx} className="hover:bg-zinc-900/50">
                          <td className="py-2 px-3 font-sans font-medium text-white">{dist.waveName}</td>
                          <td className="py-2 px-3 font-bold text-yellow-400">~{dist.totalTarget.toLocaleString('id-ID')}</td>
                          <td className="py-2 px-3 font-sans text-zinc-400">{dist.safeWindowHours}</td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-400">~{dist.recommendedRatePerMin} berkas / menit</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between shrink-0">
          <span className="text-xs text-zinc-400">
            SIM ASN BKPSDM • Diagnostic Concurrency & Capacity Test Engine
          </span>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
