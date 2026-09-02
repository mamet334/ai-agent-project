# CHANGELOG — Integrasi MemoryGovernorService ke AssistantService & Observabilitas Konflik

**Tanggal:** 2026-09-02  
**Kategori:** Foundation / Memory Governance / Observability  
**Tipe:** Feature & Enhancement  
**Status:** ✅ Selesai & Terverifikasi (`npm run build` pass 2658 modul)

---

## 1. Latar Belakang & Masalah Arsitektur

Sebelum perubahan ini:
1. `AssistantService.handleMemoryTrigger()` melakukan pemanggilan `memoryService.storeMemory()` tanpa metadata, yang mengeksekusi *unmanaged insert* mentah ke tabel `user_memories` (melewati penyimpanan data mentah ke `raw_memory_content`).
2. Method `MemoryGovernorService.storeGoldenMemory()` belum menyertakan kolom behavioral contract Addendum Fase 1 (`category`, `access_tier`, `status`, `version_sequence`) saat insert.
3. Fungsi verifikasi otomatis ringkasan (`verifyMemorySummary()`) baru terpasang di mode Engineer (`_finalizeSession`), belum memiliki padanan di mode Assistant.
4. UI belum memiliki indikator terpusat di `HomeDashboard` untuk mendeteksi adanya memori berstatus `CONFLICT_PENDING_REVIEW`.

---

## 2. Rincian Perubahan Kode

### A. Penyempurnaan Behavioral Contract MemoryGovernorService.js
* File: `frontend/src/core/runtime/services/MemoryGovernorService.js`
* Parameter `storeGoldenMemory` kini menerima dan menerapkan:
  * `category` (default: 'general')
  * `access_tier` (auto-detect pola kata kunci kredensial/token/secret jika tidak dikirim eksplisit, fallback 'generic')
  * `status` (default: 'active')
  * `version_sequence` (default: 1)
* Menambahkan method `verifyAssistantSession({ userId, chatId })` yang mengiterasi memori sesi Assistant dan memverifikasi integritas hash raw content via `verifyMemorySummary()`.

### B. Integrasi AssistantService.js
* File: `frontend/src/core/runtime/services/AssistantService.js`
* `handleMemoryTrigger(userMsg, context)`:
  * Menginferensi kategori konten ('preference', 'engineering', atau 'general').
  * Memanggil `governor.detectAndMarkConflict()` sebelum penyimpanan agar memori bertentangan otomatis ditandai `CONFLICT_PENDING_REVIEW`.
  * Menyimpan ke `governor.storeGoldenMemory()` dengan metadata `source_type: 'assistant_chat'`, `source_reference: 'assistant_chat_trigger'`, `chat_id`, `version_code`.
* `saveChatToDB()` & `finalizeAssistantSession()`:
  * Memanggil `finalizeAssistantSession({ userId, chatId })` di akhir penyimpanan chat database untuk memastikan sinkronisasi ringkasan vs golden source.

### C. Delegasi Metadata di MemoryService.js
* File: `frontend/src/core/runtime/services/MemoryService.js`
* `storeMemory()` kini meneruskan parameter `category`, `access_tier`, `status`, `version_sequence`, dan flag `useGovernor` ke `MemoryGovernorService.storeGoldenMemory()`.

### D. Observabilitas Konflik di HomeDashboard
* Files: `frontend/src/hooks/useDashboardData.js`, `frontend/src/components/dashboard/ObservabilityPanel.jsx`
* Menambahkan query `status` pada tabel `user_memories` dan menghitung `memoryConflicts` (`CONFLICT_PENDING_REVIEW`).
* Menampilkan kartu metrik *Memory Conflicts* dengan badge indikator `ACTION REQUIRED` jika terdapat konflik yang belum di-resolve oleh user.

---

## 3. Hasil Verifikasi

1. **Frontend Build:** `npm run build` berhasil 100% (`✓ 2658 modules transformed`, `exit code 0`).
2. **Behavioral Contract:** Kolom `category`, `access_tier`, `status`, dan `version_sequence` terisi konsisten pada setiap operasi tulis memori via Assistant maupun Engineer.
3. **Pemisahan Scope Purge:** Rencana UI Purge (hard-delete permanen) ditahan untuk konfirmasi desain UX terpisah.
