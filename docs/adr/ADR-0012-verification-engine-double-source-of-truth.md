# ADR-0012: Perbaikan Double Source of Truth pada Verification Engine CHECK 002

**ID:** ADR-0012
**Judul:** Verification Engine CHECK 002 — Eliminasi Double Source of Truth & Feature Toggle ENGINEER_STRICT_MODE
**Status:** ACCEPTED
**Tanggal:** 2026-07-23
**Penulis:** Mamet Engineering — Audit Forensik 2026-07-23
**Audit Reference:** `changelog/2026-07-23/SUMMARY.md`, `AUDIT-01` s/d `AUDIT-05`
**Supersedes:** Bagian CHECK 002 dari ADR-0010 (tetap valid untuk bagian lainnya)
**Berlaku untuk:**
- `supabase/functions/agent-process/lib/verification/verification_engine.ts`
- `supabase/functions/agent-process/lib/verification/universal_contract.ts`
- `supabase/functions/agent-process/lib/orchestration/handlers/synthesis_handler.ts`
- `supabase/functions/agent-process/lib/coordinator/trace_parser.ts`

---

## 1. Konteks dan Latar Belakang

### 1.1 Gejala yang Diamati

ENGINEER workspace secara konsisten mengembalikan `"Verification Failed"` tanpa pesan diagnostik yang berguna. Mode LITE dan ASSISTANT berhasil normal.

### 1.2 Audit Forensik

Audit forensik READ-ONLY dilakukan pada 2026-07-23 menghasilkan 5 AUDIT files + 1 SUMMARY dengan confidence keseluruhan 95%.

**Root Cause Chain (100% confidence dari analisis statis):**

```
universal_contract.ts:232
    Instruksi prompt: "sebutkan evidence apa yang Anda gunakan" (natural language)
    ↓
LLM merespon dalam bahasa natural, tanpa format ID eksplisit
    ↓
trace_parser.ts: regex /[A-Z]{2,3}-\d{4}/ scan 15 baris terakhir
    → sourceTrace = undefined
    ↓
verification_engine.ts:102-107
    CHECK 002: context.sourceTrace = undefined, hasEvidence = true → FAIL
    ↓
synthesis_handler.ts:63
    Hard Gate: return { message: "Verification Failed" }
```

### 1.3 Masalah Arsitektural: Double Source of Truth

Pada `synthesis_handler.ts:40-43`, objek `vContext` memiliki dua source trace yang independent:

```typescript
const vContext = {
  sourceTrace: sourceTrace,           // Source #2: dari parser — SERING UNDEFINED
  confidenceReport,                   // Source #1: confidenceReport.sourceTrace — SELALU ADA
  ...
};
```

| Sumber | Lokasi | Jenis | Ketersediaan | Digunakan CHECK 002 |
|--------|--------|-------|--------------|---------------------|
| `confidenceReport.sourceTrace` | `confidence_engine.ts:127` | `SourceTraceItem[]` | ✅ SELALU ADA (deterministik) | ❌ TIDAK |
| `context.sourceTrace` | `trace_parser.ts:31` | `string \| undefined` | ❌ SERING UNDEFINED | ✅ YA |

**CHECK 002 membaca source yang salah.**

### 1.4 Broken Contract Prompt-Parser

Instruksi prompt di `universal_contract.ts:232` (sebelum perbaikan):
> *"sebutkan evidence apa yang Anda gunakan"*

Parser mengharapkan format `regex /[A-Z]{2,3}-\d{4}/`. Ini adalah **kontrak yang patah** (*broken contract*): instruksi menggunakan natural language, tapi parser menggunakan regex strict.

### 1.5 Mengapa LITE/ASSISTANT Berhasil

`verifyPersonal()` tidak memiliki CHECK 002 dan CHECK 003 (source trace checks). Checks ini hanya ada di `verifyEngineering()` — yang hanya dipanggil untuk ENGINEER mode.

---

## 2. Keputusan yang Diambil

### 2.1 Tetap Strict — Tapi Perbaiki Root Cause

Keputusan: **Opsi A — Tetap strict, perbaiki root cause, tambah feature toggle sebagai safety net.**

Verification Engine tetap melakukan hard gate. Tidak ada bypass, tidak ada penurunan standar kualitas. Yang diperbaiki adalah *mengapa* kegagalan terjadi:

