import { ALL_OPD, SPK_DRIVE_FOLDER_ID, SPK_DRIVE_ROOT_URL } from './pppkData';

/**
 * Generates the complete, standalone Google Apps Script code for bulk folder creation
 * and direct file upload to Google Drive.
 */
export function generateGoogleAppsScriptCode(): string {
  const opdJsonString = JSON.stringify(ALL_OPD, null, 2);

  return `/**
 * ====================================================================
 * SKRIP OTOMATISASI GOOGLE DRIVE SPK PPPK PARUH WAKTU
 * BKPSDM PEMERINTAH KABUPATEN POLEWALI MANDAR
 * ====================================================================
 * 
 * Skrip ini menyediakan 2 Fitur Utama:
 * 1. buatSemuaFolderDanSubfolder()
 *    -> Membuat seluruh 45 folder OPD dan semua subfolder Unit Kerja 
 *       di Google Drive secara otomatis dalam hitungan detik.
 * 
 * 2. doPost(e)
 *    -> Menerima unggahan berkas fisik SPK (PDF) dari aplikasi web dan
 *       menyimpannya langsung ke subfolder OPD & Unit Kerja yang sesuai.
 * ====================================================================
 */

// ID Folder Utama Google Drive SPK PPPK
const ROOT_FOLDER_ID = "${SPK_DRIVE_FOLDER_ID}";

// Data 45 OPD dan Seluruh Unit Kerja Kabupaten Polewali Mandar
const OPD_DATA = ${opdJsonString};

/**
 * ====================================================================
 * FUNGSI 1: BUAT SEMUA FOLDER & SUBFOLDER SEKALIGUS
 * ====================================================================
 * CARA PAKAI:
 * 1. Di bagian atas editor Apps Script, pilih fungsi "buatSemuaFolderDanSubfolder"
 * 2. Klik tombol "Jalankan" (Run)
 * 3. Berikan izin saat diminta (Izinkan akses Google Drive)
 * 4. Tunggu ~20-30 detik hingga status Execution log "Selesai"
 */
function buatSemuaFolderDanSubfolder() {
  Logger.log("=== MEMULAI PEMBUATAN FOLDER & SUBFOLDER DI GOOGLE DRIVE ===");
  const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  
  let totalOpd = 0;
  let totalUnit = 0;

  for (let i = 0; i < OPD_DATA.length; i++) {
    const item = OPD_DATA[i];
    const opdName = item.opd.trim();
    Logger.log("[" + (i + 1) + "/" + OPD_DATA.length + "] Membuat/memeriksa OPD: " + opdName);

    // Cari atau buat folder OPD
    const opdFolder = getOrCreateSubFolder(rootFolder, opdName);
    totalOpd++;

    // Buat subfolder untuk setiap Unit Kerja di dalam OPD
    const units = item.unitKerjaList || [opdName];
    for (let u = 0; u < units.length; u++) {
      const unitName = units[u].trim();
      getOrCreateSubFolder(opdFolder, unitName);
      totalUnit++;
    }
  }

  Logger.log("=== SELESAI! ===");
  Logger.log("Total " + totalOpd + " folder OPD dan " + totalUnit + " subfolder unit kerja berhasil diproses!");
  return "Berhasil membuat " + totalOpd + " folder OPD dan " + totalUnit + " subfolder unit kerja.";
}

/**
 * Helper mencari atau membuat folder jika belum ada (mencegah duplikat)
 */
function getOrCreateSubFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}

/**
 * ====================================================================
 * FUNGSI 2: MENERIMA UNGGAHAN BERKAS SPK DARI APLIKASI WEB
 * ====================================================================
 * CARA PAKAI:
 * 1. Klik tombol "Deploy" / "Terapkan" di pojok kanan atas > "Deployment Baru"
 * 2. Pilih jenis: "Aplikasi Web" (Web App)
 * 3. Konfigurasi Deployment (SANGAT PENTING):
 *    - Deskripsi: Web App Unggah SPK PPPK
 *    - Jalankan sebagai (Execute as): "Saya" / "Me" (Akun Google Anda)
 *    - Siapa yang memiliki akses (Who has access): "Siapa saja" / "Anyone"
 *      (PENTING: Jangan pilih 'Hanya saya' agar aplikasi web publik dapat mengirim berkas)
 * 4. Klik "Terapkan" (Deploy) lalu salin "URL Aplikasi Web" (akhiran /exec)
 * 5. Tempel URL tersebut ke menu Setup Drive di aplikasi SIM ASN
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Tidak ada payload data yang diterima."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);
    const nip = (payload.nip || "").trim();
    const nama = (payload.nama || "").trim();
    const opd = (payload.opd || "").trim();
    const unitKerja = (payload.unitKerja || "").trim();
    const fileBase64 = payload.fileBase64;
    const mimeType = payload.mimeType || "application/pdf";

    if (!fileBase64) {
      throw new Error("Berkas PDF (Base64) tidak ditemukan.");
    }
    if (!opd) {
      throw new Error("Nama OPD wajib disertakan.");
    }

    // 1. Dapatkan folder root SPK PPPK
    const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);

    // 2. Dapatkan atau buat folder OPD
    const opdFolder = getOrCreateSubFolder(rootFolder, opd);

    // 3. Dapatkan atau buat subfolder Unit Kerja
    const targetFolder = unitKerja ? getOrCreateSubFolder(opdFolder, unitKerja) : opdFolder;

    // 4. Standarisasi nama berkas: SPK_[NIP]_[Nama].pdf
    const cleanNip = (nip || "").replace(/[^0-9a-zA-Z]/g, "").trim();
    const cleanNama = (nama || "").replace(/[/\\\\?%*:|"<>]/g, " ").replace(/\\s+/g, " ").trim();
    let cleanFileName = "SPK_PPPK.pdf";
    if (cleanNip && cleanNama) {
      cleanFileName = "SPK_" + cleanNip + "_" + cleanNama + ".pdf";
    } else if (cleanNip) {
      cleanFileName = "SPK_" + cleanNip + ".pdf";
    } else if (cleanNama) {
      cleanFileName = "SPK_" + cleanNama + ".pdf";
    }

    // 5. Cek apakah berkas dengan nama yang sama sudah ada di folder tersebut
    // Jika ada, pindahkan versi lama ke trash agar tidak terjadi file ganda yang membingungkan
    const existingFiles = targetFolder.getFilesByName(cleanFileName);
    while (existingFiles.hasNext()) {
      const oldFile = existingFiles.next();
      try {
        oldFile.setTrashed(true);
      } catch (trashErr) {
        // Abaikan jika tidak diizinkan trash
      }
    }

    // 6. Simpan berkas fisik ke subfolder yang tepat di Google Drive
    const decodedBytes = Utilities.base64Decode(fileBase64);
    const blob = Utilities.newBlob(decodedBytes, mimeType, cleanFileName);
    const savedFile = targetFolder.createFile(blob);

    // 7. Berikan akses lihat jika kebijakan domain mengizinkan
    try {
      savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch(err) {
      // Abaikan jika dilarang oleh domain Workspace
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "Berkas SPK berhasil disimpan ke Google Drive dengan format SPK_NIP_Nama.pdf!",
      fileId: savedFile.getId(),
      fileUrl: savedFile.getUrl(),
      downloadUrl: savedFile.getDownloadUrl(),
      folderUrl: targetFolder.getUrl(),
      fileName: cleanFileName,
      folderPath: "SPK PPPK / " + opd + (unitKerja ? " / " + unitKerja : "")
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Health check & validasi URL Web App
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "Server Google Apps Script SPK PPPK BKPSDM Aktif!",
    rootFolderId: ROOT_FOLDER_ID
  })).setMimeType(ContentService.MimeType.JSON);
}
`;
}
