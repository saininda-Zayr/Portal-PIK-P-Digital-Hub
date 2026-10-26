import * as XLSX from 'xlsx';
import { ALL_PEGAWAI, SpkSubmissionRecord, PppkPegawai } from '../data/pppkData';

export interface ExportExcelOptions {
  submissions: SpkSubmissionRecord[];
  selectedOpdFilter?: string;
  searchQuery?: string;
  scope: 'active_filter' | 'all_opd';
  mode: 'all_with_status' | 'only_uploaded';
}

export interface ExportSummaryStats {
  totalRows: number;
  uploadedCount: number;
  unuploadedCount: number;
  opdCount: number;
}

/**
 * Builds the merged records according to user preferences and filters
 */
export function buildExcelExportRows(options: ExportExcelOptions) {
  const { submissions, selectedOpdFilter = '', searchQuery = '', scope, mode } = options;

  // 1. Map submissions by cleaned NIP for O(1) lookup
  const submissionMap = new Map<string, SpkSubmissionRecord>();
  const processedSubmissionIds = new Set<string>();

  submissions.forEach((sub) => {
    const cleanNip = (sub.nip || '').replace(/[^0-9a-zA-Z]/g, '').trim();
    if (cleanNip) {
      const existing = submissionMap.get(cleanNip);
      if (!existing || new Date(sub.uploadedAt) > new Date(existing.uploadedAt)) {
        submissionMap.set(cleanNip, sub);
      }
    }
  });

  interface MergedRow {
    nip: string;
    nama: string;
    opd: string;
    unitKerja: string;
    isUploaded: boolean;
    status: string;
    fileName: string;
    fileSize: number;
    uploadedAt: string;
    driveFileUrl: string;
    driveSyncStatus: string;
  }

  const mergedRows: MergedRow[] = [];
  const matchedNips = new Set<string>();

  // 2. Iterate through master pegawai list
  ALL_PEGAWAI.forEach((pegawai) => {
    const cleanNip = (pegawai.nip || '').replace(/[^0-9a-zA-Z]/g, '').trim();
    const sub = cleanNip ? submissionMap.get(cleanNip) : undefined;

    if (sub) {
      matchedNips.add(cleanNip);
      if (sub.id) processedSubmissionIds.add(sub.id);

      mergedRows.push({
        nip: pegawai.nip,
        nama: sub.nama || pegawai.nama,
        opd: sub.opd || '-',
        unitKerja: sub.unitKerja || '-',
        isUploaded: true,
        status: 'SUDAH UNGGAH',
        fileName: sub.fileName || '-',
        fileSize: sub.fileSize || 0,
        uploadedAt: sub.uploadedAt || '',
        driveFileUrl: sub.driveFileUrl || sub.targetDriveUrl || '',
        driveSyncStatus: sub.driveSyncStatus === 'synced' ? 'Tersimpan di Drive' : sub.status || 'Tercatat di SIM ASN'
      });
    } else {
      // Belum upload
      mergedRows.push({
        nip: pegawai.nip,
        nama: pegawai.nama,
        opd: '- (Belum Upload)',
        unitKerja: '- (Belum Upload)',
        isUploaded: false,
        status: 'BELUM UNGGAH',
        fileName: '-',
        fileSize: 0,
        uploadedAt: '',
        driveFileUrl: '',
        driveSyncStatus: 'Belum Ada Berkas'
      });
    }
  });

  // 3. Include any submissions that were uploaded but not present in ALL_PEGAWAI master list (edge cases)
  submissions.forEach((sub) => {
    const cleanNip = (sub.nip || '').replace(/[^0-9a-zA-Z]/g, '').trim();
    if (cleanNip && !matchedNips.has(cleanNip)) {
      matchedNips.add(cleanNip);
      mergedRows.push({
        nip: sub.nip,
        nama: sub.nama,
        opd: sub.opd || '-',
        unitKerja: sub.unitKerja || '-',
        isUploaded: true,
        status: 'SUDAH UNGGAH',
        fileName: sub.fileName || '-',
        fileSize: sub.fileSize || 0,
        uploadedAt: sub.uploadedAt || '',
        driveFileUrl: sub.driveFileUrl || sub.targetDriveUrl || '',
        driveSyncStatus: sub.driveSyncStatus === 'synced' ? 'Tersimpan di Drive' : sub.status || 'Tercatat di SIM ASN'
      });
    }
  });

  // 4. Filter by mode (all_with_status vs only_uploaded)
  let filtered = mergedRows;
  if (mode === 'only_uploaded') {
    filtered = filtered.filter((r) => r.isUploaded);
  }

  // 5. Filter by scope (active_filter vs all_opd)
  if (scope === 'active_filter') {
    const q = (searchQuery || '').trim().toLowerCase();
    const opdFilter = (selectedOpdFilter || '').trim().toLowerCase();

    filtered = filtered.filter((row) => {
      // Search match
      const matchesSearch =
        !q ||
        row.nip.toLowerCase().includes(q) ||
        row.nama.toLowerCase().includes(q) ||
        row.opd.toLowerCase().includes(q) ||
        row.unitKerja.toLowerCase().includes(q) ||
        row.fileName.toLowerCase().includes(q);

      // OPD filter match
      let matchesOpd = true;
      if (opdFilter) {
        if (row.isUploaded) {
          matchesOpd = row.opd.toLowerCase() === opdFilter;
        } else {
          // If viewing a specific OPD, we keep rows if they match search or if no specific OPD was tied to master
          matchesOpd = false; // Only show members confirmed in that OPD
        }
      }

      return matchesSearch && matchesOpd;
    });
  }

  return filtered;
}

