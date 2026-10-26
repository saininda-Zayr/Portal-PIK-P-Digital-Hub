import rawPegawai from './pppkPegawai.json';
import rawOpd from './opdUnitKerja.json';

export interface PppkPegawai {
  nip: string;
  nama: string;
}

export interface OpdItem {
  opd: string;
  unitKerjaList: string[];
}

export interface SpkSubmissionRecord {
  id?: string;
  nip: string;
  nama: string;
  opd: string;
  unitKerja: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: string;
  targetDriveUrl: string;
  targetFolderPath: string;
  driveFileUrl?: string | null;
  driveFolderUrl?: string | null;
  driveFileId?: string | null;
  uploadedAt: string;
}

export const SPK_DRIVE_ROOT_URL = 'https://drive.google.com/drive/folders/1feUjhSZy5yIe_KKBJ_DOJi3z39ROWr1e';
export const SPK_DRIVE_FOLDER_ID = '1feUjhSZy5yIe_KKBJ_DOJi3z39ROWr1e';
export const MAX_SPK_FILE_SIZE_BYTES = 1048576; // Strictly 1 MB

export const ALL_PEGAWAI: PppkPegawai[] = rawPegawai as PppkPegawai[];
export const ALL_OPD: OpdItem[] = rawOpd as OpdItem[];

/**
 * Fast search by query across NIP and Nama.
 * Returns up to maxResults matches.
 */
export function searchPegawai(queryStr: string, maxResults = 25): PppkPegawai[] {
  const q = queryStr.trim().toLowerCase();
  if (!q) {
    return ALL_PEGAWAI.slice(0, maxResults);
  }

  const results: PppkPegawai[] = [];
  for (let i = 0; i < ALL_PEGAWAI.length; i++) {
    const p = ALL_PEGAWAI[i];
    if (p.nip.toLowerCase().includes(q) || p.nama.toLowerCase().includes(q)) {
      results.push(p);
      if (results.length >= maxResults) break;
    }
  }
  return results;
}

export function getOpdNames(): string[] {
  return ALL_OPD.map(item => item.opd);
}

export function getUnitKerjaByOpd(opdName: string): string[] {
  const found = ALL_OPD.find(item => item.opd === opdName);
  if (!found || found.unitKerjaList.length === 0) {
    return [opdName];
  }
  return found.unitKerjaList;
}
