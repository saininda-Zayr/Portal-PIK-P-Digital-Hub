import { ALL_OPD } from './pppkData';

export interface OpdWaveSchedule {
  waveNumber: number;
  waveName: string;
  recommendedDays: string;
  opdList: string[];
  description: string;
  estimatedEmployees: number;
}

/**
 * 4 Waves of Staggered Upload Schedules to distribute 4,300+ PPPK employees safely
 * and prevent concurrent traffic spikes on Google Drive & server infrastructure.
 */
export const OPD_WAVE_SCHEDULES: OpdWaveSchedule[] = [
  {
    waveNumber: 1,
    waveName: 'Gelombang I - Satuan Pendidikan',
    recommendedDays: 'Hari ke-1 s.d. Hari ke-2',
    description: 'Dinas Pendidikan dan Kebudayaan beserta seluruh UPTD Sekolah (SD & SMP) se-Kabupaten',
    opdList: [
      'DINAS PENDIDIKAN DAN KEBUDAYAAN'
    ],
    estimatedEmployees: 1650
  },
  {
    waveNumber: 2,
    waveName: 'Gelombang II - Layanan Kesehatan',
    recommendedDays: 'Hari ke-3 s.d. Hari ke-4',
    description: 'Dinas Kesehatan, RSUD Hj. Andi Depu, UPTD Labkesda, dan seluruh 20 Puskesmas',
    opdList: [
      'DINAS KESEHATAN',
      'RUMAH SAKIT UMUM DAERAH HJ. ANDI DEPU'
    ],
    estimatedEmployees: 1200
  },
  {
    waveNumber: 3,
    waveName: 'Gelombang III - Dinas Teknis, Badan, & Kantor',
    recommendedDays: 'Hari ke-5 s.d. Hari ke-6',
    description: 'Seluruh Dinas Teknis Daerah, Badan Keuangan, Bappeda, BKPSDM, Satpol PP, dan Inspektorat',
    opdList: [
      'BADAN KEPEGAWAIAN, PENDIDIKAN DAN PELATIHAN',
      'BADAN KEUANGAN DAN ASET DAERAH',
      'BADAN PERENCANAAN PEMBANGUNAN DAERAH, PENELITIAN DAN PENGEMBANGAN',
      'BADAN PENDAPATAN DAERAH',
      'BADAN PENANGGULANGAN BENCANA DAERAH',
      'BADAN KESATUAN BANGSA DAN POLITIK',
      'INSPEKTORAT',
      'SATUAN POLISI PAMONG PRAJA',
      'DINAS PEKERJAAN UMUM DAN PENATAAN RUANG',
      'DINAS PERUMAHAN, KAWASAN PERMUKIMAN DAN PERTANAHAN',
      'DINAS LINGKUNGAN HIDUP DAN KEBERSIHAN',
      'DINAS PERHUBUNGAN',
      'DINAS KOMUNIKASI, INFORMATIKA, STATISTIK DAN PERSANDIAN',
      'DINAS PERTANIAN DAN PANGAN',
      'DINAS PERIKANAN',
      'DINAS PERINDUSTRIAN, PERDAGANGAN, KOPERASI DAN UKM',
      'DINAS SOSIAL',
      'DINAS TENAGA KERJA DAN TRANSMIGRASI',
      'DINAS PEMBERDAYAAN MASYARAKAT DAN DESA',
      'DINAS PENGENDALIAN PENDUDUK, KB, PEMBERDAYAAN PEREMPUAN DAN PERLINDUNGAN ANAK',
      'DINAS KEPENDUDUKAN DAN PENCATATAN SIPIL',
      'DINAS PERPUSTAKAAN DAN KEARSIPAN',
      'DINAS PEMUDA, OLAHRAGA DAN PARIWISATA',
      'DINAS PENANAMAN MODAL DAN PELAYANAN TERPADU SATU PINTU'
    ],
    estimatedEmployees: 950
  },
  {
    waveNumber: 4,
    waveName: 'Gelombang IV - Sekretariat & Seluruh Kecamatan',
    recommendedDays: 'Hari ke-7 s.d. Hari ke-8',
    description: 'Sekretariat Daerah, Sekretariat DPRD, dan seluruh 16 Kantor Kecamatan serta Kelurahan',
    opdList: [
      'SEKRETARIAT DAERAH',
      'SEKRETARIAT DEWAN PERWAKILAN RAKYAT DAERAH',
      'KECAMATAN POLEWALI',
      'KECAMATAN WONOMULYO',
      'KECAMATAN TINAMBUNG',
      'KECAMATAN CAMPALAGIAN',
      'KECAMATAN BALANIPA',
      'KECAMATAN ALLU',
      'KECAMATAN LIMBORO',
      'KECAMATAN TUBO SENDRANA',
      'KECAMATAN LUYO',
      'KECAMATAN MATAKALI',
      'KECAMATAN TAPANGO',
      'KECAMATAN MAPPILLI',
      'KECAMATAN BINUANG',
      'KECAMATAN ANREAPI',
      'KECAMATAN MATANGNGA',
      'KECAMATAN BULUKUMBA'
    ],
    estimatedEmployees: 500
  }
];

/**
 * Get the designated wave schedule for an OPD
 */
export function getOpdSchedule(opdName: string): OpdWaveSchedule | undefined {
  if (!opdName) return undefined;
  const normalized = opdName.trim().toUpperCase();

  return OPD_WAVE_SCHEDULES.find((wave) =>
    wave.opdList.some((opd) => opd.toUpperCase() === normalized)
  ) || OPD_WAVE_SCHEDULES[2]; // Default to Wave 3 if not found in specific list
}
