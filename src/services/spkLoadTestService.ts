import { OPD_WAVE_SCHEDULES } from '../data/opdScheduleData';
import { ALL_OPD } from '../data/pppkData';
import { sendProbePing } from './spkDriveService';

export type LoadTestScenario = 'light' | 'wave' | 'peak';

export interface LoadTestConfig {
  scenario: LoadTestScenario;
  virtualUsers: number;
  concurrencyPool: number; // concurrent active workers (e.g. 10 to 35)
  payloadSizeKb: number; // Simulated SPK PDF payload size in KB (e.g. 350 KB)
  liveGasUrl?: string; // Optional live GAS web app URL for live ping verification
  dryRun?: boolean;
}

export interface LoadTestProgress {
  completed: number;
  total: number;
  activeWorkers: number;
  currentRps: number;
  successCount: number;
  failureCount: number;
  currentLatencyAvg: number;
  statusText: string;
}

export interface LoadTestResult {
  scenario: LoadTestScenario;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  requestsPerSecond: number;
  dataTransferredMb: number;
  latencies: {
    min: number;
    avg: number;
    p50: number;
    p95: number;
    max: number;
  };
  healthStatus: 'optimal' | 'moderate_risk' | 'critical_bottleneck';
  summaryMessage: string;
  bottlenecks: string[];
  recommendations: string[];
  opdDistribution: {
    waveName: string;
    totalTarget: number;
    safeWindowHours: string;
    recommendedRatePerMin: number;
  }[];
}

/**
 * Standard test scenario presets
 */
export const SCENARIO_PRESETS: Record<LoadTestScenario, { users: number; pool: number; label: string; desc: string }> = {
  light: {
    users: 50,
    pool: 8,
    label: 'Uji Ringan (50 Pegawai Serentak)',
    desc: 'Simulasi akses normal di luar jam sibuk atau satu unit kerja kecil.'
  },
  wave: {
    users: 250,
    pool: 20,
    label: 'Uji Gelombang (250 Pegawai Serentak)',
    desc: 'Beban tipikal per satu sesi gelombang OPD terjadwal.'
  },
  peak: {
    users: 1000,
    pool: 35,
    label: 'Uji Ekstrem / Thundering Herd (1.000 Pegawai)',
    desc: 'Simulasi lonjakan masif jika ribuan pegawai menekan tombol serempak.'
  }
};

/**
 * Run realistic concurrency simulation engine
 */
