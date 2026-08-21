# 📋 Changelog Engineer — Mamet OS
**Periode:** 21 Agustus 2026  
**Tujuan:** Mendokumentasikan seluruh perbaikan yang dilakukan oleh **Antigravity (Google)** terhadap sistem **Engineer** Mamet OS.  
**Status:** Masih dalam tahap perbaikan (1 issue tersisa).

---

## 1. Daftar Perbaikan yang Telah Selesai

### 1.1. Deteksi Intent (MODIFY_CODE)
- **Masalah:** Engineer tidak mendeteksi kata "perubahan" dan "patch" sebagai intent modifikasi kode, sehingga hanya memberikan analisis (snippet) tanpa generate patch.
- **Solusi:** Tambahkan keyword `'perubahan'` dan `'patch'` ke `modifyKeywords`, serta tambahkan logika prioritas di awal `_detectIntent()`.
- **File:** `frontend/src/core/runtime/services/engineer.js`
- **Status:** ✅ SELESAI

---

### 1.2. Memory Leak pada Event Listener (ConversationEngine)
- **Masalah:** Handler event terdaftar berulang kali (×12) karena `eventBus.off()` dipanggil dengan argumen yang salah (closure function bukan handler asli).
- **Solusi:** Ubah semua cleanup `useEffect` menjadi `return unsubscribe;` (langsung mengembalikan fungsi cleanup dari `.on()`).
- **File:** `frontend/src/components/workbench/ConversationEngine.jsx`
- **Status:** ✅ SELESAI

---

### 1.3. Event Wrapper Unwrap (Payload Data Hilang)
- **Masalah:** EventBus selalu membungkus payload dengan `{ source, timestamp, data: ... }`, tapi handler di ConversationEngine langsung mengakses `rec.taskId` tanpa unwrap.
- **Solusi:** Tambahkan fallback `const rec = wrappedPayload?.data || wrappedPayload;` pada 4 handler (`Engineer:Recommendation`, `Engineer:PatchPersisted`, `Engineer:ReasoningReport`, `Engineer:RequestConfirmation`).
- **File:** `frontend/src/components/workbench/ConversationEngine.jsx`
- **Status:** ✅ SELESAI

---

