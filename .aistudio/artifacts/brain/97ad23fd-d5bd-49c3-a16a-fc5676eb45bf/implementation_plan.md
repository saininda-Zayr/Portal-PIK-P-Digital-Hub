# Pengujian Beban & Perlindungan Lonjakan Lalu Lintas (4.300+ Pegawai PPPK)

Implementasi pengujian beban (load & concurrency testing), simulasi kapasitas batas kuota pengunggahan, serta arsitektur perlindungan lonjakan lalu lintas (*traffic spike protection*) terpadu untuk memastikan aplikasi tetap stabil, andal, dan tidak mengalami *down time* saat diakses oleh lebih dari 4.300 pegawai PPPK Paruh Waktu se-Kabupaten Polewali Mandar.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan konfirmasi pertanyaan klarifikasi, arsitektur kesiapan beban dibangun dengan 3 pilar utama:

- **Metode Pengujian Terpilih**: **Simulasi Beban Serentak & Analisis Batas Kuota**. Menjalankan rangkaian uji simulasi concurrency (50 s.d. 1.000+ request simultan) guna menganalisis batas transmisi base64, throughput Firestore, dan respon jembatan Google Drive.
- **Mekanisme Perlindungan Lalu Lintas**: **Sistem Antrean Cerdas & Rekomendasi Jadwal Akses per OPD**. Pembagian jadwal unggah 45 OPD ke dalam 4 gelombang (batch), dilengkapi indikator status beban server real-time (*Lancar / Sedang / Padat*) pada portal unggah.
- **Optimasi Formulir Berkas**: **Validasi Presisi, Kompresi/Optimasi Payload, dan Exponential Backoff Retry**. Menghindari *traffic shock* dengan retry bertahap (jitter 1s, 2s, 4s, 8s) dan antrean antispam saat terjadi lonjakan jaringan.

---

## 1. Overview & Core Concept

- **Tantangan Utama**: Ketika pengumuman SPK disebarkan, 4.300 pegawai berpotensi membuka aplikasi dan menekan tombol *Unggah Berkas* secara bersamaan. Tanpa mitigasi, hal ini dapat menyebabkan:
  1. *Rate limit* Google Apps Script / Google Drive (kuota eksekusi simultan).
  2. Beban tinggi memori browser akibat encode Base64 file besar serentak.
  3. Kegagalan jaringan pada koneksi seluler peserta di pelosok daerah.
- **Solusi yang Dihadirkan**:
  1. **Suite Pengujian Beban & Diagnostik Admin**: Alat uji interaktif di Portal Admin untuk mensimulasikan ratusan request bersamaan dan memverifikasi batas ketahanan sistem sebelum link publik disebar.
  2. **Jadwal Akses Bertahap Berbasis OPD**: Panduan dan pembagian gelombang unggah otomatis berdasarkan 45 OPD (Dinas Pendidikan, Dinas Kesehatan, OPD Teknis, Kecamatan).
  3. **Traffic Throttle & Resilient Client**: Logika antrean client-side yang mengatur ritme pengiriman berkas, dilengkapi deteksi koneksi lambat dan retry otomatis jika server sedang sibuk.

---

## 2. User Experience & Visual Design

### Key User Flows

#### A. Alur Peserta PPPK (Formulir Unggah)
1. **Indikator Beban Server**: Di bagian atas modal unggah, muncul barometer status sistem:
   - 🟢 *Lalu Lintas Lancar* (Server siap menerima unggahan instan).
   - 🟡 *Lalu Lintas Sedang* (Disarankan menunggu 1-2 menit bila proses sedikit lambat).
   - 🟠 *Lalu Lintas Padat* (Menampilkan rekomendasi jadwal OPD dan tombol antre otomatis).
2. **Jadwal Rekomendasi OPD**: Saat peserta memilih OPD (misal: *Dinas Kesehatan*), sistem menampilkan informasi ramah: *"Jadwal prioritas unggah instansi Anda: Gelombang II (Rabu - Kamis)"*, namun tetap mengizinkan pengunggahan jika mendesak.
3. **Penanganan Beban Tinggi & Auto-Retry**: Jika transmisi Google Apps Script merespons busy (429/503), tombol tidak langsung error melainkan menampilkan:
   - Countdown visual: *"Server sibuk. Mengantre percobaan otomatis ke-2 dalam 3 detik..."* tanpa peserta perlu mengulang input data dari awal.

