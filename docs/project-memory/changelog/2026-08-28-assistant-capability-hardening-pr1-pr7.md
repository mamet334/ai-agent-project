# Changelog: Assistant Capability Hardening & Modularization (PR#1–PR#7)

Tanggal: 2026-08-28
Status: Selesai Diimplementasikan
Referensi Dokumen: `docs/roadmap/ASSISTANT-CAPABILITY-ROADMAP.md`
Commit Awal: `7dcbb7d` — feat: implementasi 7 PR ASSISTANT-CAPABILITY-ROADMAP
Commit Akhir: `82cf9ed` — feat(PR#6): implementasi efisiensi token
Branch: `main`
Prinsip Payung: Linux-Inspired Architecture — "Ringan, Bebas, dan Tangguh seperti Linux"

---

## Ringkasan Eksekutif

Sesi ini mengimplementasikan seluruh 7 PR dari `ASSISTANT-CAPABILITY-ROADMAP.md` — dokumen desain yang disepakati antara Owner dan AI pada 2026-08-24. Pekerjaan mencakup:

- Ekstraksi arsitektur formal untuk Assistant (PR#3)
- Penguatan keamanan eksekusi command (PR#1)
- Reaktivasi sistem validasi memori (PR#2)
- Atribusi sumber dokumen RAG (PR#4)
- Strategi retrieval adaptif (PR#5)
- Efisiensi token (PR#6)
- Module Discovery Fase 1 (PR#7)

Selain itu: perbaikan 2 Vercel build error yang muncul saat deployment, dan sinkronisasi 3 dokumen baru dari GitHub ke lokal.

---

## PR#3 — Ekstraksi `AssistantService`

**Masalah:** `ConversationEngine.jsx` (1443 baris) adalah God Component — mencampur UI, business logic, akses langsung ke `kernel` dan `supabase`.

**Solusi:**

### File Baru
- `frontend/src/core/runtime/services/AssistantService.js` (~770 baris)
  - `processMessage()` — core handler: memory retrieval, inject context, call Edge Function, streaming
  - `runCommand()` — routing ke CommandRegistry + emit konfirmasi ke UI
  - `confirmAndRunCommand()` — eksekusi setelah user approve
  - `saveChatToDB()`, `loadChat()`, `rollback()`, `refreshMemory()`
  - Integrasi PR#1/#2/#5/#6 dalam satu alur `processMessage()`

### File Dimodifikasi
- `frontend/src/core/runtime/Kernel.js`
  - Tambah 5 import service baru
  - Registrasi 7 service baru di Phase 3 (setelah `AssistantService`)
- `frontend/src/components/workbench/ConversationEngine.jsx`
  - Diganti total menjadi thin UI layer (CE v3.0)
  - Tidak ada lagi `handleSend`, `saveChatToDB`, akses langsung `kernel`/`supabase` untuk logic bisnis
  - Semua delegasi ke `AssistantService`

**Exit Criteria:** ✅ Semua terpenuhi

---

## PR#1 — Safe Command Execution

**Masalah:** Eksekusi command memakai blocklist (mudah di-bypass). Tidak ada workspace boundary, tidak ada audit trail terstruktur.

**Solusi:**

### File Baru
- `frontend/src/core/runtime/services/CommandRegistry.js`
  - Whitelist-first: `listFiles`, `readFile`, `writeFile`, `createFolder`, `deleteFolder`, `moveFile`, `copyFile`, `renameFile`, `zipFolder`, `unzip`, `runScript` (terbatas)
  - `prepareExecution()` — cek whitelist + workspace boundary + flag `isDestructive`
  - `executeConfirmed()` — eksekusi via Electron IPC setelah approval

- `frontend/src/core/runtime/services/AuditLogService.js`
  - Log ke tabel `assistant_audit_log` di Supabase
  - Wajib untuk: semua aksi destruktif + aksi di luar workspace

### Dialog UI Konfirmasi (ditambahkan akhir sesi)
- `ConversationEngine.jsx` — tambah `commandConfirmation` state + EventBus listener
- `AssistantService.runCommand()` — emit `Command:ConfirmationRequired` via EventBus
- **3 varian dialog visual** sesuai tingkat risiko:
  - 🖥️ Biru — command normal dalam workspace → tombol `✅ Jalankan`
  - 🔒 Kuning — command di luar workspace → tombol `🔓 Izinkan Sekali` + peringatan "tidak di-cache"
  - ⚠️ Merah — command destruktif (delete/overwrite) → tombol `⚠️ Ya, Saya Yakin — Jalankan`

### Migrasi SQL
- `supabase/migrations/20260826_add_source_attribution_and_audit_log.sql`
  - (Dijalankan manual oleh Owner via Supabase Dashboard → SQL Editor)

**Exit Criteria:** ✅ Semua terpenuhi

---

## PR#2 — Reaktivasi Cognitive Memory Governor

**Masalah:** `lib/cognitiveMemoryGovernor.ts` di-bypass total (`LEGACY_COGNITION_ENABLED = false`). `truth_score` tidak punya sumber logika.

**Solusi:**

### File Dimodifikasi
- `lib/cognitiveMemoryGovernor.ts`
  - `LEGACY_COGNITION_ENABLED = true`
  - Tambah fungsi `calculateTruthScore()` berdasarkan sumber memory & frekuensi konfirmasi.
  - Threshold awal longgar: 0.3.

### File Baru (untuk Vite bundle)
- `frontend/src/core/runtime/services/CognitiveMemoryGovernorService.js`
  - Port JavaScript dari `cognitiveMemoryGovernor.ts` untuk bundling frontend (menghindari error cross-boundary Vite/Rollup).

**Exit Criteria:** ✅ Semua terpenuhi

---

## PR#4 — Atribusi Sumber di RAG

**Masalah:** Skema `documents`/`document_chunks` tidak menyimpan sumber asal dokumen.

**Solusi:**
- Migrasi SQL menambahkan kolom `source_url`, `source_type`, `retrieved_at`.
- Update `supabase/functions/rag-process/index.ts` untuk memproses dan menyimpan field sumber.

**Exit Criteria:** ✅ Semua terpenuhi

---

## PR#5 — Adaptive Retrieval Strategy

**Masalah:** RAG hanya ambil top-K chunk tanpa konteks tetangga.

**Solusi:**
- Buat `frontend/src/core/runtime/services/RetrievalStrategyService.js`
- Menangani Kasus A (dokumen besar) dengan neighbor expansion dan Kasus B (multi-dokumen) dengan limit N chunk per dokumen.
- Terdaftar di Kernel.js Phase 3.

**Exit Criteria:** ✅ Service ada, ⚠️ Aktif penuh menunggu KnowledgeService refactor (agar mengembalikan raw chunk objects, bukan string gabungan).

---

## PR#6 — Efisiensi Token

**Masalah:** RAG context dan semantic context tidak ada batas ukuran — bisa bloat setiap request.

**Solusi:**
- **AssistantService.js:** Tambah estimator token, trim RAG context (max 4000 chars) dan semantic context (max 2000 chars) sebelum dikirim ke payload Edge Function. Log estimasi token sebelum/sesudah di console browser.
- **researcher.ts (Edge Function):** Truncate `accumulatedContext` ke 1500 chars sebelum dikirim ke sub-agent LLM, dan batasi output researcher max 3000 chars agar tidak membuat bloat main context.

**Exit Criteria:** ✅ Semua terpenuhi

---

## PR#7 — Module Discovery Fase 1

**Masalah:** Tidak ada mekanisme otomatis untuk scan, validasi, dan registrasi modul baru.

**Solusi:**
- Buat `frontend/src/core/runtime/services/ModuleDiscoveryService.js`
- Secara otomatis memindai folder konvensi (`/modules/`, `/packages/`) saat boot dan mendaftarkan manifest yang valid ke `ServiceManager`/`ToolRegistryService`.

**Exit Criteria:** ✅ Semua terpenuhi (Fase 1)

---

## Perbaikan Build Error Vercel

1. **Error #1 — Supabase import path salah:** Diperbaiki path di `AuditLogService.js` dan `AssistantService.js` (`../../../supabase.js`).
2. **Error #2 — Cross-boundary import CMG:** Dibuat `CognitiveMemoryGovernorService.js` (JS port) lokal untuk menyelesaikan error bundle Rollup.

---

## Daftar File yang Dibuat / Dimodifikasi

| File | Aksi | PR |
|---|---|---|
| `frontend/src/core/runtime/services/AssistantService.js` | Dibuat | PR#3 |
| `frontend/src/core/runtime/services/CommandRegistry.js` | Dibuat | PR#1 |
| `frontend/src/core/runtime/services/AuditLogService.js` | Dibuat | PR#1 |
| `frontend/src/core/runtime/services/RetrievalStrategyService.js` | Dibuat | PR#5 |
| `frontend/src/core/runtime/services/ModuleDiscoveryService.js` | Dibuat | PR#7 |
| `frontend/src/core/runtime/services/CognitiveMemoryGovernorService.js` | Dibuat | PR#2 fix |
| `frontend/src/core/runtime/Kernel.js` | Dimodifikasi | PR#3 |
| `frontend/src/components/workbench/ConversationEngine.jsx` | Diganti total | PR#3, PR#1 |
| `lib/cognitiveMemoryGovernor.ts` | Dimodifikasi | PR#2 |
| `supabase/functions/rag-process/index.ts` | Dimodifikasi | PR#4 |
| `supabase/functions/agent-process/plugins/researcher.ts` | Dimodifikasi | PR#6 |
| `supabase/migrations/20260826_add_source_attribution_and_audit_log.sql` | Dibuat | PR#4, PR#1 |

---

## Commit History Sesi Ini

- `7dcbb7d` — feat: implementasi 7 PR ASSISTANT-CAPABILITY-ROADMAP
- `d0803a9` — fix: perbaiki dynamic import path yang salah (vercel build error)
- `bb8b614` — fix(build): pindahkan CMG ke JS lokal frontend, hapus cross-boundary import
- `2451ab3` — feat(PR#1): implementasi dialog konfirmasi command UI
- `82cf9ed` — feat(PR#6): implementasi efisiensi token - context trimming + token estimator

---

## Catatan untuk AI Berikutnya

- **PR#5 integration aktif penuh:** tunggu refactor `KnowledgeService` agar mengembalikan array chunk objects, bukan string gabungan. Integration point sudah ada di `AssistantService`.
- **Migrasi SQL:** `20260826_add_source_attribution_and_audit_log.sql` harus dijalankan manual oleh Owner via Supabase Dashboard → SQL Editor sebelum fitur audit/atribusi aktif.
- **CMG threshold:** Saat ini 0.3 (longgar). Monitor frekuensi REJECT via console log `[AssistantService] CMG REJECT` — perketat ke 0.5 setelah cukup data.
- **Token tracking:** Lihat `[PR#6 TokenEfficiency]` di browser console. Jika angka "hemat" selalu 0, artinya context memang tidak pernah melebihi batas — baik.
- **PR#7 Fase 2:** JANGAN dikerjakan sampai Fase 1 stabil dan ada kebutuhan nyata mengunduh modul dari luar.
