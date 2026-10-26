# Rekap & Ekspor Excel Berkas SPK PPPK Paruh Waktu

Penambahan fitur rekapitulasi data pengunggahan berkas Surat Perjanjian Kerja (SPK) PPPK Paruh Waktu dalam format Microsoft Excel (.xlsx) di portal monitoring admin BKPSDM Polewali Mandar, lengkap dengan informasi status (Sudah/Belum Mengunggah), OPD, Unit Kerja, dan tautan berkas di Google Drive.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan konfirmasi pertanyaan klarifikasi sebelumnya, fitur ini akan dibangun dengan ketentuan berikut:

- **Cakupan Data Rekap**: **Lengkap (Sudah & Belum Mengunggah)**. Sistem akan mencocokkan master data seluruh PPPK Paruh Waktu Kabupaten Polewali Mandar dengan riwayat pengunggahan di database `spk_pppk_submissions`.
- **Susunan Sheet Excel**: **1 (Satu) Sheet Terpadu** yang memuat seluruh tabel data gabungan lintas OPD dan Unit Kerja secara rapi, dilengkapi header resmi BKPSDM dan statistik ringkasan di bagian atas.
- **Dukungan Filter**: **Mengikuti Filter Aktif di Layar**. Jika admin sedang memfilter OPD tertentu atau mencari kata kunci nama/NIP, berkas Excel yang diunduh akan merefleksikan hasil filter tersebut (dilengkapi tombol opsi untuk unduh seluruh kabupaten atau unduh filter aktif).

---

## 1. Overview & Core Concept

- **Apa yang Dibangun**: Tombol aksi dan modal interaktif "Ekspor Rekap Excel" di menu *Monitoring Berkas SPK PPPK*, yang menghasilkan berkas spreadsheet `.xlsx` resmi dengan format rapi dan kolom lengkap.
- **Target Pengguna**: Pejabat fungsional, pengelola kepegawaian, dan administrator Bidang Pengadaan, Pemberhentian & Informasi Kepegawaian (Cloud-P) BKPSDM Polewali Mandar.
- **Nilai Manfaat**: 
  - Memudahkan pelaporan berkala progres SPK ke pimpinan (Kepala BKPSDM / Sekretaris Daerah).
  - Membantu OPD/Unit Kerja mengidentifikasi pegawai PPPK yang belum menuntaskan pengunggahan SPK fisik.
  - Memiliki arsip lokal yang mencantumkan nama file standar `SPK_[NIP]_[Nama].pdf` dan link akses langsung ke Google Drive.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Navigasi Admin**: Admin membuka menu **Monitoring SPK PPPK**.
2. **Penerapan Filter (Opsional)**: Admin dapat memilih filter OPD tertentu (misal: *Dinas Kesehatan*) atau mencari nama/unit kerja tertentu.
3. **Pemicu Ekspor**: Di baris aksi atas (sebelah tombol Setup Drive & Akses Drive), tersedia tombol hijau berstandar spreadsheet:
   - Label: **`📊 Ekspor Rekap Excel`**
   - Menampilkan badge jumlah total baris yang akan diekspor (misal: *1,489 pegawai*).
4. **Modal Konfirmasi Ringkas / Dropdown Aksi**:
   - Opsi Cepat 1: *Ekspor Sesuai Filter Aktif* (misal: 120 data Puskesmas / Dinas Terpilih).
   - Opsi Cepat 2: *Ekspor Seluruh Pegawai se-Kabupaten* (semua 45 OPD).
5. **Proses Unduh**: Indikator loading halus, file langsung terunduh secara instan dengan penamaan file otomatis:
   - Format nama file: `REKAP_SPK_PPPK_POLMAN_[NAMA_OPD]_[TANGGAL].xlsx`.

### Struktur Kolom Sheet Excel
Tabel spreadsheet diformat dengan baris header elegan (Dark Charcoal / Emas Khas Polewali Mandar), autofilter aktif, dan pembagian kolom:

| No | NIP | Nama Lengkap Pegawai | OPD Induk | Unit Kerja Penempatan | Status Unggah | Nama Berkas Standar | Waktu Unggah | Tautan Berkas Google Drive | Status Jembatan Drive |
|----|-----|----------------------|-----------|------------------------|---------------|---------------------|--------------|----------------------------|-----------------------|
| 1  | 198... | FULAN, S.Pd.      | DINAS PENDIDIKAN DAN KEBUDAYAAN | SMP NEGERI 1 POLEWALI | SUDAH UNGGAH | SPK_198..._FULAN.pdf | 26/10/2026 09:15 | [Buka di Drive] | Tersimpan |
| 2  | 199... | FULANA, A.Md.Keb  | DINAS KESEHATAN | PUSKESMAS TINAMBUNG | BELUM UNGGAH | - | - | - | - |

---

## 3. Key Product Decisions & Trade-Offs

- **Penggabungan Master Pegawai & Data Submission**:
  - *Keputusan*: Melakukan *left join* antara master data pegawai (`ALL_PEGAWAI` / OPD mapping) dengan koleksi Firestore `spk_pppk_submissions` berdasarkan NIP.
  - *Alasan*: Menjamin akurasi 100% sehingga admin mengetahui persis siapa yang sudah dan siapa yang belum mengunggah.
- **Pustaka Pembuat Spreadsheet**:
  - *Keputusan*: Menggunakan pustaka standar industri `xlsx` (SheetJS) yang terpasang di client-side.
  - *Alasan*: Kompatibel penuh dengan Microsoft Excel, Google Sheets, dan LibreOffice tanpa memerlukan server-side render yang lambat.
- **Pewarnaan Status di Excel**:
  - Kolom status diberi penanda teks yang jelas: `SUDAH UNGGAH` (hijau/positif) dan `BELUM UNGGAH` (merah/perhatian) sehingga mudah difilter langsung di Excel.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│             Firestore & Master Data Sources            │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │ spk_pppk_submissions │   │ ALL_PEGAWAI & OPD    │  │
│  │ (Data Berkas Diunggah)│   │ (Master Pegawai)     │  │
│  └───────────┬───────────┘   └───────────┬──────────┘  │
└──────────────┼───────────────────────────┼─────────────┘
               │                           │
               ▼                           ▼
┌────────────────────────────────────────────────────────┐
│       SPK Monitoring View (React State & Memo)         │
│  - Active Filter (OPD filter, Search query)            │
│  - Merged Records Generator (Sudah vs Belum)           │
│  - Excel Data Transformer (Column & Header Styling)    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             SheetJS / XLSX File Downloader             │
│  - Generate WorkBook with Single Sheet                 │
│  - Set Cell Dimensions & Column Widths                 │
│  - Save as .xlsx (REKAP_SPK_PPPK_POLMAN_*.xlsx)        │
└────────────────────────────────────────────────────────┘
```

### Data Pipeline & Event Handlers
1. **Penggabungan Data (`useMemo`)**:
   - Memetakan setiap NIP di data pegawai terhadap submission terbaru di Firestore.
   - Menyertakan OPD dan Unit Kerja dari data submission atau unit kerja master.
2. **Penerapan Filter**:
   - Jika `selectedOpdFilter` aktif, saring hanya pegawai di OPD tersebut.
   - Jika `searchQuery` aktif, saring berdasarkan kecocokan NIP atau nama.
3. **Ekspor Handler**:
   - Menyiapkan baris metadata (judul rekap, tanggal cetak, pembuat rekap).
   - Menghasilkan buffer file XLSX dan memicu unduhan browser via Blob.
