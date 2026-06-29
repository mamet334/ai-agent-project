# ADR-0008: Single Context Pipeline Decision

**ID:** ADR-0008
**Judul:** Single Context Pipeline — `buildUniversalContract` sebagai Canonical Pipeline
**Status:** APPROVED
**Tanggal:** 2026-06-29
**Penulis:** Mamet Engineering (Constitution Review Wave 2)
**Menutup Gap:** GAP-NEW-010
**Berlaku untuk:** `supabase/functions/agent-process/`

---

## 1. Konteks dan Latar Belakang

### 1.1 Masalah yang Ditemukan

Constitution Review 2026-06-29 menemukan GAP-NEW-010: terdapat **dua jalur paralel** dalam sistem yang sama-sama bertanggung jawab membangun system prompt yang akan dikirim ke LLM:

**Jalur A — `buildContextFusion`**
- Modul: `lib/context_fusion.ts`
- Fungsi: `buildContextFusion()` → `buildStructuredContext()` → `buildFinalPrompt()`
- Output: `finalContext` berupa string dengan XML-like blocks `<SYSTEM>`, `<MEMORY>`, `<RAG>`, `<EXECUTION_TRACE>`
- Dipanggil di: `index.ts` L1556 (`const resolved = buildContextFusion(...)`)
- Hasilnya disimpan di: `fullSystemContext = resolved.finalContext`

**Jalur B — `buildUniversalContract`**
- Modul: `lib/universal_evidence_contract.ts`
- Fungsi: `buildUniversalContract()` → `.asSystemPromptText()`
- Output: `fullSystemContext` berupa string dengan 6-blok contract `[BLOK 1: IDENTITY]` ... `[BLOK 6: OUTPUT CONTRACT]`
- Dipanggil di: `index.ts` L1750
- Hasilnya **menimpa** `fullSystemContext`: `fullSystemContext = universalContract.asSystemPromptText()` (L1773)

### 1.2 Urutan Eksekusi Aktual di `index.ts`

```
L1556: resolved = buildContextFusion(...)         ← Jalur A dieksekusi
L1564: fullSystemContext = resolved.finalContext    ← fullSystemContext dari Jalur A
L1656: fullSystemContext += evidenceReport.gateVerdictText  ← append
...
L1750: universalContract = buildUniversalContract(...)  ← Jalur B dieksekusi
L1773: fullSystemContext = universalContract.asSystemPromptText()  ← fullSystemContext DITIMPA oleh Jalur B
```

### 1.3 Implikasi Masalah

| Aspek | Implikasi |
|---|---|
| Jalur A dieksekusi tapi output-nya TIDAK digunakan | Waste CPU, memory, token budget calculation |
| Jalur B menimpa Jalur A | Jalur A berfungsi sebagai **pre-processor** tidak langsung — confusing |
| Dua jalur, dua format yang berbeda | Format XML-like (Jalur A) vs format numbered-block (Jalur B) |
| Memory context diekstrak dua kali | Jalur A mengambil dari `memoryArray`, Jalur B mengambil dari `memoryContextText` |
| RAG context disusun dua kali | Jalur A memiliki deduplication & char budget, Jalur B langsung stringify |

---

## 2. Analisis Kedua Jalur

### 2.1 `buildContextFusion` (Jalur A)

**Kelebihan:**
- Memiliki **deduplication logic** (cosine similarity-based, cek `seenContent`)
- Memiliki **char budget** (memory max 10.000 chars, RAG max 15.000 chars dari `basePrompts.length`)
- Output terstruktur dengan XML-like tags — mudah di-parse ulang jika diperlukan
- Lebih ringan, tidak bergantung pada `EvidenceReport` dan `ConfidenceReport`

**Kekurangan:**
- Tidak mengandung: Evidence Gate verdict, Confidence Score, Brain 1/2 context, Policy Constraints, Output Contract
- Tidak memiliki `IDENTITY BLOCK` yang mendeklarasikan mode dan kapabilitas
- Format XML-like tidak konsisten dengan 6-blok contract yang lebih terstruktur
- Tidak expose capability/restriction ke LLM secara eksplisit

### 2.2 `buildUniversalContract` (Jalur B)

**Kelebihan:**
- 6-blok contract yang komprehensif: IDENTITY, MEMORY, KNOWLEDGE, RUNTIME, CONSTRAINT, OUTPUT CONTRACT
- Mengandung Evidence Gate verdict, Confidence Score — LLM tahu status evidencenya
- Policy constraints di-inject secara eksplisit ke BLOK 5
- Output Contract mendefinisikan format jawaban yang diharapkan (source trace, confidence statement)
- Vendor-agnostic — format yang sama untuk Gemini, Groq, OpenRouter
- Mengandung Brain 1 + Brain 2 context secara terstruktur
- Lebih aligned dengan Vision Constitution v2 §UNIVERSAL EVIDENCE CONTRACT

**Kekurangan:**
- Tidak memiliki deduplication logic sendiri — bergantung pada `resolved.memory` dan `resolved.rag` dari Jalur A
- `memoryContextText` dan `ragContextText` di-extract manual dari `resolved` sebelum dipanggil (L1732–1735)
- Biaya komputasi lebih tinggi karena membutuhkan `EvidenceReport` dan `ConfidenceReport` terlebih dahulu

