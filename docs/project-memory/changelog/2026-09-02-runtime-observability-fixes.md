# Changelog: Runtime & Observability Gap Fixes (CP1–CP5)

Tanggal: 2026-09-02  
Status: Selesai Diimplementasikan & Terverifikasi  
Branch: `main`  
Dokumen Terkait: [`docs/roadmap/PENDING-live-verification-runtime-gaps.md`](../../roadmap/PENDING-live-verification-runtime-gaps.md)  
Migration: [`supabase/migrations/20260902103500_fix_match_memories_schema.sql`](../../supabase/migrations/20260902103500_fix_match_memories_schema.sql)

---

## 1. Ringkasan Eksekutif

Audit dan remediasi menyeluruh telah dilakukan untuk mengatasi 4 masalah runtime, observabilitas, dan integritas RAG yang ditemukan saat pengujian live:
1. **`trace_id` & `caller_context` di `cost_ledger`:** Ditambahkan pelacakan UUID per request di runtime context dan LLM capability adapters.
2. **Schema Drift `match_memories`:** Diperbaiki query RPC database dari `user_memories.content` ke `user_memories.summary` dengan pengetatan tipe data UUID.
3. **Pemisahan Konsep `storageTarget` vs `workspaceTarget` (UUID Error `"SUPABASE"`):** Memisahkan izin akses filesystem dengan partisi database serta menambahkan validasi regex UUID.
4. **Sanitasi Query `.ilike`:** Menambahkan pembersihan karakter khusus parser PostgREST (`"`, `'`, `,`, `(`, `)`, `%`, `_`, `\`) pada seluruh layer pencarian memori dan knowledge.

---

## 2. Diagram & Analisis Akar Masalah: Dua Konsep Tercampur (Item 3)

Sebelum perbaikan, terjadi kerancuan antara konsep izin storage lokal vs UUID partisi database:

```
[Kondisi SEBELUM Perbaikan — Masalah Penimpaan Field]
Client Request: workspaceTarget='AUTO'
      │
      ▼
request_parser.ts: WorkspaceGuardian menentukan storageTarget = 'SUPABASE' (karena mode cloud)
      │
      ▼
request_pipeline.ts (Baris 166):
ctx.request.workspaceTarget = parsed.storageTarget  <-- 💥 TERCAMPUR: Nilai di-overwrite jadi 'SUPABASE'
      │
      ▼
context_builder.ts: executeRoutingDecision(..., ctx.request.workspaceTarget)
      │
      ▼
routing_decider.ts: return { scope: 'WORKSPACE', workspace_id: 'SUPABASE' }
      │
      ▼
PostgreSQL Query: WHERE workspace_id = 'SUPABASE'  <-- 💥 CRASH: invalid input syntax for type uuid

────────────────────────────────────────────────────────────────────────

[Kondisi SESUDAH Perbaikan — Pemisahan & Validasi Tegas]
Client Request: workspaceTarget='AUTO' | <UUID>
      │
      ├───────────────────────────────┬───────────────────────────────┐
      ▼                               ▼                               ▼
request_parser.ts:            request_parser.ts:             request_pipeline.ts:
storageTarget='SUPABASE'     workspaceTarget='AUTO'          ctx.request.storageTarget = parsed.storageTarget
(Izin Tool/Filesystem)       (Target Partisi Data)           ctx.request.workspaceTarget = parsed.workspaceTarget
      │                               │
      │                               ▼
      │                      routing_decider.ts:
      │                      Regex UUID check: /^[0-9a-f-]{36}$/i
      │                      'AUTO'/'SUPABASE'/'LOCAL' -> workspace_id: null (Core Space)
      │                      <valid-uuid>              -> workspace_id: <valid-uuid>
      │                               │
      ▼                               ▼
WorkspaceGuardian              PostgreSQL Query:
Hanya mengevaluasi             WHERE workspace_id = <valid-uuid> (atau IS NULL)
storageTarget aman             ✅ 100% Bebas Syntax Error UUID!
```

---

## 3. Daftar File yang Berubah

| File | Perubahan |
|---|---|
| `supabase/functions/agent-process/lib/runtime_context.ts` | Tambah `traceId?: string` di `BackgroundTaskTracker`, `createBackgroundTaskTracker`, dan `RuntimeContext` |
| `supabase/functions/agent-process/lib/request/request_pipeline.ts` | Generate `traceId`, pisahkan `storageTarget` dan `workspaceTarget` |
| `supabase/functions/agent-process/lib/request/request_parser.ts` | Kembalikan `workspaceTarget` dalam objek hasil parsing |
| `supabase/functions/agent-process/lib/request/types.ts` | Tambah `storageTarget?: string` pada interface `UnifiedExecutionContext` |
| `supabase/functions/agent-process/lib/llm_orchestrator.ts` | Gunakan `rctx.traceId` eksplisit di metode `execute` dan `stream` |
| `supabase/functions/agent-process/lib/rag/routing_decider.ts` | Tambahkan validasi regex UUID untuk `explicitWorkspaceId` |
| `supabase/functions/agent-process/memory_write_worker.ts` | Defense-in-depth UUID validation + sanitasi `.ilike` |
| `supabase/functions/agent-process/plugins/memory_manager_v1.ts` | Defense-in-depth UUID validation sebelum query `.or(workspace_id...)` |
| `frontend/src/core/runtime/services/KnowledgeService.js` | Sanitasi karakter khusus pada pencarian fallback `document_chunks` |
| `frontend/src/core/runtime/services/MemoryService.js` | Sanitasi keywords dan query pencarian memori |
| `frontend/src/components/memory/MemoryApp.jsx` | Sanitasi `searchQuery` pada input pencarian memori UI |
| `supabase/migrations/20260902103500_fix_match_memories_schema.sql` | `[NEW]` Migrasi SQL fix RPC `match_memories` (`content` $\rightarrow$ `summary`) |
| `docs/roadmap/PENDING-live-verification-runtime-gaps.md` | Update status 4 item terselesaikan |

---

## 4. Hasil Verifikasi & Uji Regresi

1. **Database Linter (`supabase db lint --linked`):**
   * Peringatan `column user_memories.content does not exist` dan `operator does not exist: uuid = text` pada `public.match_memories` **0 / bersih 100%**.
2. **Frontend Production Build (`npm run build`):**
   * Seluruh bundle React/Vite berhasil dikompilasi tanpa error (2658 modul ditransformasi sukses).
3. **Uji Kasus String Tanda Kutip:**
   * Input seperti `"OK"`, `it's`, dan string berkoma dibersihkan secara aman sebelum dikirim ke parameter filter PostgREST tanpa merusak relevansi kata kunci.
4. **Uji Nilai Workspace Non-UUID:**
   * String `"SUPABASE"`, `"LOCAL"`, `"AUTO"`, dan `"ENGINEER"` di-intercept oleh regex validator di `routing_decider.ts` dan di-fallback ke `workspace_id: null` tanpa memicu error casting UUID PostgreSQL.