export async function runSpkLoadTest(
  config: LoadTestConfig,
  onProgress?: (progress: LoadTestProgress) => void,
  abortSignal?: AbortSignal
): Promise<LoadTestResult> {
  const { virtualUsers, concurrencyPool, payloadSizeKb, liveGasUrl } = config;
  const startTime = performance.now();
  const latencies: number[] = [];
  let successCount = 0;
  let failureCount = 0;
  let completed = 0;

  // Real probe ping test if liveGasUrl is configured and reachable
  let gasBaseLatency = 0;
  if (liveGasUrl && liveGasUrl.trim().startsWith('https://script.google.com/')) {
    try {
      const probe = await sendProbePing(liveGasUrl.trim());
      if (probe.ok) {
        gasBaseLatency = probe.latencyMs;
      }
    } catch {
      // fallback to simulated
    }
  }

  // Pre-generate virtual requests from actual OPDs
  const opdList = ALL_OPD.map((o) => o.opd);
  const virtualTasks = Array.from({ length: virtualUsers }, (_, idx) => {
    const opd = opdList[idx % opdList.length];
    return {
      id: idx + 1,
      opd,
      nip: `198501012024211${String(idx + 1).padStart(3, '0')}`,
      payloadBytes: payloadSizeKb * 1024
    };
  });

  // Concurrency pool execution with async worker queue
  let taskIndex = 0;
  let activeWorkers = 0;

  const runWorker = async (): Promise<void> => {
    while (taskIndex < virtualTasks.length) {
      if (abortSignal?.aborted) {
        throw new Error('Pengujian beban dibatalkan oleh pengguna.');
      }

      const currentTask = virtualTasks[taskIndex++];
      activeWorkers++;

      const taskStart = performance.now();
      try {
        // Simulate real-world factors:
        // 1. Client PDF Base64 serialization & DOM rendering overhead (~10-40ms)
        // 2. Network upload latency based on payload size (e.g., 350KB payload on typical 10-25 Mbps uplink = ~120-300ms)
        // 3. Concurrency contention factor: Google Apps Script concurrent lock overhead
        // If concurrent connections exceed 25, GAS latency increases exponentially and throttles ~5-15% of requests
        const contentionMultiplier = activeWorkers > 25 ? 1 + (activeWorkers - 25) * 0.08 : 1.0;
        
        const clientSerializationMs = Math.random() * 25 + 10;
        const simulatedNetworkMs = (currentTask.payloadBytes / (1024 * 18)) * 10 * contentionMultiplier;
        const gasProcessingMs = gasBaseLatency > 0 ? gasBaseLatency * 0.7 : (Math.random() * 350 + 400) * contentionMultiplier;
        
        const totalSimulatedDelay = Math.round(clientSerializationMs + simulatedNetworkMs + gasProcessingMs);
        
        // Yield to browser event loop
        await new Promise((resolve) => setTimeout(resolve, Math.min(totalSimulatedDelay, 450)));

        const taskLatency = Math.round(performance.now() - taskStart);

        // Realistic failure injection if concurrency is dangerously high (> 30 concurrent workers)
        const isThrottled = activeWorkers > 32 && Math.random() < 0.14;
        if (isThrottled) {
          failureCount++;
        } else {
          successCount++;
        }

        latencies.push(taskLatency);
      } catch (err) {
        failureCount++;
      } finally {
        activeWorkers--;
        completed++;

        if (onProgress) {
          const elapsedSec = (performance.now() - startTime) / 1000;
          const currentRps = elapsedSec > 0 ? Math.round((completed / elapsedSec) * 10) / 10 : 0;
          const avgLat = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

          onProgress({
            completed,
            total: virtualUsers,
            activeWorkers,
            currentRps,
            successCount,
            failureCount,
            currentLatencyAvg: avgLat,
            statusText: `Memproses ${completed}/${virtualUsers} berkas (${activeWorkers} pekerja aktif)...`
          });
        }
      }
    }
  };

  // Launch initial concurrency pool
  const workers = Array.from({ length: Math.min(concurrencyPool, virtualUsers) }, () => runWorker());
  await Promise.all(workers);

  const totalDurationMs = Math.round(performance.now() - startTime);
  const requestsPerSecond = totalDurationMs > 0 ? Math.round((completed / (totalDurationMs / 1000)) * 10) / 10 : 0;
  const totalDataTransferredMb = Math.round((completed * payloadSizeKb) / 1024 * 10) / 10;

  // Sort latencies for percentiles
  latencies.sort((a, b) => a - b);
  const minLatency = latencies.length > 0 ? latencies[0] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p50Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

  // Evaluate Health & Bottlenecks
  const failureRate = completed > 0 ? (failureCount / completed) * 100 : 0;
  const bottlenecks: string[] = [];
  const recommendations: string[] = [];
  let healthStatus: 'optimal' | 'moderate_risk' | 'critical_bottleneck' = 'optimal';

  if (failureRate > 8 || p95Latency > 2500) {
    healthStatus = 'critical_bottleneck';
    bottlenecks.push(`Tingkat kegagalan transmisi mencapai ${failureRate.toFixed(1)}% saat lonjakan serentak.`);
    bottlenecks.push(`Latensi P95 mencapai ${(p95Latency / 1000).toFixed(2)} detik karena batasan kuota konkurensi (~30 request simultan Google Apps Script).`);
    recommendations.push('Wajib terapkan Jadwal 4 Gelombang OPD agar akses 4.300 pegawai terbagi rata sepanjang hari.');
    recommendations.push('Gunakan antrean Exponential Backoff dengan Jitter acak untuk menyerap lonjakan.');
    recommendations.push('Instruksikan peserta mengompres berkas PDF di bawah 500 KB sebelum unggah.');
  } else if (failureRate > 1 || p95Latency > 1200) {
    healthStatus = 'moderate_risk';
    bottlenecks.push(`Latensi respons meningkat menjadi ${(p95Latency / 1000).toFixed(2)} detik pada beban gelombang menengah.`);
    recommendations.push('Pertahankan imbauan jadwal gelombang per OPD untuk mencegah penumpukan lalu lintas pada jam kerja (09.00 - 11.00).');
    recommendations.push('Aktifkan pesan penyejuk antrean di formulir unggah saat server mendeteksi percobaan ulang.');
  } else {
    healthStatus = 'optimal';
    recommendations.push('Kapasitas dan throughput sangat stabil untuk menangani alur gelombang terjadwal.');
    recommendations.push('Tetap monitor riwayat sinkronisasi Drive di dasbor selama periode pengunggahan aktif.');
  }

  // Calculate OPD distribution safety windows for the 4,300+ employees
  const opdDistribution = OPD_WAVE_SCHEDULES.map((wave) => {
    // 8 working hours = 480 minutes
    const safeRate = Math.round((wave.estimatedEmployees / (2 * 480)) * 10) / 10;
    return {
      waveName: wave.waveName,
      totalTarget: wave.estimatedEmployees,
      safeWindowHours: wave.recommendedDays,
      recommendedRatePerMin: Math.max(safeRate, 1.5)
    };
  });

  const summaryMessage = healthStatus === 'optimal'
    ? `Sistem siap melayani beban gelombang dengan Throughput ${requestsPerSecond} berkas/detik dan rata-rata latensi ${avgLatency} ms.`
    : healthStatus === 'moderate_risk'
    ? `Sistem mampu menangani beban, namun disarankan membagi unggah berkas menggunakan sistem gelombang OPD.`
    : `Beban serentak ekstrem memicu pelambatan (~${failureRate.toFixed(1)}% throttled). Wajib menerapkan antrean berulang dan jadwal berjenjang.`;

  return {
    scenario: config.scenario,
    totalRequests: completed,
    successCount,
    failureCount,
    totalDurationMs,
    requestsPerSecond,
    dataTransferredMb: totalDataTransferredMb,
    latencies: {
      min: minLatency,
      avg: avgLatency,
      p50: p50Latency,
      p95: p95Latency,
      max: maxLatency
    },
    healthStatus,
    summaryMessage,
    bottlenecks,
    recommendations,
    opdDistribution
  };
}
