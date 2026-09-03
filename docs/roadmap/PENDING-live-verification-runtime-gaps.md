# [100% SELESAI] Temuan Gap Runtime & Observability — Hasil Verifikasi Live

**Status:** 5 dari 5 Item Berhasil Diremediasi (✅ 100% Selesai — 2026-09-02)  
**Sumber:** Observasi log runtime & hasil eksekusi saat verifikasi live Edge Function `agent-process`  
**Karakteristik:** Temuan *pre-existing* di layer backend/RAG/memory yang telah diperbaiki bertahap.

---

## 1. `trace_id` & `caller_context` Bernilai `"unknown"` di `cost_ledger` (✅ SELESAI — 2026-09-02)

- **Gejala / Fakta:** Baris baru di tabel `cost_ledger` menyimpan `trace_id: "unknown"` dan `caller_context: "unknown_estimated"`.
- **Akar Masalah:** Interface `BackgroundTaskTracker` & `RuntimeContext` tidak memiliki `traceId`. Pemanggilan adapter di `llm_orchestrator.ts` menggunakan fallback yang selalu `undefined`.
- **Remediasi yang Diterapkan:**
  1. Menambahkan `traceId: string` ke `BackgroundTaskTracker` dan `RuntimeContext` di `supabase/functions/agent-process/lib/runtime_context.ts`.
  2. Meneruskan `traceId = crypto.randomUUID()` dari `request_pipeline.ts` saat instansiasi `rctx`.
  3. Memperbarui `llm_orchestrator.ts` (jalur `execute` dan `stream`) untuk menggunakan `rctx.traceId`.

---

## 2. `CHECK_002_SOURCE_TRACE_EXISTS` & `CHECK_003` False Fail di Assistant Mode / RAG Format (✅ SELESAI — 2026-09-02)

- **Gejala / Fakta:** Verifikasi di backend mengeluarkan peringatan `CHECK_002` gagal (Score: 0) pada mode ASSISTANT meskipun context pipeline berhasil mengambil memory/evidence dari database.
- **Akar Masalah:**
  1. Metadata `vContext.mode` tidak diteruskan dari `synthesis_handler.ts`, sehingga `VerificationEngine` membaca `mode: undefined` dan mengeksekusi strict engineer check pada chat natural.
  2. ID Dokumen RAG belum distandarisasi sebagai *Single Source of Truth* (`[DOC-0001]`), menyebabkan parser regex `/[A-Z]{2,3}-\d{4}/` gagal mencocokkan trace di mode Engineer.
- **Remediasi yang Diterapkan:**
  1. Meneruskan `mode: requestMode` pada `vContext` di `synthesis_handler.ts` dan `post_processing.ts`.
  2. Menyelaraskan `CHECK_002` dan `CHECK_003` di `verification_engine.ts` agar di-skip secara wajar (`PASS` / `INFO`) pada mode `ASSISTANT` dan `LITE` (sesuai kontrak bahwa chat natural tidak mewajibkan format source trace).
  3. Menstandarkan pembentukan ID `[DOC-XXXX]` 1x saja di `context_builder.ts:146` dan meneruskannya ke System Prompt dan `confidence_engine.ts`.
  4. Lolos 100% pada matriks uji 5-skenario (Assistant, Engineer Strict Fail, Engineer Non-Strict Toggle, Engineer Format Success, Pipeline Anomaly).

---

## 3. RAG Vector Search Error: `column user_memories.content does not exist` (✅ SELESAI — 2026-09-02)

- **Gejala / Fakta:** Log Edge Function mencatat error query Postgres saat pencarian vector:  
  `error: column user_memories.content does not exist`
- **Akar Masalah:** *Schema drift* pada fungsi RPC `public.match_memories` di PostgreSQL yang masih merujuk nama kolom lama `content` alih-alih `summary`.
- **Remediasi yang Diterapkan:**
  1. Membuat dan menerapkan migrasi `supabase/migrations/20260902103500_fix_match_memories_schema.sql`.
  2. Mengganti `user_memories.content` menjadi `user_memories.summary` dan memperbaiki tipe data casting `target_user_id` menjadi `UUID`.
  3. Terverifikasi 100% bersih via `supabase db lint --linked`.

---

## 4. RAG Keyword Search Error: Karakter Kutip Tidak Di-escape pada `ilike` (✅ SELESAI — 2026-09-02)

- **Gejala / Fakta:** Query pencarian kata kunci (*keyword search*) mengalami error parsing (400 Bad Request) saat input user mengandung karakter tanda kutip (contoh: `"OK"`, `it's`, atau teks dengan koma).
- **Akar Masalah:** String input user digabung langsung ke filter PostgREST tanpa sanitasi karakter khusus parser (`"`, `'`, `,`, `(`, `)`, `%`, `_`, `\`).
- **Remediasi yang Diterapkan:**
  1. Menambahkan sanitasi karakter khusus pada `frontend/src/core/runtime/services/KnowledgeService.js:115`.
  2. Menambahkan sanitasi keywords dan fallback query pada `frontend/src/core/runtime/services/MemoryService.js:66, 84`.
  3. Menambahkan sanitasi pada `frontend/src/components/memory/MemoryApp.jsx:24`.
  4. Menambahkan sanitasi pada `supabase/functions/agent-process/memory_write_worker.ts:90`.

---

## 5. Memory Retrieval Error: `invalid input syntax for type uuid: "SUPABASE"` (✅ SELESAI — 2026-09-02)

- **Gejala / Fakta:** Log backend mencatat:  
  `invalid input syntax for type uuid: "SUPABASE"`
- **Akar Masalah:** Tercampurnya dua konsep arsitektur yang berbeda:
  - **Konsep A: `storageTarget`** (`'SUPABASE' | 'LOCAL'`) untuk izin akses file/tool.
  - **Konsep B: `workspaceTarget`** (`UUID | 'AUTO' | null`) untuk partisi data database.
  - Pada `request_pipeline.ts:166`, `ctx.request.workspaceTarget` ditimpa dengan `parsed.storageTarget` (`"SUPABASE"`), lalu masuk ke `routing_decider.ts` dan diteruskan ke filter query database `.eq('workspace_id', 'SUPABASE')` yang bertipe UUID.
- **Remediasi yang Diterapkan:**
  1. Memisahkan field `ctx.request.storageTarget` dan `ctx.request.workspaceTarget` di `request_pipeline.ts` dan `request_parser.ts`.
  2. Menambahkan validasi regex UUID eksplisit di `routing_decider.ts` sehingga string target non-UUID (`'SUPABASE'`, `'LOCAL'`, `'AUTO'`, `'ENGINEER'`) otomatis di-fallback ke `workspace_id: null` (Global Core).
  3. Menambahkan defense-in-depth UUID validation di `memory_write_worker.ts` dan `memory_manager_v1.ts`.

---

## Ringkasan Status

| No | Temuan | Status | Tanggal Selesai |
|---|---|---|---|
| 1 | `trace_id` = `"unknown"` di `cost_ledger` | ✅ **Selesai** | 2026-09-02 |
| 2 | `CHECK_002` & `CHECK_003` Source Trace | ✅ **Selesai** | 2026-09-02 |
| 3 | Skema Kolom `user_memories.content` | ✅ **Selesai** | 2026-09-02 |
| 4 | Escape Tanda Kutip pada `ilike` | ✅ **Selesai** | 2026-09-02 |
| 5 | Tipe UUID `"SUPABASE"` | ✅ **Selesai** | 2026-09-02 |