#### B. Alur Admin (Panel Uji Beban & Monitoring Lalu Lintas)
1. Di menu **Monitoring SPK PPPK**, terdapat tab/tombol baru: **`⚡ Uji Beban & Kapasitas (Stress Test)`**.
2. Admin dapat memilih skenario uji:
   - Skenario 1: *Uji Beban Ringan (50 Pegawai Simultan)*.
   - Skenario 2: *Uji Beban Sedang (250 Pegawai Simultan)*.
   - Skenario 3: *Uji Beban Ekstrem (1.000+ Pegawai Simultan)*.
3. Menampilkan metrik real-time: *Throughput per detik, Average Latency, Success Rate (%), Memory Usage, dan Estimasi Waktu Penyelesaian 4.300 Pegawai*.

---

## 3. Key Product Decisions & Trade-Offs

- **Pengaturan Jadwal Gelombang (Staggered Scheduling)**:
  - *Keputusan*: Membagi 4.300 pegawai ke dalam 4 kelompok OPD dengan rentang waktu masing-masing 2-3 hari.
  - *Alasan*: Secara statistik memotong beban puncak (*peak concurrent load*) sebesar 75%, sehingga server Google dan aplikasi selalu beroperasi pada zona aman (< 300 concurrent uploads).
- **Client-Side Exponential Backoff**:
  - *Keputusan*: Mengimplementasikan algoritma retry otomatis dengan jeda acak (*exponential backoff with jitter*).
  - *Alasan*: Menghindari fenomena *thundering herd problem* di mana ribuan pengguna yang gagal mencoba klik ulang secara bersamaan detik itu juga.
- **Optimasi Payload Transmisi**:
  - *Keputusan*: Memastikan payload base64 PDF dioptimalkan, membatasi ukuran ketat < 1 MB di browser sebelum diunggah.
  - *Alasan*: Mengurangi konsumsi memori dan menghemat kuota internet pegawai hingga 60%.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│          4.300+ PPPK Concurrent Access Model           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│         Client-Side Traffic Governor & Shield          │
│  ┌─────────────────────────┐ ┌──────────────────────┐  │
│  │ OPD Wave Schedule Check │ │ Strict 1MB Validator │  │
│  └───────────┬─────────────┘ └──────────┬───────────┘  │
│              ▼                          ▼              │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Exponential Backoff Engine (Retry with Jitter)   │  │
│  └──────────────────────────┬───────────────────────┘  │
└─────────────────────────────┼──────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
┌─────────────────────────────┐ ┌────────────────────────┐
│   Google Apps Script Web    │ │  Firestore Database   │
│   (Max Concurrency Shield)  │ │  (Realtime Submissions)│
│  - Drive Folder Resolution  │ │  - 10k+ writes/sec cap │
│  - Conflict Deduplication   │ │  - Auto-sharded stats  │
└─────────────────────────────┘ └────────────────────────┘
```

### Komponen Pengujian & Implementasi:
1. **Load Test Engine (`spkLoadTestService.ts`)**: Modul pengujian mandiri yang dapat mengeksekusi simulasi panggilan virtual dengan metrik latensi, kegagalan, dan throughput.
2. **Resilience Layer (`spkDriveService.ts`)**: Penambahan pembungkus *exponential backoff retry* pada fungsi pengiriman berkas.
3. **Jadwal & Traffic Guide Modal (`SPKScheduleGuideModal.tsx`)**: Panduan jadwal gelombang unggah resmi per OPD yang dapat dibagikan ke grup WhatsApp koordinator kepegawaian.
4. **Stress Test Dashboard Panel (`SPKStressTestPanel.tsx`)**: Antarmuka diagnostik admin untuk mengevaluasi kesiapan server sebelum peluncuran masal.
