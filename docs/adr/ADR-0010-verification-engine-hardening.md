# ADR-0010: Verification Engine Hard Gate Specification

**ID:** ADR-0010
**Judul:** Verification Engine Hard Gate — Dari Structural ke Semantic Verification
**Status:** APPROVED
**Tanggal:** 2026-06-29
**Penulis:** Mamet Engineering (Constitution Review Wave 2)
**Menutup Gap:** GAP-NEW-004
**Berlaku untuk:** `supabase/functions/agent-process/lib/verification_engine.ts`

---

## 1. Konteks dan Latar Belakang

### 1.1 Kondisi Saat Ini

`verification_engine.ts` mengimplementasikan `VerificationEngine.verify()` dengan **6 checks structural**:

| Check | Jenis | Deskripsi | Severity |
|---|---|---|---|
| CHECK_001 | Structural | Response text not empty | CRITICAL |
| CHECK_002 | Structural | Source trace string exists | CRITICAL |
| CHECK_003 | Structural | Source trace format valid (regex `[A-Z]{3}-\d{4}`) | ERROR |
| CHECK_004 | Structural | Confidence report object exists | WARNING |
| CHECK_005 | Structural | Evidence report object exists | WARNING |
| CHECK_006 | Structural | Runtime context object exists | INFO |

**Masalah:** File sendiri mendeklarasikan dalam komentar:
> "Currently implements a dummy skeleton that always returns PASS."

Seluruh 6 checks hanya memverifikasi **keberadaan dan format objek** — bukan **konten** jawaban yang dihasilkan LLM.

### 1.2 Apa yang Dikatakan Vision Constitution v2

Vision Constitution v2 §ENGINEERING CONSTITUTION, bagian Verification Engine:

> "Verification Engine adalah Hard Gate. Setiap output LLM yang akan dikembalikan ke user WAJIB melewati Verification Engine. Jika gagal, output DITOLAK dan tidak dikirim."

> "Hard Gate harus memverifikasi: kesesuaian evidence, ketiadaan hallucination pattern, kepatuhan terhadap Output Contract."

### 1.3 Gap yang Ditemukan

VerificationEngine saat ini:
- ✅ Merupakan hard gate dalam arti: jika FAIL, response diblok (`index.ts` L1952–1954)
- ❌ **Tidak memverifikasi konten jawaban** LLM
- ❌ Tidak mendeteksi hallucination pattern
- ❌ Tidak mendeteksi ADR violation dalam jawaban
- ❌ Source trace check (CHECK_002 dan CHECK_003) memeriksa `context.sourceTrace` yang berasal dari `extractSourceTrace()` pada `replyMessage` — bukan dari isi response itu sendiri
- ❌ 6 checks lebih mendekati "apakah pipeline berjalan benar?" bukan "apakah jawaban LLM berkualitas?"

---

## 2. Definisi Formal

### 2.1 Hard Gate

**Hard Gate** adalah checkpoint yang **memblokir secara mutlak** jika gagal — tidak ada fallback, tidak ada bypass. Dalam konteks Mamet AI:

```
LLM Response → Hard Gate → [PASS: kirim ke user] atau [FAIL: blok, return error]
```

Karakteristik:
- Binary decision: PASS atau FAIL
- Tidak dapat di-override dari luar
- Kegagalan harus dicatat ke audit log
- Blok harus mengembalikan pesan yang bermakna ke user

### 2.2 Structural Verification

Memverifikasi **format dan keberadaan** elemen-elemen pipeline:
- Apakah response text ada?
- Apakah source trace ada?
- Apakah format source trace sesuai?
- Apakah objek-objek report yang diperlukan ada?

**Analogi:** Apakah amplop surat terisi? Apakah ada alamat pengirim dan penerima?

**Batasan:** Structural verification tidak bisa mendeteksi apakah isi surat benar.

### 2.3 Semantic Verification