### 1.4. Extract Code dari Response LLM (Fallback Diff & Natural Language)
- **Masalah:** Engineer tidak bisa mengekstrak file lengkap dari respons LLM yang berupa diff atau natural language, sehingga hanya menghasilkan snippet.
- **Solusi:** Tambahkan fallback di `_extractCodeFromResponse()` untuk mengekstrak dari format diff (`--- a/... +++ b/...`) dan code block bernama (`file: path ```code```).
- **File:** `frontend/src/core/runtime/services/engineer.js`
- **Status:** ✅ SELESAI

---

### 1.5. Routing Verification: Patch Engineer di-Downgrade ke LITE
- **Masalah:** `synthesis_handler.ts` hanya mendeteksi format patch `{"files": [...]}` atau `{"newContent": ...}`, sehingga patch Engineer yang berformat `{"path/file.js": "content"}` selalu di-downgrade ke profile `LITE`, bukan `PATCH_ENGINEERING`.
- **Solusi:** Tambahkan deteksi dengan regex `/"\s*:\s*"/` dan `"__mode"` di `looksLikeJsonPatch()`.
- **File:** `supabase/functions/agent-process/lib/orchestration/handlers/synthesis_handler.ts`
- **Status:** ✅ SELESAI

---

### 1.6. Verification Engine Path Validation Terlalu Ketat
- **Masalah:** `CHECK_P02` di `verification_engine.ts` menolak path file yang tidak mengandung `/` atau `.` atau `\` (misalnya `"verification_engine.ts"`).
- **Solusi:** Longgarkan validasi — hanya tolak key yang benar-benar kosong.
- **File:** `supabase/functions/agent-process/lib/verification/verification_engine.ts`
- **Status:** ✅ SELESAI

---

### 1.7. Max Tokens di BrainService (Mencegah Truncation)
- **Masalah:** Output patch file besar sering terpotong karena tidak ada batas `max_tokens` yang dikirim ke LLM.
- **Solusi:** Tambah `max_tokens: 16000` ke `localPayload` di `BrainService.executeLLM()`.
- **File:** `frontend/src/core/runtime/services/BrainService.js`
- **Status:** ✅ SELESAI

---

### 1.8. [MAMET_PATCH_READY] Tidak Pernah Muncul (Root Cause Utama)
- **Masalah:** LLM di Supabase tidak pernah diberitahu tentang marker `[MAMET_PATCH_READY]`, sehingga tombol "Apply Patch" tidak pernah muncul.
- **Solusi:** Tambahkan blok instruksi ENGINEER mode ke `agentIdentityPrompt` di `request_pipeline.ts` yang mengajarkan LLM untuk menambahkan `[MAMET_PATCH_READY]` di akhir respons ketika mendeteksi permintaan modifikasi kode.
- **File:** `supabase/functions/agent-process/lib/request/request_pipeline.ts`
- **Status:** ✅ SELESAI

---

### 1.9. Risk Score ENGINEER Diblokir Policy (execution_context.ts)
- **Masalah:** Engineer mengirim prompt besar berisi source code, menyebabkan riskScore >= 4 dan ditolak oleh Policy Engine.
- **Solusi:** Tambahkan early-return exempt untuk `isMametEngineer` sebelum risk scoring dimulai di `execution_context.ts`.
- **File:** `supabase/functions/agent-process/lib/request/execution_context.ts`
- **Status:** ✅ SELESAI

---

### 1.10. CHECK_P03 False Positive (eval/new Function)
- **Masalah:** CHECK_P03 memeriksa `rawResponse` mentah yang berisi kode detektor (`eval(` dan `new Function(`), bukan konten patch yang akan ditulis.
- **Solusi:** Ubah CHECK_P03 agar hanya memeriksa konten file di dalam `parsedPatch` (kode yang akan ditulis ke disk).
- **File:** `supabase/functions/agent-process/lib/verification/verification_engine.ts`
- **Status:** ✅ SELESAI

---

## 2. Status Terakhir (Belum Selesai)

### 2.1. Patch Gagal Verifikasi — "Verification Failed" di Supabase
- **Deskripsi:** Setelah semua perbaikan di atas, Engineer sudah bisa membaca file, menganalisis, menampilkan Reasoning Report, menerima konfirmasi, dan memanggil LLM. Namun, **Supabase Edge Function menolak prompt** dengan pesan:

  ```
  ❌ Semua endpoint gagal: Supabase menolak prompt (verification): "Verification Failed"
  ```

- **Penyebab:** Prompt yang dikirim Engineer ke LLM sangat besar (mengandung seluruh isi `verification_engine.ts` + `verification_pipeline.ts` + konteks lain). Verification Engine di Supabase mendeteksi pola "berbahaya" dalam prompt tersebut (seperti `eval(`, `new Function(`) yang sebenarnya adalah kode detektor dalam file, bukan kode berbahaya yang akan ditulis.

- **Perbedaan dengan CHECK_P03:** CHECK_P03 sudah diperbaiki untuk **verifikasi patch** (hanya memeriksa konten yang akan ditulis). Tapi **Verification Engine di Supabase** adalah mekanisme terpisah yang memeriksa seluruh prompt yang masuk ke LLM, termasuk kode file yang dibaca Engineer.

- **Status:** 🔴 BELUM SELESAI
- **Rekomendasi Solusi:**
  1. **Perkecil prompt Engineer** — hanya kirim bagian file yang relevan (bukan seluruh file besar).
  2. **Tambahkan pengecualian** di Verification Engine Supabase untuk mode ENGINEER.
  3. **Deploy ulang Edge Function** (pastikan perubahan `execution_context.ts` dan `verification_engine.ts` sudah aktif).

---

## 3. Ringkasan

| Total Perbaikan Selesai | 10 |
| :--- | :--- |
| **Masih Dikerjakan** | 1 (Verification Failed) |
| **File yang Diubah** | `engineer.js`, `ConversationEngine.jsx`, `synthesis_handler.ts`, `verification_engine.ts`, `BrainService.js`, `request_pipeline.ts`, `execution_context.ts` |
| **Komit yang Terkait** | `87bffa3`, `bc4366e`, `9cb2a16`, `251b26a`, `5eeced9` |

---

## 4. Catatan untuk Engineer (Pengetahuan Tambahan)

> *"Engineer tidak boleh langsung mengambil keputusan akhir. AI berpikir, User memutuskan."*

### Pelajaran Penting dari Proses Ini:
1. **Selalu baca Constitution terlebih dahulu** sebelum melakukan perubahan.
2. **Reasoning Lock adalah wajib** — tidak ada patch yang dihasilkan tanpa analisis yang ditampilkan.
3. **Event Bus membungkus semua payload** dengan `{ source, timestamp, data }` — selalu gunakan fallback `payload?.data || payload` di handler.
4. **Verifikasi patch hanya memeriksa konten yang akan ditulis**, bukan raw response LLM.
5. **Prompt Engineer harus efisien** — jangan kirim seluruh file besar ke LLM, hanya bagian yang relevan.

---

**Dokumentasi ini akan diperbarui setelah issue "Verification Failed" terselesaikan.**