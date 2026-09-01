# [PENDING] Temuan Gap Runtime & Observability — Hasil Verifikasi Live 31 Agustus 2026

**Status:** Belum dikerjakan (Backlog Temuan Terbuka)  
**Sumber:** Observasi log runtime & hasil eksekusi saat verifikasi live Edge Function `agent-process` (31 Agustus 2026)  
**Karakteristik:** Temuan *pre-existing* di layer backend/RAG/memory yang baru terekspos ke permukaan setelah log observabilitas aktif.  

> [!NOTE]
> Dokumen ini bertujuan mendokumentasikan temuan teknis untuk antrian roadmap berikutnya. **Tidak ada perubahan kode langsung** yang dilakukan sebelum diprioritaskan oleh Owner.

---

## 1. `trace_id` & `caller_context` Bernilai `"unknown"` di `cost_ledger`

- **Gejala / Fakta:** Baris baru di tabel `cost_ledger` menyimpan `trace_id: "unknown"` dan `caller_context: "unknown_estimated"` (atau `"unknown"`).
- **Akar Masalah (Dikonfirmasi via Code Trace):**
  - Pada [`supabase/functions/agent-process/lib/llm_orchestrator.ts`](file:///C:/Users/HP/.gemini/antigravity/worktrees/mamet%20os%20ecosystem/review_assistant_capability_roadmap/supabase/functions/agent-process/lib/llm_orchestrator.ts#L91) baris 91 (jalur `execute`) dan baris 236 (jalur `stream`), adapter dipanggil dengan:
    ```typescript
    { trace_id: (rctx?.tasks as any)?.traceId || 'unknown' }
    ```
  - Interface `BackgroundTaskTracker` pada `runtime_context.ts` tidak memiliki properti `traceId`, sehingga ekspresi `(rctx?.tasks as any)?.traceId` selalu menghasilkan `undefined` dan otomatis jatuh ke fallback `"unknown"`.
- **Dampak:** Kemampuan audit trail untuk menautkan satu pengeluaran biaya token ke task/event/chat ID spesifik menjadi terhambat.
- **Rencana Remediasi:** 
  1. Generate UUID `trace_id` resmi saat request pertama kali masuk di `request_pipeline.ts` atau `execution_context.ts`.
  2. Simpan `traceId` di dalam `RuntimeContext` (misalnya `rctx.traceId`) dan teruskan ke `AdapterContext` di `llm_orchestrator.ts`.

---

## 2. `CHECK_002_SOURCE_TRACE_EXISTS` Gagal Saat RAG Memiliki Evidence

- **Gejala / Fakta:** Verifikasi di backend mengeluarkan peringatan `CHECK_002` gagal karena response LLM tidak menyertakan blok *SOURCE TRACE* yang dapat di-parse oleh regex, meskipun context pipeline berhasil mengambil memory/evidence dari database.
- **Akar Masalah:** Kepatuhan instruksi prompt (*Instruction Compliance*). Format blok output yang diharapkan oleh verification engine regex belum cukup ditekankan atau terdistraksi dalam sistem prompt LLM untuk model-model tertentu.
- **Dampak:** Skor confidence verifikasi turun atau menghasilkan peringatan log verifikasi palsu (*false alert*).
- **Rencana Remediasi:**
  1. Perjelas dan sederhanakan instruksi formatting *SOURCE TRACE* pada system prompt.
  2. Buat parser regex di `source_trace_parser.ts` lebih toleran (*resilient*) terhadap variasi whitespace/markdown syntax LLM.

---

## 3. RAG Vector Search Error: `column user_memories.content does not exist`

- **Gejala / Fakta:** Log Edge Function mencatat error query Postgres saat pencarian vector:  
  `error: column user_memories.content does not exist`
- **Akar Masalah:** Terjadi *schema drift* antara query di Edge Function (`document_search.ts` / `embedding.ts`) dengan definisi skema aktual tabel `user_memories` di Supabase (misalnya kolom aktual bernama `memory_text`, `fact_content`, atau `context`).
- **Dampak:** RAG vector search gagal melakukan fallback atau silent error saat mencocokkan dokumen ke tabel `user_memories`.
- **Rencana Remediasi:**
  1. Periksa skema tabel `user_memories` live melalui `information_schema.columns`.
  2. Sesuaikan nama kolom pada query RPC / Supabase Client di backend.

---

## 4. RAG Keyword Search Error: Karakter Kutip Tidak Di-escape pada `ilike`

- **Gejala / Fakta:** Query pencarian kata kunci (*keyword search*) mengalami error parsing saat input user mengandung karakter tanda kutip (contoh: `"OK"` atau string bersimbol).
- **Akar Masalah:** String input user dimasukkan langsung ke filter `.ilike('column', ...)` tanpa melalui fungsi sanitasi / escaping karakter khusus SQL/PostgREST.
- **Dampak:** Request pencarian teks dengan kata berpetik menghasilkan 400 Bad Request atau query failure di sisi database.
- **Rencana Remediasi:**
  1. Tambahkan utility sanitizer untuk membersihkan/meng-escape tanda kutip sebelum menyusun filter `ilike`.

---

## 5. Memory Retrieval Error: `invalid input syntax for type uuid: "SUPABASE"`

- **Gejala / Fakta:** Log backend mencatat:  
  `invalid input syntax for type uuid: "SUPABASE"`
- **Akar Masalah:** Ada bagian kode pada memory retrieval / context builder yang mem-passing string literal `"SUPABASE"` (kemungkinan intended sebagai tipe provider/source) ke dalam field atau parameter filter yang bertipe data `UUID` (misalnya `workspace_id` atau `user_id`).
- **Dampak:** Error log pada layer memory query saat request diproses.
- **Rencana Remediasi:**
  1. Lakukan audit pemanggilan query Supabase di modul `memory_subscriber.ts`, `project_memory.ts`, dan `context_builder.ts`.
  2. Pisahkan field identitas `UUID` dari parameter tag string provider.

---

## Ringkasan Prioritas Rekomendasi

| No | Temuan | Estimasi Kompleksitas | Dampak Fungsional |
|---|---|---|---|
| 1 | `trace_id` = `"unknown"` di `cost_ledger` | Rendah | Observabilitas & Audit |
| 2 | `CHECK_002` Source Trace Format | Sedang | Verifikasi & Kualitas Output |
| 3 | Skema Kolom `user_memories.content` | Rendah | RAG Vector Search |
| 4 | Escape Tanda Kutip pada `ilike` | Rendah | Kestabilan Keyword Search |
| 5 | Tipe UUID `"SUPABASE"` | Rendah | Kestabilan Memory Query |
