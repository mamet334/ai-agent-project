# Implementation Plan: CHECK_P02 JSON Patch Schema Alignment & Defensive Unwrap

Perbaikan komprehensif untuk mengatasi kegagalan berulang pada `CHECK_P02_VALID_JSON_PATCH_FORMAT` (*"File content for 'patch' must be a string, got object"*).

**Status:** ✅ Selesai & Tervalidasi (Live Production Confirmed — 2026-09-03)  
**Tipe:** Hardening Layer & Prompt Contract Alignment  
**Target:** `supabase/functions/agent-process/lib/verification/verification_engine.ts` & `supabase/functions/agent-process/lib/request/request_pipeline.ts`

---

## 1. Latar Belakang & Gejala

Pada pengujian instruksi modifikasi kode di Engineer Workspace (`https://mamet-ecosystem.vercel.app`), model LLM menghasilkan blok kode JSON patch dengan struktur wrapper objek (`"patch": { ... }` atau `"files": [ ... ]`).  
Meskipun struktur kode valid, validator `CHECK_P02` mengalami fatal fail:
> `Invalid JSON patch: File content for "patch" must be a string, got object.`

---

## 2. Akar Masalah (Root Cause)

1. **Ekspektasi Flat Map di `CHECK_P02`:** Validator `verifyPatchEngineering` mengharapkan objek 1-tingkat `{ [filePath: string]: string }`.
2. **Ketiadaan Unwrap Layer di Parser:** `_extractJSONPatch` me-parse JSON apa adanya tanpa membongkar wrapper keys umum.
3. **Instruksi Prompt Belum Spesifik:** Prompt mode Engineer di `request_pipeline.ts` belum memberikan contoh eksplisit skema JSON flat.

---

## 3. Solusi yang Diterapkan

### A. Defensive Unwrap Layer di Verification Engine (`verification_engine.ts`)
Menambahkan method helper privat `_unwrapPatchObject()` dengan aturan:
1. **Whitelist Eksplisit Wrapper Keys:** Membongkar key `"patch"`, `"patches"`, dan `"files"`.
2. **Toleransi Alias Array of Objects:** Mendukung array `[{ file/path/filePath, content/code/newContent/source/text }]` dan mentransformasikannya ke format kamus flat.
3. **Penyelarasan Seluruh Stage Ekstraksi:** Seluruh kandidat hasil parse JSON pada `_extractJSONPatch` (Stage 1 s/d 5) otomatis melewati `_unwrapPatchObject()`.

### B. Standardisasi Prompt Engineer (`request_pipeline.ts`)
Memperbarui instruksi prompt mode Engineer dengan contoh skema JSON flat baku:
```json
{
  "frontend/src/utils/example.js": "export function example() { ... }"
}
```

---

## 4. Hasil Verifikasi & Unit Test

```text
=== RUNNING JSON PATCH UNWRAP & VERIFICATION TESTS ===

[Test 1] Flat JSON Patch:
  Decision: PASS | Score: 100 | CHECK_P02: PASS
  Message: "Valid JSON patch with 1 file(s) [extracted via DIRECT_PARSE_NORMALIZED]."

[Test 2] Wrapped 'patch' Object (Kasus Production):
  Decision: PASS | Score: 100 | CHECK_P02: PASS
  Message: "Valid JSON patch with 1 file(s) [extracted via MARKDOWN_JSON_BLOCK]."

[Test 3] Wrapped 'files' Array dengan Alias (filePath & code):
  Decision: PASS | Score: 100 | CHECK_P02: PASS
  Message: "Valid JSON patch with 1 file(s) [extracted via MARKDOWN_JSON_BLOCK]."

[Test 4] Direct Array [ { file, content } ]:
  Decision: PASS | Score: 100 | CHECK_P02: PASS
  Message: "Valid JSON patch with 1 file(s) [extracted via MARKDOWN_JSON_BLOCK]."

[Test 5] Dangerous Code Security Hard Gate (Pola eval):
  Decision: FAIL | Score: 0 | CHECK_P03: FAIL
  Message: "Dangerous patterns detected in patch content: eval()"
```
