# Changelog: Engineer Repository Reader & Kernel Panic Fix (2026-07-30)

## Overview
Update kali ini berfokus pada dua perbaikan utama:
1. Menambahkan kapabilitas bagi **Engineer** untuk membaca file dari repository langsung, sehingga Engineer memiliki "mata" yang sama dengan AI Assistant eksternal untuk mengakses source code.
2. Memperbaiki masalah kritis **Mamet OS Kernel Panic** yang terjadi di lingkungan produksi (Vercel) akibat *race condition* saat OS boot.

## 1. Engineer Repository Reader (`READ_REPO`)

### Masalah Sebelumnya
Engineer sebelumnya hanya memiliki `StorageManager` yang terbatas pada localStorage (di web) atau file sistem terbatas di desktop. Engineer tidak bisa membaca langsung file source code (misalnya `Kernel.js` atau `engineer.js`) ketika diinstruksikan oleh pengguna.

### Solusi yang Diimplementasikan
- **`RepositoryReaderService`**: Service baru yang dibuat untuk membaca isi repositori.
  - **Backend Web (Vercel)**: Menggunakan GitHub API (`api.github.com` dan `raw.githubusercontent.com`) untuk membaca file, me-list direktori, dan mencari file.
  - **Backend Desktop (Electron)**: Menggunakan IPC Electron (`window.electronAPI.readFile` dan `window.electronAPI.listFiles`).
- **Update pada `Engineer` Service**:
  - Menambahkan _intent_ baru `READ_REPO` (mendeteksi perintah seperti "baca file...", "tampilkan isi...", "list folder...").
  - Menambahkan handler `_handleReadRepoTask` untuk merespons intent tersebut.
  - Engineer sekarang dapat meresolve nama file menggunakan `FileIndexService` sebelum mengambil isinya via `RepositoryReaderService`.
- **Update UI (`ConversationEngine.jsx`)**:
  - Listener baru untuk event `Engineer:FileContent` agar UI dapat merender isi kode yang dibaca ke dalam blok kode yang memiliki *syntax highlighting*.
  - Listener tambahan untuk berbagai tipe balasan `READ_REPO_RESULT`, `READ_REPO_LISTING`, `READ_REPO_SEARCH_RESULT`, dll.

## 2. Fix MAMET OS KERNEL PANIC (Vercel Production)

### Masalah Sebelumnya
Terjadi error `[ServiceManager] Service not found: ApplicationManager` di Vercel saat baru dimuat.
**Root Cause**: Aplikasi React (UI) merender secara sinkron komponen-komponen utama (`Sidebar`, `ApplicationContainer`, dll) dan langsung memanggil `serviceManager.get('ApplicationManager')` sebelum `kernel.boot()` selesai dieksekusi. Di lingkungan lambat (seperti Vercel), boot tidak selesai sebelum render React, yang memicu error fatal.

### Solusi yang Diimplementasikan
- **Safe Hook (`useService.js`)**: Membuat custom hook React `useService(name)` yang bertindak sebagai jembatan aman. Hook ini me-return `null` jika kernel belum `RUNNING`, lalu men-subscribe event `Kernel:BootComplete` untuk mengambil service ketika kernel siap.
- **Refactor Komponen Inti**: 
  - `Sidebar.jsx`
  - `ApplicationContainer.jsx`
  - `ActivityBar.jsx`
  - `MobileBottomNav.jsx`
  Semua komponen ini sekarang menggunakan `useService` dan memiliki handling jika service masih `null`.
- **Error Boundary pada `main.jsx`**: Menangkap kegagalan `kernel.boot()`. Jika boot gagal (misal tidak ada koneksi/fatal error), ia merender tampilan *Error Kernel Panic* (berwarna merah, monospace) lengkap dengan tombol *REBOOT OS*, sehingga UI utama OS tidak dipaksakan untuk dirender.

## Testing & Verification
- Unit test telah dijalankan: **54/54 test PASS**.
- Intent `READ_REPO` berfungsi dan telah diintegrasikan dengan baik.
- *Kernel Panic* diatasi (UI sekarang tidak menabrak dependensi service yang belum siap).
