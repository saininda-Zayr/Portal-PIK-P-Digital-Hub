# Rencana Implementasi: Kategorisasi Level Akses Pengguna (Multi-Level RBAC)

Penambahan sistem kategorisasi level akses pengguna (*Role-Based Access Control* / RBAC) pada menu **Manajemen User** di portal Cloud-P BKPSDM Polewali Mandar untuk membagi wewenang akun ke dalam 4 tingkatan: **Super Admin**, **Admin Bidang**, **Staf Operator**, dan **Viewer**, lengkap dengan kontrol visibilitas menu sidebar dan pembatasan izin modifikasi/penghapusan data.

---

## 1. Spesifikasi Level Akses & Matriks Kewenangan

| Level Akses | Izin & Akses Menu Sidebar | Hak Hapus Data | Hak Kelola User |
| :--- | :--- | :---: | :---: |
| **Super Admin** | Akses penuh ke seluruh menu (Dashboard, Data Center, Arsip Digital, SPK PPPK, Permintaan Data, Work Hub, Pengumuman, Manajemen User) | Ya (Penuh) | Ya (Semua Akun) |
| **Admin Bidang** | Akses ke seluruh menu operasional (Data Center, Arsip Digital, SPK PPPK, Permintaan Data, Work Hub, Pengumuman), *kecuali* Manajemen User | Ya (Dokumen/Arsip) | Tidak |
| **Staf Operator** | Akses ke Data Center, Arsip Digital, Permintaan Data, Work Hub, dan Pengumuman (Dapat mengunggah & mengedit dokumen) | Tidak | Tidak |
| **Viewer** | Akses baca saja (*Read-only*): Dapat melihat Dashboard, mencari & mengunduh dokumen di Data Center & Arsip Digital, melihat status permintaan & pengumuman. Tombol Tambah/Edit/Hapus disembunyikan. | Tidak | Tidak |

> **Proteksi Khusus**: Akun utama (`saininda@gmail.com` / UID `lUGYop8JDvcT2SJxjiEzBC8PD2p2`) tetap memiliki hak istimewa permanen sebagai Super Admin dan tidak dapat diturunkan levelnya atau dicabut aksesnya oleh user lain.

---

## 2. Rincian Perubahan Kode & Konfigurasi

### A. Database & Aturan Keamanan (Firestore & Security Rules)
- **`firestore.rules`**:
  - Perbarui fungsi `isValidUser` agar memvalidasi atribut `role` yang diperluas: `['super_admin', 'admin', 'staff', 'viewer']` (tetap kompatibel dengan data yang sudah ada).
  - Perbarui helper peran:
    - `isSuperAdmin()`: Memeriksa apakah user adalah Super Admin atau pemilik sistem.
    - `isAdmin()`: Memeriksa apakah user adalah Super Admin atau Admin Bidang.
    - `isOperatorOrAbove()`: Memeriksa apakah user bukan Viewer (memiliki izin tulis/unggah).
  - Batasi aksi `delete` pada koleksi `documents`, `archives`, `tasks`, `announcements` hanya untuk pengguna dengan level Admin atau Super Admin.
  - Batasi pembaruan koleksi `users` hanya untuk Super Admin.
- **`firebase-blueprint.json`**:
  - Perbarui skema enum `role` pada entitas `User` menjadi `["super_admin", "admin", "staff", "viewer"]`.
- Deploy aturan keamanan Firestore yang telah disesuaikan via `deploy_firebase`.

### B. Antarmuka Manajemen User (`UserManagement` di `src/App.tsx`)
- **Kolom Baru Level Akses**:
  - Menambahkan kolom **Level Akses** pada tabel pengguna.
  - Menyediakan dropdown interaktif (`<select>`) langsung pada setiap baris user dengan opsi:
    - `super_admin` (*Super Admin*)
    - `admin` (*Admin Bidang*)
    - `staff` (*Staf Operator*)
    - `viewer` (*Viewer / Akses Lihat*)
  - Menampilkan badge visual yang jelas dengan warna teridentifikasi (Ungu/Emas untuk Super Admin, Biru untuk Admin Bidang, Hijau untuk Operator, Abu-abu untuk Viewer).
- **Aksi Cepat & Proteksi**:
  - Perubahan dropdown langsung memicu update ke Firestore (`updateDoc` / `setDoc` dengan `merge: true`).
  - Menampilkan umpan balik visual (*toast* / pesan konfirmasi sukses saat level akses berhasil diubah).
  - Menonaktifkan dropdown perubahan level untuk akun admin utama pemilik portal (`saininda@gmail.com`).

### C. Pembatasan Menu Sidebar & Kontrol Fitur Sesuai Role
- **Sidebar Menu Filtering (`Sidebar` di `src/App.tsx`)**:
  - Menerima `userRole` dari data profil pengguna saat ini.
  - Menu `Manajemen User`: Hanya tampil bagi pengguna dengan level `super_admin` atau email utama `saininda@gmail.com`.
  - Menu operasional disesuaikan agar pengguna dengan level yang tepat mendapatkan pengalaman yang bersih dan relevan.
- **Proteksi Aksi UI**:
  - Tombol **Hapus Dokumen** dan **Hapus Arsip**: Hanya tampil jika pengguna adalah `super_admin` atau `admin`.
  - Tombol **Unggah Dokumen** / **Tambah Arsip** / **Tambah Tugas**: Disembunyikan atau dinonaktifkan untuk level `viewer`.

---

## 3. Rencana Verifikasi & Pengujian

### Otomatisasi (Build & Linter)
1. Menjalankan `compile_applet` untuk memastikan seluruh tipe data TypeScript dan komponen terkompilasi tanpa galat.
2. Menjalankan `lint_applet` untuk memastikan tidak ada kesalahan sintaks atau impor yang hilang.
3. Menjalankan `deploy_firebase` untuk memastikan aturan keamanan Firestore versi multi-role berhasil aktif di server Google Cloud.

### Pengujian Fungsional
1. **Perubahan Role Dinamis**: Masuk ke menu Manajemen User, ubah role salah satu user dari Staf ke Viewer, lalu ke Admin Bidang, dan pastikan data tersimpan di Firestore secara seketika.
2. **Uji Visibilitas Sidebar**:
   - Sebagai Super Admin: Menu Manajemen User muncul dan dapat diakses.
   - Sebagai Admin Bidang / Staf / Viewer: Menu Manajemen User tersembunyi dari navigasi sidebar.
3. **Uji Pembatasan Aksi Hapus**:
   - Memastikan tombol hapus dokumen tidak muncul pada level Staf Operator dan Viewer.
4. **Uji Mode Read-Only (Viewer)**:
   - Memastikan pengguna dengan level Viewer tidak dapat menambahkan berkas baru dan hanya dapat melihat serta mengunduh berkas.
