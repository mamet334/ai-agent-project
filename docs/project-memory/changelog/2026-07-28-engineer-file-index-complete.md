# 📝 Changelog: FileIndexService & Engineer Boot Fix (2026-07-28)

## Ringkasan Eksekutif
Sesi hari ini berfokus pada **penyelesaian arsitektur Engineer** dengan memperkenalkan `FileIndexService` untuk resolusi file berbasis indeks, memperbaiki urutan inisialisasi di `engineer.js`, dan merapikan logika resolusi path di `StorageManager.js` serta `electron/main.cjs`.

---

## Perubahan & Perbaikan

### 1. Pembuatan Layanan Baru: `FileIndexService`
- **Tujuan:** Engineer tidak lagi menebak folder; ia memiliki indeks global dari semua file di proyek.
- **Lokasi:** `frontend/src/core/runtime/services/FileIndexService.js`
- **Fitur:**
  - Membangun indeks file secara rekursif via `StorageManager.listRecursive()`.
  - Menyediakan method `resolvePath(filename)` untuk mencari path lengkap berdasarkan nama file.
  - Logika prioritas: 1) Mengandung "mamet os ecosystem", 2) Mengandung `frontend/src/components/workbench`, 3) Path terpendek.

### 2. Perbaikan `StorageManager.js` & `electron/main.cjs`
- **Path Resolution Fix:** Menghapus penggunaan `path.resolve()` di sisi frontend (renderer) yang menyebabkan error Vite `node:path externalized`.
- **Main Process Update:** `PROJECT_ROOT` di `electron/main.cjs` diperbaiki menjadi `path.resolve(__dirname, '..', '..')` (mengarah ke root proyek).
- **Recursive Listing:** Menambahkan handler IPC `fs:listFilesRecursive` di main process untuk mendukung `FileIndexService`.

### 3. Perbaikan Urutan Inisialisasi `engineer.js`
- **Fix:** `FileIndexService` sekarang diinisialisasi secara **sinkronus (await)** di dalam method `initialize()`.
- **Logika Baru:** `Engineer` menunggu indeks file selesai dibangun sebelum meregistrasikan listener event.
- **Perbaikan `_tryReadFile()`:** Stage 3 mencari file via `FileIndexService` hanya jika `isReady = true`.

### 4. Refactoring Ekstraksi Path & Logging
- **`_extractFileNamesFromTask()`:** Diperbarui dengan 3 level prioritas (Full path → Src path → Nama file saja).
- **Diagnostic Logging:** Menambahkan log detail di `_tryReadFile` dan `FileIndexService.resolvePath` untuk memudahkan debugging masa depan.

---

## Perubahan File

| File | Perubahan |
|------|-----------|
| `frontend/src/core/runtime/services/FileIndexService.js` | **File baru** – Layanan indeks file global |
| `frontend/src/core/runtime/services/engineer.js` | Perbaikan urutan init, tambah `await`, update `_tryReadFile` |
| `frontend/src/core/runtime/StorageManager.js` | Hapus `path.resolve`, tambah method `listRecursive` |
| `frontend/electron/main.cjs` | Tambah handler `fs:listFilesRecursive`, perbaiki `PROJECT_ROOT` |
| `frontend/electron/preload.cjs` | Ekspos `listFilesRecursive` ke `window.electronAPI` |

---

## Status Saat Ini (Pending)

Setelah perubahan di atas, sistem **berhasil booting tanpa error** dan `FileIndexService` berhasil mengindeks **253.044 file** dengan **62.427 nama unik**.

**Namun, ada satu hambatan terakhir yang masih dalam proses debugging:**
- `Engineer._tryReadFile()` masih gagal membaca file target (`ConversationEngine.jsx`) karena `FileIndexService` memilih path lama (`ai-agent-project`) alih-alih project aktif (`mamet os ecosystem`).
- Logika prioritas di `resolvePath` sudah diperbaiki, namun perlu dipastikan caching (Vite cache) sudah dibersihkan dan aplikasi di-restart total.

---

## Langkah Selanjutnya
1. Bersihkan cache Vite (`Remove-Item -Recurse -Force node_modules/.vite`).
2. Restart total aplikasi (`npm run desktop`).
3. Kirim ulang prompt Engineer dan pantau log `Console` untuk memastikan path yang benar terpilih.

---

*Dokumen ini disusun pada 28 Juli 2026 sebagai arsip changelog internal.*