Memverifikasi **isi dan makna** dari output LLM:
- Apakah jawaban mengandung klaim yang tidak ada evidencenya?
- Apakah jawaban mengacu ke ADR/Task/Knowledge yang tidak ada di Brain 1/2?
- Apakah jawaban melanggar instruksi dari Output Contract?
- Apakah jawaban mengandung pola hallucination yang dapat dideteksi?

**Analogi:** Apakah isi surat sesuai dengan fakta yang ada?

**Batasan:** Semantic verification membutuhkan referensi (evidence list, ADR list) — tidak bisa dilakukan tanpa konteks.

---

## 3. Arsitektur Hard Gate yang Diperlukan

### 3.1 Dua Layer Verifikasi

```
LLM Response
     │
     ▼
┌─────────────────────────┐
│  Layer 1: STRUCTURAL    │ ← Checks 001–006 yang sudah ada
│  (Pipeline Integrity)   │
└────────────┬────────────┘
             │ PASS
             ▼
┌─────────────────────────┐
│  Layer 2: SEMANTIC      │ ← Checks baru (CHECK_007 dst)
│  (Content Quality)      │
└────────────┬────────────┘
             │ PASS
             ▼
         USER RESPONSE
```

Layer 1 harus lulus sebelum Layer 2 dijalankan. Ini mencegah Layer 2 berjalan pada response kosong.

### 3.2 Grade Keparahan Kegagalan

| Severity | Konsekuensi |
|---|---|
| CRITICAL | Langsung FAIL, stop semua checks, return error |
| ERROR | Tambahkan ke failures, lanjutkan checks lain, akhir = FAIL jika ada ERROR |
| WARNING | Catat ke audit log, response tetap lolos (PASS) |
| INFO | Hanya dicatat, tidak mempengaruhi keputusan |

---

## 4. Spesifikasi Check Baru — Layer 2 (Semantic)

### CHECK_007: ENGINEER_NO_HALLUCINATED_REFERENCES

**Berlaku untuk:** Mode ENGINEER saja
**Severity:** ERROR
**Deskripsi:** Untuk ENGINEER mode, verifikasi bahwa jawaban tidak mengacu ke ADR, Task, atau Knowledge ID yang tidak ada di Brain 1 atau Brain 2 yang di-load pada request ini.

**Logika:**
```
1. Extract semua ID format `[A-Z]{2,5}-\d{4}` dari responseText
2. Bandingkan dengan daftar ID yang valid: brain1Ids + brain2Tasks + brain2Gaps
3. Jika ada ID yang tidak ada di daftar valid → FAIL
```

**Contoh Hallucination yang Dideteksi:**
- LLM menyebut `ADR-0099` padahal hanya ADR-0001 s/d ADR-0010 yang di-load
- LLM menyebut `TASK-0050` padahal tidak ada task dengan nomor tersebut

**Pengecualian:**
- ID dalam blok quote (`>`) tidak diperiksa — bisa merupakan kutipan user
- ID dalam blok kode (triple backtick) tidak diperiksa — bisa merupakan contoh

**Implementasi pseudocode:**
```typescript
if (context.runtimeContext?.mode === 'ENGINEER') {
  const validIds = new Set([
    ...(context.runtimeContext.brain1Ids || []),
    ...(context.runtimeContext.brain2Tasks || []),
    ...(context.runtimeContext.brain2Gaps || []),
  ]);
  
  // Strip quotes and code blocks before scanning
  const scannable = responseText
    .replace(/^>.*$/gm, '')      // remove blockquotes
    .replace(/```[\s\S]*?```/g, ''); // remove code blocks
  
  const foundIds = scannable.match(/[A-Z]{2,5}-\d{4}/g) || [];
  const hallucinated = foundIds.filter(id => !validIds.has(id));
  
  if (hallucinated.length > 0) {
    // CHECK_007 FAIL
    message = `Hallucinated references detected: ${hallucinated.join(', ')}`;
  }
}
```