1. **Perbaiki instruksi prompt** agar LLM menghasilkan format yang bisa di-parse (fix root cause)
2. **Perbaiki logika CHECK 002** agar membedakan jenis kegagalan (fix false negative diagnostics)
3. **Tambah feature toggle** sebagai safety net deployment (risk mitigation)

### 2.2 Feature Toggle: ENGINEER_STRICT_MODE

Environment variable `ENGINEER_STRICT_MODE` ditambahkan sebagai lifebuoy:

| Nilai | Behavior |
|-------|----------|
| `true` (default) | Opsi A: Blokir response jika parser trace undefined tapi backend punya data |
| `false` | Opsi B: Warning only, izinkan response lewat (untuk debugging staging) |

**Default tetap strict** (`true`). Toggle `false` hanya digunakan saat:
- Tingkat kegagalan format masih tinggi (>5%) setelah deploy staging
- Investigasi aktif sedang berlangsung

### 2.3 Perbedaan Jenis Kegagalan CHECK 002

CHECK 002 sekarang membedakan tiga skenario:

| Skenario | Parser Trace | Backend Trace | Verdict | Kategori |
|----------|-------------|---------------|---------|----------|
| Casual chat, tidak ada evidence | undefined | kosong | WARN | Normal |
| Pipeline issue | undefined | kosong | FAIL | `EVIDENCE_MISSING_FAIL` |
| LLM tidak ikut format prompt | undefined | ada data | FAIL (strict) / WARN (toggle off) | `FORMAT_COMPLIANCE_FAIL` |
| Normal | ada string | - | PASS | Sukses |

---

## 3. Alternatif yang Ditolak

### Opsi B Permanen: CHECK 002 selalu WARN untuk format failure

**Argumen:** Jika backend punya data, sistem sudah memiliki evidence — LLM hanya gagal menyebutkannya dalam format yang benar.

**Ditolak karena:**
- Engineer mode dirancang untuk *traceability* penuh. Source trace dalam response adalah kontrak engineer, bukan opsional.
- Menurunkan strictness secara permanen menurunkan kualitas output engineer jangka panjang.
- Constitution menyatakan: *"Tidak ada informasi dianggap benar tanpa proses verifikasi yang sesuai."*

### Mengganti Source #2 (parser) dengan Source #1 (backend) di CHECK 002

**Argumen:** Backend trace deterministic, selalu ada — gunakan itu saja untuk CHECK 002.

**Ditolak karena:**
- Goal CHECK 002 adalah memverifikasi bahwa **LLM menyebut sumber dalam jawabannya** — bukan hanya bahwa backend punya data.
- Jika backend digunakan sebagai proxy untuk LLM compliance, engineer bisa mendapat jawaban yang tidak mencantumkan sumber sama sekali.
- ADR-0010 mendokumentasikan intent: *"Hard gate harus memverifikasi kesesuaian evidence."*

---

## 4. Konsekuensi dan Dampak

### 4.1 Dampak Positif

- ✅ ENGINEER mode tidak lagi selalu gagal jika LLM mengikuti instruksi format baru
- ✅ Pesan error CHECK 002 sekarang informatif: membedakan format failure vs evidence failure
- ✅ JSON structured logging memungkinkan dashboard monitoring di Supabase
- ✅ Feature toggle memungkinkan rollback instan tanpa redeploy
- ✅ Runtime instrumentation di `synthesis_handler.ts` mengisi 5 data gap yang diidentifikasi AUDIT-02
- ✅ Parser scan window diperluas (15 → 30 baris) sebagai minor robustness improvement

### 4.2 Risiko

- ⚠️ Instruksi prompt yang lebih panjang menambah token ke setiap request ENGINEER. Estimasi: +150 tokens/request.
- ⚠️ LLM mungkin masih tidak mengikuti format meskipun instruksi sudah eksplisit. Monitoring via `SYNTHESIS_DIAG` log diperlukan.
- ⚠️ LLM mungkin "hallucinate" ID yang tidak ada di knowledge base saat mencoba mengikuti format (CHECK 007 dari ADR-0010 akan menangkap ini di masa depan).

### 4.3 Monitoring yang Diperlukan

Setelah deploy staging, query Supabase logs untuk:

