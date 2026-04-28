# DOKUMEN RANCANGAN ANTARMUKA (MOCKUP UI)
## SISTEM INFORMASI MANAJEMEN ASN (SIM-ASN)
**Bidang PIK-P Kabupaten Polewali Mandar**

---

### 1. FILOSOFI DESAIN
Rancangan UI SIM-ASN mengusung konsep **"Modern-Institutional"**. Desain ini bertujuan untuk memberikan kesan profesionalitas pemerintahan namun tetap ringan, bersih, dan mudah digunakan oleh operator dari berbagai tingkat kemahiran digital.

*   **Clean & Minimalist**: Mengurangi clutter visual agar fokus tetap pada data dokumen.
*   **Aksibilitas**: Kontras warna yang tinggi untuk keterbacaan.
*   **Responsive**: Layout yang menyesuaikan diri baik di layar monitor desktop maupun perangkat tablet.

---

### 2. PALET WARNA (STYLE GUIDE)
Warna utama mencerminkan identitas instansi dengan sentuhan modern:
*   **Primary Yellow (#EAB308)**: Digunakan untuk aksi utama (Call to Action), ikon aktif, dan aksen navigasi. Melambangkan semangat pelayanan dan kejelasan.
*   **Neutral Dark (#18181B)**: Digunakan untuk teks utama dan elemen sidebar agar memberikan kontras yang tegas.
*   **Soft Background (#F9FAFB)**: Warna latar belakang area kerja untuk mengurangi kelelahan mata.

---

### 3. TIPOGRAFI
*   **Font Utama**: *Inter* atau *Sans-serif* sistem.
*   **Heading**: Bold, Tracking Tight (untuk kesan modern dan padat).
*   **Body**: Regular, Line Height 1.6 (untuk kenyamanan membaca daftar dokumen).

---

### 4. STRUKTUR HALAMAN UTAMA (DASHBOARD)
Secara visual, antarmuka dibagi menjadi 3 bagian utama:

#### A. Sidebar (Navigasi Kiri)
*   **Top Section**: Logo Kabupaten Polewali Mandar & Nama Aplikasi.
*   **Menu Section**: Navigasi kategori (Pengadaan, Kinerja, Informasi).
*   **Footer**: Status Login (Foto profil dan nama user).

#### B. Header & Stats (Bagian Atas)
*   Integrasi Search Bar di tengah.
*   Widget Statistik Ringkas: Total dokumen, unggahan bulan ini, dan total penyimpanan.

#### C. Main Content (Area Kerja)
*   **Grid System**: Daftar dokumen ditampilkan dalam bentuk tabel atau kartu modular.
*   **Action Floating Button**: Tombol "Tambah Dokumen" dengan warna kuning cerah di pojok kanan bawah atau area head.

---

### 5. RANCANGAN MODAL UPLOAD (ANTARMUKA PROSES)
Saat user menekan tombol tambah, muncul jendela modal dengan spesifikasi:
1.  **Double Dropdown**: Pemilihan Tahun dan Bulan.
2.  **Smart Input**: Field deskripsi dengan autocomplete.
3.  **Visual Dropzone**: Area bergaris putus-putus dengan ikon 'Cloud Upload'. Memberikan feedback instan saat file diseret (drag).
4.  **Loading Progress Bar**: Animasi transisi saat pengunggahan ke Google Drive berlangsung untuk memberikan kepastian sistem.

---

### 6. ALUR UX (USER JOURNEY)
1.  **Entry**: User melihat dashboard dengan ringkasan data.
2.  **Selection**: User memilih kategori (Contoh: Kinerja Pegawai).
3.  **Interaction**: User mencari dokumen via Search Bar atau filter Tahun.
4.  **Transaction**: User mengunggah file. Sistem melakukan *auto-renaming* di latar belakang.
5.  **Synchronization**: User menekan "Sinkron Drive" untuk validasi data Drive vs Database.

---
**Catatan**: Rancangan ini dibuat untuk memastikan tidak ada "Data Silo" dengan membuat akses dokumen menjadi transparan dan terpusat melalui satu gerbang antarmuka.