---

## 3. Keputusan

### 3.1 Canonical Pipeline: Jalur B — `buildUniversalContract`

**`buildUniversalContract` ditetapkan sebagai single canonical pipeline** untuk membangun system prompt yang dikirim ke LLM.

Alasan:

1. **Alignment dengan Vision Constitution v2:** Vision mendefinisikan Universal Evidence Contract sebagai standar payload. Jalur B adalah implementasi langsung dari definisi ini.
2. **Informasi lebih lengkap:** 6-blok contract memberikan konteks yang jauh lebih kaya ke LLM (evidence status, confidence score, policy constraints, output contract).
3. **Deterministik:** Format numbered-block lebih mudah di-audit dibanding XML-like tags.
4. **`buildContextFusion` tetap digunakan** sebagai **pre-processor** untuk deduplication dan char budget — outputnya diekstrak menjadi `memoryContextText` dan `ragContextText` yang kemudian diinput ke `buildUniversalContract`.

### 3.2 Peran Resmi Setelah Keputusan Ini

| Modul | Peran Resmi | Status |
|---|---|---|
| `buildContextFusion` | **Pre-processor** — deduplication, char budget, memory/RAG extraction | ✅ Dipertahankan, bukan deprecated |
| `buildUniversalContract` | **Canonical pipeline** — membangun final system prompt | ✅ Primary pipeline |
| `buildStructuredContext` | Helper internal `buildContextFusion` | ✅ Dipertahankan |
| `buildFinalPrompt` | Output dari `buildContextFusion` — **tidak dikirim ke LLM** | ⚠️ Internal only |

### 3.3 Apa yang Tidak Berubah

- Tidak ada perubahan runtime behavior
- Tidak ada perubahan pada `buildContextFusion` atau `buildUniversalContract`
- Tidak ada perubahan urutan eksekusi

---

## 4. Trade-off

| Trade-off | Keputusan |
|---|---|
| `buildFinalPrompt` dieksekusi tapi tidak digunakan sebagai final output | **Diterima.** Waste kecil. Ini adalah harga deduplication logic yang berharga. |
| Dua format berbeda di satu pipeline | **Diterima.** Jalur A sebagai pre-processor, Jalur B sebagai renderer. Tidak konflik. |
| `buildUniversalContract` bergantung pada `resolved` dari Jalur A | **Diterima.** Dependency ini bersifat data dependency, bukan logic conflict. |
| Token budget dihitung di Jalur A tapi rendered di Jalur B | **Issue minor.** Char budget di Jalur A (10k memory, 15k RAG) menjadi penjaga token. Jalur B tidak memiliki budget sendiri. Ini harus didokumentasikan. |

---

## 5. Klarifikasi Desain yang Direkomendasikan

Untuk menghilangkan ambiguitas, komentar di `index.ts` harus diperbarui untuk mencerminkan:

```typescript
// STEP 1: Context Pre-processing (deduplication + char budget)
// buildContextFusion menjalankan deduplication dan char budget.
// Output 'resolved' digunakan sebagai INPUT ke UniversalContract, bukan sebagai final system prompt.
const resolved = buildContextFusion({...});

// STEP 2: Universal Evidence Contract (Canonical System Prompt Builder)
// Ini adalah satu-satunya pipeline yang hasilnya dikirim ke LLM.
// resolved.memory dan resolved.rag dipakai sebagai input terstruktur.
const universalContract = buildUniversalContract({...});
fullSystemContext = universalContract.asSystemPromptText(); // ← SATU-SATUNYA assignment final
```

---

## 6. Migration Plan

| Fase | Aksi | Wave | Risiko |
|---|---|---|---|
| 0 (Sekarang) | ADR ini ditetapkan. Tidak ada perubahan kode. | Wave 2 | None |
| 1 | Update komentar di `index.ts` untuk mencerminkan peran resmi kedua jalur | Wave 5 (Decomposition) | Very Low |
| 2 | Pastikan `buildContextFusion` tidak pernah langsung dikonsumsi sebagai final system prompt | Wave 5 | Low |
| 3 | Pertimbangkan rename `buildFinalPrompt` → `buildInternalStructure` untuk menghindari kebingungan | Wave 5 | Very Low |

---

## 7. Konsekuensi

**Positif:**
- Single Source of Truth untuk system prompt yang dikirim ke LLM
- Pipeline yang lebih mudah di-audit dan di-debug
- Konsisten dengan Vision Constitution v2

**Negatif / Risiko:**
- `buildFinalPrompt` tetap dipanggil dan hasilnya tidak digunakan sebagai final output — ini perlu dikomunikasikan ke engineer agar tidak membingungkan
- Jika `buildUniversalContract` gagal, tidak ada fallback ke `buildContextFusion`

---

## 8. Referensi

- `supabase/functions/agent-process/lib/context_fusion.ts`
- `supabase/functions/agent-process/lib/universal_evidence_contract.ts`
- `supabase/functions/agent-process/index.ts` L1556–1773
- GAP-NEW-010 — `docs/architecture/ARCHITECTURE-GAPS.md`
- TASK-NEW-006 — Constitution Review Implementation Plan
- Vision Constitution v2 §UNIVERSAL EVIDENCE CONTRACT