```sql
-- Cek apakah parser mulai berhasil mengekstrak source trace
SELECT
  json_extract(log, '$.parser_trace_found') as parser_found,
  json_extract(log, '$.backend_trace_items') as backend_items,
  COUNT(*) as count
FROM supabase_function_logs
WHERE json_extract(log, '$.event') = 'SYNTHESIS_DIAG'
GROUP BY 1, 2;

-- Cek apakah CHECK_002_FORMAT_COMPLIANCE_FAIL masih terjadi
SELECT COUNT(*)
FROM supabase_function_logs
WHERE json_extract(log, '$.event') = 'CHECK_002_FORMAT_COMPLIANCE_FAIL';
```

**Pass criteria untuk production deploy:**
- `parser_trace_found = true` pada > 95% request ENGINEER
- `CHECK_002_FORMAT_COMPLIANCE_FAIL` < 5% dari total request ENGINEER

---

## 5. Implementation Scope

| File | Perubahan |
|------|-----------|
| `verification/universal_contract.ts` | Instruksi prompt SOURCE TRACE diperbaiki: natural language → format eksplisit dengan template dan contoh |
| `verification/verification_engine.ts` | CHECK 002 diperbaiki: logika 4-cabang + `ENGINEER_STRICT_MODE` toggle + JSON structured logging |
| `orchestration/handlers/synthesis_handler.ts` | JSON diagnostic logging ditambah di titik instrumentasi optimal (AUDIT-03) |
| `coordinator/trace_parser.ts` | Scan window diperluas: 15 → 30 baris |

---

## 6. Deployment Protocol

```
1. Deploy ke STAGING
2. Test 5-10 request ENGINEER mode
3. Query Supabase logs untuk event SYNTHESIS_DIAG dan CHECK_002_FORMAT_COMPLIANCE_FAIL
4. Jika parser_trace_found mulai muncul true → lanjut ke produksi
5. Jika masih tinggi kegagalan format → set ENGINEER_STRICT_MODE=false sambil investigasi prompt
6. Deploy ke PRODUCTION setelah staging 95% pass rate
```

---

## 7. Impact Scope

- **MAEF Kernel**: Tidak terdampak
- **Capability Port**: Tidak terdampak
- **Memory System**: Tidak terdampak
- **Knowledge System**: Tidak terdampak
- **Verification Engine**: TERDAMPAK — logika CHECK 002 berubah
- **Universal Contract / Prompt System**: TERDAMPAK — instruksi prompt berubah
- **Parser Pipeline**: TERDAMPAK minor — scan window diperluas
- **Observability**: TERDAMPAK positif — JSON logging ditambah

---

## 8. Related Documents

- `changelog/2026-07-23/SUMMARY.md` — Master summary audit forensik
- `changelog/2026-07-23/AUDIT-01-runtime-evidence.md` — Lokasi "Verification Failed"
- `changelog/2026-07-23/AUDIT-02-runtime-gap.md` — 5 data gap yang teridentifikasi
- `changelog/2026-07-23/AUDIT-03-single-instrumentation-point.md` — Desain titik logging optimal
- `changelog/2026-07-23/AUDIT-04-payload-lifecycle.md` — Trace transformasi payload
- `changelog/2026-07-23/AUDIT-05-verification-architecture.md` — Analisis double source of truth
- `constitution/13_VERIFICATION_ENGINE_SPEC.md` — Specification yang menjadi acuan
- `constitution/21 Engineer Capability.md` — Definisi kapabilitas Engineer
- ADR-0010 — Verification Engine Hard Gate Specification (tetap berlaku untuk bagian lain)

---

## 9. Catatan Arsitektural untuk Engineer Masa Depan

> **Jika Anda membaca ini 2 tahun atau 5 tahun dari sekarang:**
>
> CHECK 002 di `verifyEngineering()` memiliki logika yang tampak rumit karena ada dua source trace:
> 1. `context.sourceTrace` — output dari parser (dari LLM response text)
> 2. `context.confidenceReport.sourceTrace` — array dari backend evidence system
>
> Keduanya ADA secara bersamaan di `vContext`. CHECK 002 **sengaja membaca parser output (#1)**, bukan backend (#2), karena tujuannya adalah memverifikasi **LLM compliance** (apakah LLM menyebut sumber dalam jawabannya) — bukan hanya memverifikasi ketersediaan data backend.
>
> Ini adalah **arsitektural intent yang disengaja**, bukan bug. Jangan mengganti source #1 dengan source #2 tanpa membuat ADR baru yang menjelaskan alasannya.
>
> — Mamet Engineering, 2026-07-23

---

END OF ADR-0012