---

### CHECK_008: OUTPUT_CONTRACT_COMPLIANCE

**Berlaku untuk:** Mode ENGINEER, jika `requireSourceTrace = true`
**Severity:** WARNING (bukan ERROR — untuk menghindari false positive)
**Deskripsi:** Verifikasi bahwa jawaban ENGINEER mode mengandung SOURCE TRACE di bagian akhir, sesuai Output Contract.

**Logika:**
```
1. Cek apakah outputContract.requireSourceTrace = true (dari context)
2. Jika ya, verifikasi bahwa responseText mengandung pola Source Trace
3. Pola: ada heading "Source Trace" atau "Referensi" diikuti minimal satu ID format ADR-XXXX
```

**Severity: WARNING** karena:
- Source trace sudah di-extract terpisah oleh `extractSourceTrace()` di `index.ts`
- Jika source trace ada tapi formatnya berbeda, tidak perlu blok response
- False positive akan merusak UX Engineer mode

**Implementasi pseudocode:**
```typescript
if (context.outputContract?.requireSourceTrace) {
  const hasTraceHeading = /source\s*trace|referensi/i.test(responseText);
  const hasTraceId = /[A-Z]{2,5}-\d{4}/.test(responseText);
  
  if (!hasTraceHeading && !hasTraceId) {
    // CHECK_008 WARNING — tidak blok, hanya dicatat
    message = 'Response does not contain Source Trace despite Output Contract requirement';
    status = 'WARN';
    overallStatus = overallStatus === 'FAIL' ? 'FAIL' : 'WARN';
  }
}
```

---

### CHECK_009: MINIMUM_RESPONSE_LENGTH

**Berlaku untuk:** Semua mode
**Severity:** WARNING
**Deskripsi:** Response yang terlalu pendek (<50 karakter non-whitespace) kemungkinan merupakan error atau incomplete generation.

**Logika:**
```
nonWhitespace = responseText.replace(/\s/g, '').length
if nonWhitespace < 50 → WARNING
```

**Catatan:** Ini WARNING bukan ERROR karena ada kasus valid dimana jawaban singkat diharapkan (misal: "Ya" atau "Tidak ada task yang InProgress saat ini.").

---

### CHECK_010: CONFIDENCE_THRESHOLD_COMPLIANCE

**Berlaku untuk:** Mode ENGINEER saja, jika `requireConfidenceStatement = true`
**Severity:** WARNING
**Deskripsi:** Jika confidence score < 70% dan Output Contract mewajibkan confidence statement, verifikasi bahwa jawaban mengandung pernyataan keterbatasan confidence.

**Logika:**
```
if context.confidenceReport.score < 70 AND outputContract.requireConfidenceStatement:
  if responseText tidak mengandung kata-kata: "keterbatasan", "tidak yakin", "confidence", "tidak pasti", "belum terverifikasi"
  → WARNING
```

---

## 5. Staging Implementasi

Prinsip: Tidak ada perubahan runtime behavior yang breaking. Setiap check baru ditambahkan secara additive.

### Stage 0 (Sekarang — Wave 2)
**Dokumentasi saja.** ADR ini ditetapkan. Tidak ada perubahan kode.

### Stage 1 (Wave 6 — Priority 1)
**Tambah CHECK_007 dengan mode OBSERVE.**

Artinya: CHECK_007 dieksekusi, hasilnya dicatat ke audit log, tapi **tidak mempengaruhi keputusan PASS/FAIL**. Ini untuk mengumpulkan data tentang seberapa sering hallucinated references muncul.

```typescript
// Stage 1: OBSERVE mode
const check007 = runCheck007(context);
auditLog.push(check007); // Dicatat
// check007 TIDAK ditambahkan ke failures/warnings
```

Durasi stage 1: minimal 1 minggu produksi.

### Stage 2 (Wave 6 — Priority 2)
**Promote CHECK_007 ke WARNING.**

