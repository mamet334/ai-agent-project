# 📋 ROADMAP PENGEMBANGAN MAMET OS ECOSYSTEM
**Fokus Saat Ini:** Stabilitas Jangka Panjang & Optimasi Biaya AI

---

### ✅ FASE 1: Membangun `MemoryGovernorService` (Anti-Bias & Pemelihara Memori)
- **Tujuan:** Mencegah AI menjadi bias akibat "ringkasan dari ringkasan" (seperti pengalaman gagal pada PDF).
- **Tindakan:**
  - Buat layanan baru `MemoryGovernorService.js` yang berjalan di background.
  - Terapkan aturan *Golden Source*: Ringkasan tidak boleh berdiri sendiri; harus memiliki metadata (source_file, timestamp, version) yang menunjuk ke data mentah (raw content) di database.
  - Tambahkan fungsi verifikasi otomatis: Jika file asli berubah, layanan ini akan memicu AI murah untuk membuat ulang ringkasannya.

### ✅ FASE 2: Penyempurnaan UI `MemoryContextPanel`
- **Tujuan:** Memperjelas asal usul memori yang digunakan AI di panel sidebar kanan.
- **Tindakan:**
  - Tambahkan indikator visual (badge warna/label) pada setiap item memori untuk membedakan antara `USER_MEMORY` dan `PERSONAL_KNOWLEDGE`.
  - Pastikan tombol toggle `X` (tutup panel) dan tombol `Refresh` (refresh data) berfungsi sempurna.

### ✅ FASE 3: Optimasi Biaya AI (Strategi Model Bertingkat)
- **Tujuan:** Menghemat saldo OpenRouter dengan membagi beban kerja antara model murah dan model besar.
- **Tindakan:**
  - Modifikasi fungsi `_generatePatch()` di `engineer.js`.
  - **Langkah 1:** Panggil model murah (misal `gemini-1.5-flash`) hanya untuk mengekstrak poin-poin fakta dari 5 file kode yang dianalisis.
  - **Langkah 2:** Kirim hasil fakta (bukan kode mentah) ke model besar (`deepseek-v3`) untuk melakukan *reasoning* dan membuat patch final.

### ✅ FASE 4: Integrasi RAG Dokumen Eksternal & Deep Research (Jangka Panjang)
- **Tujuan:** Memperluas kemampuan Engineer untuk membaca PDF, DOCX, dan melakukan pencarian web.
- **Tindakan:**
  - Menggunakan parser (seperti `pdf-parse`, `mammoth`) untuk mengambil teks mentah dari dokumen eksternal (JANGAN diringkas dulu).
  - Masukkan teks mentah ke sistem *Embedding* dan RAG (bukan hasil ringkasan) agar akurasi tetap terjaga.
  - Integrasikan fitur *Deep Research* (pencarian web via tools) ke dalam `Engineer`.

### ✅ FASE 5: Dokumentasi & Changelog
- **Tujuan:** Mencatat setiap pencapaian agar Engineer internal tidak lupa dan bisa belajar di masa depan.
- **Tindakan:**
  - Buat satu file markdown di folder `_knowledge_archive/changelog/` setiap kali satu fase selesai (misal: `2026-08-04-memory-governor-implemented.md`).

---

### 🎯 Status Saat Ini (Sudah Selesai):
1. ✅ Spring Cleaning (Bersih dari dead code)
2. ✅ Anti-Kernel Panic (Graceful Degradation)
3. ✅ Circuit Breaker (Batasan panggilan API)
4. ✅ UI Notification Center
5. ✅ File Explorer
6. ✅ Panel Memory Context (Fitur dasar tanpa integrasi *MemoryGovernor*)

