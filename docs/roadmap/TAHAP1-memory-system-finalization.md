# TAHAP 1 — Memory System Finalization

**Status:** 📋 Siap Dikerjakan  
**Tanggal dibuat:** 2026-09-03  
**File utama yang terlibat:** `MemoryGovernorService.js`, `MemoryService.js`, `MemoryContextPanel.jsx`, `ConversationEngine.jsx`

---

## 1. Ringkasan
Menuntaskan 3 gap yang selama ini tertunda di domain Memory System. Ketiganya digabung menjadi satu paket kerja karena menyentuh modul dan komponen file yang identik, sehingga jauh lebih efisien dan minim risiko *rework* jika dikerjakan sekaligus daripada terpisah.

---

## 2. Urutan Sub-Task (Pengerjaan Sekuensial)

### Sub A — Integrasi MemoryGovernorService ke Assistant Trigger
* **Prioritas:** Pertama (Fondasi bagi Sub B)
* **Masalah saat ini:**  
  `AssistantService.handleMemoryTrigger()` sebelumnya menyimpan memori secara standar tanpa metadata Golden Source (`hasGoldenMeta = false`), sehingga bypass `storeGoldenMemory()`.
* **Catatan Penting:**  
  Audit pada 2026-09-03 menemukan bahwa melalui implementasi `FIX-intent-classification-and-memory-store-unification`, jalur ini sudah **~70% berjalan** — `detectAndMarkConflict()` dan `storeGoldenMemory()` sudah terpanggil via `_handleMemoryStore()` pada skenario `MEMORY_STORE`. Task ini berfokus memverifikasi sisa 30% dan menutup celah pemanggilan yang tersisa, **BUKAN membangun dari nol**.
* **Exit Criteria:**
  - [ ] Audit ulang seluruh jalur pemanggilan memori di runtime Assistant — pastikan SEMUA jalur menyertakan metadata Golden Source yang konsisten (`useGovernor: true`, `source_reference: 'assistant_chat_trigger'`, `version_code`).
  - [ ] Metadata Golden Source konsisten `true` di seluruh skenario penyimpanan via Assistant chat.
  - [ ] Verifikasi tidak ada regresi pada intent classification yang sudah bekerja benar (negasi `MEMORY_STORE`, personal pronouns `LOOKUP`, dll).

---

### Sub B — CP4b: UI Purge Lifecycle & Conflict Resolution
* **Prioritas:** Kedua (Bergantung pada skema metadata dari Sub A)

#### Bagian 1 — Pengayaan `metadata.conflict_info` (Temuan Audit 2026-09-03):
`detectAndMarkConflict()` di `MemoryGovernorService.js` (baris ~523–526) saat ini hanya mengupdate kolom `status` ke `CONFLICT_PENDING_REVIEW`, belum menulis konteks konflik ke kolom `metadata` (jsonb). Perkaya payload update dengan struktur baku:
```json
{
  "conflict_info": {
    "detected_at": "ISO timestamp",
    "reason": "VERSION_SEQUENCE_BROKEN_AND_CONTENT_DIFF",
    "source_reference": "string",
    "incoming_content": "string",
    "incoming_version_seq": "number",
    "existing_version_seq": "number",
    "previous_summary": "string"
  }
}
```

#### Bagian 2 — Penurunan Log Level:
Baris log *"Conflict detected for..."* (`MemoryGovernorService.js:540`) saat ini menggunakan `console.warn` yang memicu collapsible stack trace di browser console. Turunkan ke `console.log` karena ini adalah transisi event normal, bukan error/exception.

#### Bagian 3 — UI Conflict Resolver:
Bangun modal/komponen UI di `MemoryContextPanel.jsx` (atau lokasi terkait di workbench) yang:
* Menampilkan daftar record berstatus `CONFLICT_PENDING_REVIEW`.
* Menampilkan diff perbandingan (`previous_summary` vs `incoming_content`) memanfaatkan data dari `metadata.conflict_info`.
* Tombol aksi keputusan Owner: Simpan Baru (*keep incoming*) / Pertahankan Lama (*discard*) / Resolusi Manual.
* Memanggil `MemoryGovernorService.resolveConflict()` yang sudah diimplementasikan di service.

#### Bagian 4 — UI Purge Manager / Trash Bin:
Bangun antarmuka UI untuk siklus: **Soft-delete $\rightarrow$ Pending Purge $\rightarrow$ Hard Delete**:
* Tampilkan record berstatus `archived` dan `pending_purge`.
* Tombol aksi untuk `requestPurge()` dan `executePurge()` yang sudah ada di service (dengan retensi 90 hari sesuai spesifikasi yang disetujui).

* **Exit Criteria:**
  - [ ] `metadata.conflict_info` terisi otomatis setiap kali `detectAndMarkConflict()` mendeteksi anomali konten/versi.
  - [ ] Log level conflict detection berubah menjadi `console.log`.
  - [ ] Owner dapat melihat & meresolusi konflik langsung dari UI tanpa query manual ke database.
  - [ ] Owner dapat memantau & mengeksekusi purge / trash bin langsung dari UI.
  - [ ] 3 record `CONFLICT_PENDING_REVIEW` yang saat ini ada di database Supabase dapat di-resolve via UI baru sebagai uji validasi kasus nyata.

---

### Sub C — Backlog #7: Memory Context Panel Category Alignment
* **Prioritas:** Ketiga (Dikerjakan setelah UI Sub B siap agar modifikasi file efisien)
* **Masalah:**  
  Heuristik `MemoryService._inferCategories()` menyempitkan kategori ke `['general']` untuk percakapan umum, menyebabkan `MemoryContextPanel` salah menampilkan *"0 memori aktif"* padahal backend Edge Function menggunakan memori aktif secara benar.
* **Solusi Terisolasi:**  
  - Perluas default kategori tampilan ke `['general', 'preference', 'location']` sebagai baseline display, **ATAU**
  - Ambil top-N memori aktif lintas seluruh kategori tanpa filter sempit, **KHUSUS untuk keperluan display panel**.
* **BATASAN KRITIS:**  
  Perubahan **HARUS diisolasi hanya untuk keperluan tampilan UI**. DILARANG mengubah heuristik retrieval yang dikonsumsi backend LLM untuk menentukan context prompt — gunakan fungsi/parameter terpisah (misal `_inferCategoriesForDisplay()` atau parameter `forDisplay: true`) agar logic prompt backend tetap murni dan tidak terdistorsi.
* **Exit Criteria:**
  - [ ] `MemoryContextPanel` menampilkan jumlah dan daftar memori aktif secara akurat di sidebar Assistant.
  - [ ] Retrieval logic yang dikonsumsi backend LLM **TIDAK berubah** (diverifikasi dengan test matrix yang sama).

---

## 3. Validasi Akhir Tahap 1 (Exit Criteria Menyeluruh)
- [ ] Build frontend (`npm run build`) & lint sukses 100% tanpa error.
- [ ] Test manual 1: Simpan memori baru $\rightarrow$ muncul seketika di panel dengan kategori yang sesuai.
- [ ] Test manual 2: Memicu konflik memori secara sengaja $\rightarrow$ muncul diff di UI $\rightarrow$ resolve via tombol UI.
- [ ] Test manual 3: Eksekusi siklus soft-delete $\rightarrow$ purge via UI Trash Bin.
- [ ] Update status Tahap 1 di `docs/roadmap/INDEX-ROADMAP.md` setelah seluruh Exit Criteria terpenuhi.
