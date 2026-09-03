# Changelog: CHECK_002 / CHECK_003 Source Trace & Verification Profile Alignment

**Tanggal:** 2026-09-03  
**Tipe:** Bug Fix & Architecture Alignment  
**Scope:** `supabase/functions/agent-process/` (Verification Engine, Synthesis Handler, Context Builder, Post Processing)  
**Author:** Antigravity (AI Partner)  
**Status:** ✅ Selesai & Tervalidasi Live (100% 5-Scenario Matrix Pass)

---

## 1. Konteks & Latar Belakang
Pada pengujian runtime live MAEF Monitor di mode `ASSISTANT`, sistem mencatat peringatan verifikasi gagal (`CHECK_002_SOURCE_TRACE_EXISTS` FAIL / Score: 0) meskipun response chat valid dan pipeline RAG berhasil memuat evidence dari database.

---

## 2. Akar Masalah (Root Cause)
1. **Mode Context Loss:** Objek `vContext` yang dikirim dari `synthesis_handler.ts` dan `post_processing.ts` tidak menyertakan properti `mode: requestMode`. Akibatnya `VerificationEngine` membaca `mode: undefined` dan mengevaluasi chat natural sebagai strict engineer verification.
2. **Asimetri Prompt vs Check:** Mode `ASSISTANT` secara desain memang tidak menginjeksi instruksi blok `SOURCE TRACE` ke prompt model LLM (`requireSourceTrace = false`), namun `CHECK_002` dan `CHECK_003` di `verifyEngineering` menuntut keberadaan trace regex `/[A-Z]{2,3}-\d{4}/`.
3. **ID Evidence RAG Tidak Seragam:** Potongan dokumen RAG belum memiliki ID baku regex `[DOC-0001]` di System Prompt maupun di backend trace metadata.
4. **CHECK_003 Coupled Logic Gap:** Saat `CHECK_002` diloloskan pada mode chat natural, `CHECK_003` memicu false fail karena `context.sourceTrace` bernilai `undefined`. Selain itu, saat `CHECK_002` berstatus `FAIL`, `CHECK_003` mengembalikan status default `PASS` yang menyesatkan (*fall-through*).

---

## 3. Rincian Perubahan Kode

1. **`supabase/functions/agent-process/lib/verification/verification_engine.ts`**:
   - `CHECK_002_SOURCE_TRACE_EXISTS`: Di-skip secara aman (`status: PASS`, `severity: INFO`) jika `context.mode === 'ASSISTANT' || context.mode === 'LITE'`.
   - `CHECK_003_SOURCE_TRACE_FORMAT`: Di-skip secara aman (`status: PASS`, `severity: INFO`) pada mode `ASSISTANT`/`LITE`. Ditambahkan penanganan eksplisit `else if (check002.status === "FAIL")` yang menandai status `WARN` (severity: `INFO`) bahwa format check dilewati karena ketiadaan input trace.
   - `VerificationEngine.verify()`: Menggunakan dynamic signature adapter yang secara otomatis menyinkronkan `ctx.mode = mode`.
2. **`supabase/functions/agent-process/lib/orchestration/handlers/synthesis_handler.ts` & `post_processing.ts`**:
   - Meneruskan `mode: requestMode` pada pembuatan objek `vContext`.
3. **`supabase/functions/agent-process/lib/orchestration/handlers/context_builder.ts` & `confidence_engine.ts`**:
   - Menstandarkan penomoran `docId: 'DOC-XXXX'` satu kali (*single point of truth*) saat pembentukan `ctx.state.ragArray`.

---

## 4. Hasil Validasi (5-Scenario Matrix)
* **Skenario 1 (ASSISTANT Mode):** `PASS` (Score: 100) — `CHECK_002` & `CHECK_003` berstatus `PASS (INFO)`.
* **Skenario 2A (ENGINEER Strict Mode - Missing Trace):** `FAIL` (Score: 0) — `CHECK_002` berstatus `FAIL (CRITICAL)`, `CHECK_003` berstatus `WARN (INFO)`.
* **Skenario 2A-Toggle (ENGINEER Non-Strict):** `PASS` (Score: 100) — `CHECK_002` berstatus `WARN (WARNING)`, `CHECK_003` berstatus `WARN (WARNING)`.
* **Skenario 2B (ENGINEER Success dengan [DOC-0001]):** `PASS` (Score: 100) — `CHECK_002` berstatus `PASS (CRITICAL)`, `CHECK_003` berstatus `PASS (ERROR)`.
* **Skenario 5 (Safety Pipeline Anomaly):** `FAIL` (Score: 0) — `CHECK_002` berstatus `FAIL (CRITICAL)`, `CHECK_003` berstatus `WARN (INFO)`.

---

## 5. Temuan Follow-Up Terpisah
1. **`CHECK_P02_VALID_JSON_PATCH_FORMAT` Mismatch:** Model LLM membungkus JSON patch dengan wrapper key (`"patch": { ... }`) yang menyebabkan `CHECK_P02` melempar *"File content for 'patch' must be a string, got object"*. Telah dibuat *Implementation Plan* terpisah untuk defensive unwrap layer dan penegasan skema prompt.
2. **`ModuleDiscoveryService.js` Electron Security Popup:** Pemanggilan `runTerminalCommand` saat boot akan direfactor ke silent filesystem API `electronAPI.listFiles/readFile`.