Setelah data Stage 1 dianalisis dan false positive rate rendah, promote ke WARNING. Response masih lolos, tapi dicatat lebih jelas.

### Stage 3 (Wave 6 — Priority 3)
**Promote CHECK_007 ke ERROR.**

Setelah Stage 2 stabil, promote ke ERROR. Response dengan hallucinated references akan diblok.

### Stage 4 (Setelah Wave 6)
**Tambah CHECK_008, CHECK_009, CHECK_010.**

Semua dimulai dari OBSERVE, lalu dipromote berdasarkan data.

---

## 6. Perubahan pada `VerificationContext`

Untuk mendukung semantic checks, `VerificationContext` perlu ditambah field:

```typescript
// Perubahan yang diperlukan di masa depan (bukan sekarang):
export interface VerificationContext {
  responseText: string;
  sourceTrace?: string;
  confidenceReport?: any;
  evidenceReport?: any;
  runtimeContext?: any;
  
  // Tambahan untuk semantic checks (Stage 1+):
  outputContract?: {
    requireSourceTrace: boolean;
    requireConfidenceStatement: boolean;
  };
  validIds?: {          // Brain 1 + Brain 2 IDs yang valid
    brain1Ids: string[];
    brain2Tasks: string[];
    brain2Gaps: string[];
  };
}
```

**Backward compatible:** Semua field baru adalah optional. Checks yang bergantung pada field ini skip jika field tidak ada.

---

## 7. Dampak pada Audit Log

Setiap check baru harus dicatat ke `verification_audit_logs` dengan field yang sudah ada:

```typescript
{
  checks: [...existingChecks, check007, check008, ...],
  failures: [...] // jika severity ERROR+
}
```

Tidak ada perubahan schema `verification_audit_logs` yang diperlukan.

---

## 8. Yang Tidak Akan Dilakukan

| Item | Alasan |
|---|---|
| AI-based verification | Terlalu mahal secara kuota. Verification harus deterministic. |
| Verifikasi faktual (apakah jawaban akurat?) | Tidak mungkin dilakukan tanpa ground truth yang diketahui |
| Verifikasi grammar/bahasa | Di luar scope engineering verification |
| Perubahan pada 6 checks yang ada | Structural checks sudah benar. Tidak perlu diubah. |
| Perubahan keputusan PASS/FAIL saat ini | Stage 0 = tidak ada perubahan behavior |

---

## 9. Metrik Keberhasilan

Hard Gate dikatakan berhasil jika:

1. **False Positive Rate < 5%** — Kurang dari 5% response yang valid diblok oleh semantic checks
2. **Hallucination Detection Rate > 80%** — Lebih dari 80% hallucinated references terdeteksi (berdasarkan manual review sampel)
3. **Performance overhead < 50ms** — Seluruh verification selesai dalam < 50ms tambahan
4. **Zero streaming breakage** — Semantic checks tidak dijalankan pada streaming path (streaming bypass verification karena response dibuild secara incremental)

---

## 10. Catatan Penting: Streaming vs Non-Streaming

Verification Engine saat ini hanya dijalankan pada **non-streaming path** (`isChatBiasa = true`, request tanpa stream). Streaming path tidak memanggil `VerificationEngine.verify()`.

Keputusan ini **dipertahankan** dalam ADR ini. Semantic verification pada streaming response lebih kompleks dan membutuhkan ADR terpisah di masa depan.

---

## 11. Referensi

- `supabase/functions/agent-process/lib/verification_engine.ts`
- `supabase/functions/agent-process/index.ts` L1863–L1955
- GAP-NEW-004 — `docs/architecture/ARCHITECTURE-GAPS.md`
- TASK-NEW-008 — Constitution Review Implementation Plan
- Vision Constitution v2 §ENGINEERING CONSTITUTION
- ADR-0008 — Single Context Pipeline (untuk context tentang `outputContract`)
