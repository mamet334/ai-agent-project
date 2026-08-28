# 📋 ROADMAP PENGEMBANGAN MAMET OS ECOSYSTEM
**Fokus Saat Ini:** Stabilitas Jangka Panjang & Optimasi Biaya AI

---

### ✅ FASE 1: Membangun `MemoryGovernorService` (Anti-Bias & Pemelihara Memori)
- **Tujuan:** Mencegah AI menjadi bias akibat "ringkasan dari ringkasan" (seperti pengalaman gagal pada PDF).
- **Tindakan:**
  - Buat layanan baru `MemoryGovernorService.js` yang berjalan di background.
  - Terapkan aturan *Golden Source*: Ringkasan tidak boleh berdiri sendiri; harus memiliki metadata (source_file, timestamp, version) yang menunjuk ke data mentah (raw content) di database.
  - Tambahkan fungsi verifikasi otomatis: Jika file asli berubah, layanan ini akan memicu AI murah untuk membuat ulang ringkasannya.

#### ADDENDUM FASE 1: Retrieval, Conflict, Access Tier, Lifecycle

Menyambung spesifikasi Fase 1 (Golden Source Rule + verifikasi otomatis). Empat poin berikut mendefinisikan bagaimana `MemoryGovernorService.js` memutuskan record mana yang di-retrieve, bagaimana konflik ditangani, bagaimana akses dibatasi, dan bagaimana lifecycle penghapusan bekerja. Scope dibatasi eksplisit agar tidak melebar ke luar tanggung jawab Fase 1.

**1. Retrieval Strategy — Two-Stage Filter**

Tahap 1 — Category/tag filter (SQL WHERE, bukan vector search):
```
SELECT * FROM mamet_memory
WHERE category IN (:relevant_categories)
  AND status = 'active'
ORDER BY updated_at DESC
LIMIT :candidate_pool_size
```
- `relevant_categories` ditentukan dari context task saat ini (mapping category → task type didefinisikan terpisah, bukan bagian addendum ini).
- Tahap ini WAJIB dijalankan lebih dulu untuk membatasi candidate pool sebelum tahap 2. Tidak boleh full-table scan.

Tahap 2 — Ranking dalam candidate pool:
- Ranking hanya dijalankan terhadap hasil Tahap 1 (bukan seluruh tabel).
- Formula ranking: kombinasi `recency_score` (berbasis `updated_at`) + `confidence_score` (dari hasil verifikasi Golden Source di Fase 1).
- Implementasi ranking (cosine similarity vs rule-based scoring) adalah keputusan implementasi, di luar scope addendum ini — yang wajib: ranking tidak berjalan di luar hasil Tahap 1.

**2. Conflict Resolution**

Kondisi trigger konflik:
```
IF EXISTS (
  SELECT 1 FROM mamet_memory
  WHERE source_file = :source_file
    AND content != :new_content
    AND version_sequence_broken = true
)
```
- Dua record dengan `source_file` sama, `content` berbeda, dan `version` tidak sekuensial (bukan strictly incrementing) → set status record baru menjadi `CONFLICT_PENDING_REVIEW`.

Aturan wajib:
- `MemoryGovernorService` DILARANG auto-resolve konflik (tidak boleh otomatis pilih salah satu record sebagai benar).
- Record berstatus `CONFLICT_PENDING_REVIEW` di-exclude dari retrieval normal (Bagian 1) sampai di-resolve.
- Resolusi HANYA melalui user action eksplisit (bukan melalui background job/cron).

**3. Access Tier**

Skema tambahan:
- Kolom baru `access_tier` pada tabel `mamet_memory`: enum `generic` | `sensitive`.
- Default value: `generic` (harus di-set eksplisit ke `sensitive` saat insert, tidak ada auto-classification di scope addendum ini).

Aturan query:
```
-- Default retrieval (Bagian 1) SELALU exclude sensitive:
WHERE access_tier = 'generic'
  AND category IN (:relevant_categories)
  AND status = 'active'

-- Sensitive tier hanya di-include jika request membawa flag eksplisit:
-- request.include_sensitive = true (di-set oleh explicit user command, bukan inferred)
```

**4. Soft-Delete Lifecycle**

Skema tambahan:
- Kolom `status` pada `mamet_memory`: enum `active` | `archived` | `pending_purge`.

Alur:
1. Background cleanup job (jadwal: didefinisikan terpisah di luar addendum ini) mengubah record usang/tidak relevan dari `active` → `archived`. Ini soft-delete, bukan penghapusan data.
2. Record `archived` di-exclude dari retrieval normal (Bagian 1) tapi tetap ada di database (fungsi kotak sampah).
3. Perubahan `archived` → `pending_purge` → hard-delete HANYA dapat dipicu oleh command eksplisit dari user. Tidak ada jalur otomatis (cron/background job) yang boleh melakukan hard-delete.

*Catatan scope: Empat poin di atas adalah kontrak perilaku (behavioral contract) untuk `MemoryGovernorService`, bukan spesifikasi implementasi detail (pemilihan library, struktur function, dsb). Detail implementasi didefinisikan saat development, mengacu pada kontrak ini.*

---

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
