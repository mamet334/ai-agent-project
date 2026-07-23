# 2026-07-23: Fix Verification Engine — Audit Forensik Double Source of Truth

**Type:** Bug Fix + Architecture Fix
**Severity:** Critical (ENGINEER mode selalu gagal)
**ADR:** ADR-0012
**Audit Reference:** `changelog/2026-07-23/SUMMARY.md`

---

## Problem

ENGINEER workspace secara konsisten mengembalikan `"Verification Failed"` pada setiap request.

Root cause: Arsitektur double source of truth + broken prompt-parser contract. Selengkapnya di `changelog/2026-07-23/SUMMARY.md`.

---

## Changes

### 1. `verification/universal_contract.ts`
- **Before:** `"WAJIB: Sertakan SOURCE TRACE di akhir jawaban — sebutkan evidence apa yang Anda gunakan."`
- **After:** Instruksi eksplisit dengan template format dan contoh ID yang bisa di-parse parser
- **Impact:** Memperbaiki broken contract antara instruksi prompt (natural language) dan ekspektasi parser (regex strict)

### 2. `verification/verification_engine.ts`
- **Before:** CHECK 002 hanya membaca `context.sourceTrace` (parser output, sering `undefined`), gagal jika undefined meskipun backend punya 12 evidence items
- **After:** CHECK 002 membedakan 3 jenis skenario:
  - Casual chat tanpa evidence → WARN (normal)
  - `FORMAT_COMPLIANCE_FAIL`: LLM tidak ikut format, backend punya data → FAIL (strict) / WARN (toggle off)
  - `EVIDENCE_MISSING_FAIL`: Pipeline issue → FAIL
- **New:** Feature toggle `ENGINEER_STRICT_MODE` (env var, default `true`)
- **New:** JSON structured logging `CHECK_002_FORMAT_COMPLIANCE_FAIL` untuk Supabase dashboard

### 3. `orchestration/handlers/synthesis_handler.ts`
- **New:** JSON diagnostic logging di single instrumentation point optimal (AUDIT-03):
  - `event: "SYNTHESIS_DIAG"`
  - Fields: `parser_trace_found`, `backend_trace_items`, `total_evidence`, `confidence_score`, dll.
- **Impact:** Mengisi 5 data gap runtime yang diidentifikasi AUDIT-02

### 4. `coordinator/trace_parser.ts`
- **Before:** Scan 15 baris terakhir
- **After:** Scan 30 baris terakhir
- **Impact:** Minor robustness improvement untuk jawaban panjang

---

## Deployment Protocol

```
STAGING → 5-10 request ENGINEER → cek SYNTHESIS_DIAG + CHECK_002_FORMAT_COMPLIANCE_FAIL
→ parser_trace_found ≥ 95% → PRODUCTION
```

---

## Rollback

Jika terjadi masalah di staging: set `ENGINEER_STRICT_MODE=false` (tanpa redeploy) untuk mengaktifkan warning-only mode sambil investigasi.