/**
 * Format bytes to readable string (KB / MB)
 */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format date string into Indonesian format
 */
function formatDate(dateStr: string): string {
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
}

/**
 * Generates and triggers download of the standardized Excel recap file
 */
export async function exportSpkRecapToExcel(options: ExportExcelOptions): Promise<{
  success: boolean;
  fileName: string;
  totalExported: number;
}> {
  const rows = buildExcelExportRows(options);
  const now = new Date();
  const dateFormatted = now.toISOString().split('T')[0];
  const timeFormatted = now.toLocaleTimeString('id-ID');

  const opdSuffix = options.scope === 'active_filter' && options.selectedOpdFilter
    ? options.selectedOpdFilter.replace(/[^0-9a-zA-Z]/g, '_').toUpperCase()
    : 'SEMUA_OPD';

  const outputFileName = `REKAP_SPK_PPPK_POLMAN_${opdSuffix}_${dateFormatted}.xlsx`;

  // Statistics calculation for the header banner
  const totalUploaded = rows.filter((r) => r.isUploaded).length;
  const totalUnuploaded = rows.length - totalUploaded;
  const progressPercent = rows.length > 0 ? ((totalUploaded / rows.length) * 100).toFixed(1) : '0';

  // 1. Construct Worksheet Grid (AOA: Array of Arrays)
  const aoaData: any[][] = [];

  // Title & Institution Header
  aoaData.push(['PEMERINTAH KABUPATEN POLEWALI MANDAR']);
  aoaData.push(['BADAN KEPEGAWAIAN, PENDIDIKAN DAN PELATIHAN (BKPSDM)']);
  aoaData.push(['BIDANG PENGADAAN, PEMBERHENTIAN DAN INFORMASI KEPEGAWAIAN']);
  aoaData.push(['LAPORAN REKAPITULASI PENGUNGGAHAN BERKAS SPK PPPK PARUH WAKTU']);
  aoaData.push([]);

  // Metadata summary
  aoaData.push(['Waktu Ekspor', `: ${dateFormatted} pukul ${timeFormatted}`]);
  aoaData.push(['Filter OPD', `: ${options.selectedOpdFilter || 'Seluruh OPD (Semua Kabupaten)'}`]);
  if (options.searchQuery) {
    aoaData.push(['Kata Kunci Pencarian', `: "${options.searchQuery}"`]);
  }
  aoaData.push(['Total Data Tercatat', `: ${rows.length} Pegawai`]);
  aoaData.push(['Sudah Mengunggah', `: ${totalUploaded} Pegawai (${progressPercent}%)`]);
  aoaData.push(['Belum Mengunggah', `: ${totalUnuploaded} Pegawai`]);
  aoaData.push(['Format Nama Berkas', ': SPK_[NIP]_[Nama].pdf']);
  aoaData.push([]);

  // Table Column Headers (11 columns)
  const headerRow = [
    'NO',
    'NIP PPPK',
    'NAMA LENGKAP PEGAWAI',
    'OPD / INSTANSI',
    'UNIT KERJA PENEMPATAN',
    'STATUS BERKAS',
    'NAMA BERKAS RESMI',
    'UKURAN',
    'WAKTU & TANGGAL UNGGAH',
    'TAUTAN GOOGLE DRIVE',
    'STATUS INTEGRASI DRIVE'
  ];
  aoaData.push(headerRow);

  // Table Data Rows
  rows.forEach((row, index) => {
    aoaData.push([
      index + 1,
      // NIP formatted as string to ensure Excel does NOT convert to scientific notation
      String(row.nip),
      row.nama,
      row.opd,
      row.unitKerja,
      row.status,
      row.fileName,
      formatBytes(row.fileSize),
      formatDate(row.uploadedAt),
      row.driveFileUrl || '-',
      row.driveSyncStatus
    ]);
  });

  // Footer note
  aoaData.push([]);
  aoaData.push(['* Dokumen ini dibuat secara otomatis dari Sistem Informasi Manajemen ASN (Cloud-P) BKPSDM Kabupaten Polewali Mandar.']);

  // 2. Create Sheet and Set Explicit Column Widths
  const worksheet = XLSX.utils.aoa_to_sheet(aoaData);

  // Explicit column widths (in characters)
  worksheet['!cols'] = [
    { wch: 6 },   // No
    { wch: 24 },  // NIP
    { wch: 35 },  // Nama
    { wch: 38 },  // OPD
    { wch: 35 },  // Unit Kerja
    { wch: 18 },  // Status Berkas
    { wch: 42 },  // Nama Berkas
    { wch: 14 },  // Ukuran
    { wch: 22 },  // Waktu Unggah
    { wch: 55 },  // Tautan Drive
    { wch: 24 }   // Status Drive
  ];

  // Ensure NIP cells have string type 's' explicitly
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:K1');
  const headerRowIndex = 9 + (options.searchQuery ? 1 : 0); // row index of headerRow (0-based)

  for (let R = headerRowIndex + 1; R <= range.e.r; R++) {
    // Column B is NIP (index 1)
    const nipCellAddress = XLSX.utils.encode_cell({ r: R, c: 1 });
    if (worksheet[nipCellAddress]) {
      worksheet[nipCellAddress].t = 's';
    }
  }

  // 3. Create Workbook & Append Sheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap SPK PPPK');

  // 4. Trigger download
  XLSX.writeFile(workbook, outputFileName);

  return {
    success: true,
    fileName: outputFileName,
    totalExported: rows.length
  };
}
