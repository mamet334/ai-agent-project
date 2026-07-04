# Audit Laporan: Koneksi Frontend ↔ Backend
**Tanggal:** 2026-07-04 | **Tipe:** READ-ONLY | **Scope:** Full Pipeline

---

## Ringkasan Eksekutif

Pipeline secara umum **terhubung dengan benar** dari UI ke backend. Namun terdapat **7 temuan** dengan 2 temuan berstatus HIGH yang menyebabkan fitur tidak berfungsi optimal.

---

## 1. ALUR PENGIRIMAN CHAT (ConversationEngine → agent-process)

### ✅ Yang Berfungsi
- `ConversationEngine.jsx` (L166) mengirim ke endpoint yang benar.
- Parameter `mode`, `globalMemory`, `history`, `ragEnabled` semua dikirim dengan benar.
- Mode resolution dari `workspaceManager.activeWorkspaceId` ke `OWNER`/`ENGINEER`/`LITE` sudah benar (L244-256).
- Backend `request_parser.ts` (L11-12) berhasil menerima dan mem-fallback `mode` ke `'OWNER'` jika tidak ada.

### ⚠️ Temuan 1 — `semanticContext` Dikirim tapi Tidak Diterima Backend
**Temuan:** `ConversationEngine.jsx` (L265) mengirim field `semanticContext` di payload JSON. Namun di `request_parser.ts` (L11), field ini **tidak di-destructure** sama sekali. Backend tidak membaca `semanticContext`.

**Akar Masalah:** `request_parser.ts` tidak pernah diperbaharui untuk menerima field baru ini.

**Dampak:** Konteks semantik (intent, entities) yang diekstrak oleh `SemanticContextService` di frontend tidak pernah sampai ke LLM. Effort semantic understanding sia-sia.

**Rekomendasi:** Tambah `semanticContext` ke destructuring di `request_parser.ts` L11, lalu teruskan ke `ctx.request`.

**Prioritas:** MEDIUM

---

## 2. ALUR USER MEMORY (MemoryService → Supabase → RAG Pipeline)

### ✅ Yang Berfungsi
- `MemoryService.js` melakukan query ke tabel `user_memories` dengan keyword filtering dan ordering (L35-51).
- Backend `memory_manager_v1.ts` melakukan query dengan UUID validation, scoring, dan deduplication.
- `globalMemory` dari frontend dikirim dan digunakan sebagai `memoryPrompt` di backend.
- `canReadMemory` di-set dengan benar: `OWNER = true`, `LITE = false`, `ENGINEER = true`.

### 🔴 Temuan 2 — RAG Sengaja Dinonaktifkan untuk Mode OWNER/LITE
**Temuan:** `context_builder.ts` (L37-41) secara eksplisit menonaktifkan embedding/RAG untuk mode `OWNER` dan `LITE`:
```typescript
if (ctx.policy.mode === 'OWNER' || ctx.policy.mode === 'LITE') {
    console.log('[RAG] Embedding disabled for mode:', ctx.policy.mode);
    return [];
}
```

**Akar Masalah:** Keputusan desain ini dimaksudkan untuk menghindari quota embedding, tetapi hasilnya adalah `ragArray` selalu `[]` untuk mode OWNER. Ini membuat `totalEvidence` (di `evidence_validator.ts` L41) sering bernilai rendah, yang kemudian memicu WARNING di EVIDENCE_GATE dan membatasi kualitas jawaban LLM.

**Dampak:** User di mode OWNER **tidak akan pernah mendapat** konten dari dokumen yang mereka upload ke Knowledge Base, walaupun dokumen tersebut ada.

**Rekomendasi:** Pertimbangkan untuk mengaktifkan RAG (text-based search tanpa embedding) untuk OWNER, misalnya full-text search (`document_search.ts` berbasis keyword), bukan embedding vector.

**Prioritas:** HIGH

### ⚠️ Temuan 3 — `MEMORY_V2_ENABLED` Feature Flag Tidak Dikonfigurasi
**Temuan:** `memory_manager_v1.ts` (L61) membaca env var `MEMORY_V2_ENABLED`:
```typescript
export const MEMORY_V2_ENABLED = Deno.env.get('MEMORY_V2_ENABLED') === 'true';
```
Flag ini tidak ditemukan di `supabase/config.toml`. Jika tidak di-set di Supabase Dashboard, `MEMORY_V2_ENABLED` selalu `false`.

**Akar Masalah:** Memory V2 (graph-based, cognitive subgraph) tidak pernah aktif karena env var tidak dikonfigurasi.

**Dampak:** Fitur Memory V2 yang lebih cerdas tidak pernah berjalan. Sistem selalu fallback ke V1.

**Rekomendasi:** Konfirmasi apakah V2 sudah siap; jika ya, set `MEMORY_V2_ENABLED=true` di Supabase Secrets.

**Prioritas:** LOW

---

## 3. ALUR SEMANTIC UNDERSTANDING (SemanticContextService → IntentParser → EntityExtractor)

### ✅ Yang Berfungsi
- `SemanticContextService.js` berhasil diinisialisasi di `Kernel.js` Phase 3 (L222-224).
- `ConversationEngine.jsx` memanggil `semanticContextService.parseIntent()` dan `updateGraph()` dengan benar (L222-231).
- `IntentParser` dan `EntityExtractor` diinstansiasi di dalam `SemanticContextService` constructor.

### 🔴 Temuan 4 — Semantic Context Tidak Pernah Sampai ke Backend (Lihat Temuan 1)
Ini adalah dampak langsung dari Temuan 1. Seluruh alur semantic di frontend berjalan, tetapi hasilnya tidak pernah digunakan karena field `semanticContext` tidak dibaca oleh backend.

**Prioritas:** MEDIUM (terhubung dengan Temuan 1)

---

## 4. ALUR VERIFIKASI (Frontend VerificationEngine vs Backend)

### ✅ Yang Berfungsi
- Mode-Aware Verification sudah diimplementasikan di `synthesis_handler.ts`: ENGINEER → `verifyEngineering()`, lainnya → `verifyPersonal()`.
- Hard Gate untuk ENGINEER sudah benar: FAIL = blokir respons.
- Soft Warning untuk OWNER/LITE sudah benar: FAIL = `console.warn`, tidak blokir.

### ⚠️ Temuan 5 — Frontend VerificationEngine Adalah Stub
**Temuan:** `Kernel.js` Phase 4 (L271-276) mendaftarkan sebuah stub:
```javascript
const verificationEngine = {
    mode: 'SAFE_BOOTSTRAP_MODE',
    validate: () => ({ valid: true, confidence: 1.0 }),
    verifyEvidence: () => ({ verdict: 'PASS' })
};
```

Backend memiliki `VerificationEngine` yang lengkap dengan 8 check. Frontend hanya memiliki stub yang selalu `PASS`.

**Akar Masalah:** Frontend VerificationEngine belum diimplementasikan. Hanya backend yang melakukan verifikasi nyata.

**Dampak:** Engineer di frontend tidak mendapat verifikasi lokal sebelum mengirim request. Tidak ada pre-flight check. Bukan masalah kritis karena backend masih memverifikasi, tetapi menambah latency dan inconsistency.

**Rekomendasi:** Implementasikan `VerificationEngine` di frontend dengan minimal CHECK_001 dan CHECK_007 untuk pre-flight validation.

**Prioritas:** LOW

---

## 5. PIPELINE RAG & EMBEDDING

### ✅ Yang Berfungsi
- `embedding.ts` menggunakan fallback mechanism (Gemini → OpenAI embedding).
- `document_search.ts` dipanggil setelah embedding berhasil.
- Error handling ada: jika embedding gagal, return `[]` tanpa throw.

### 🔴 Temuan 6 — RAG Disabled by Design untuk OWNER/LITE (Sama dengan Temuan 2)

### ⚠️ Temuan 7 — `ctx.request.effectiveRagThreshold` Mungkin Undefined
**Temuan:** `request_pipeline.ts` (L243) mengeset `ctx.request.effectiveRagThreshold`. Namun `context_builder.ts` (L53) menggunakan `ctx.request.effectiveRagThreshold` yang mungkin tidak ada jika request diproses lewat jalur lain.

**Akar Masalah:** Tidak ada nilai default di `context_builder.ts` jika field ini undefined.

**Dampak:** Jika `effectiveRagThreshold` undefined, `searchDocuments()` mungkin menggunakan `NaN` atau `undefined` sebagai threshold, yang bisa menghasilkan hasil tak terduga.

**Rekomendasi:** Tambahkan fallback: `ctx.request.effectiveRagThreshold ?? 0.65` di `context_builder.ts` L53.

**Prioritas:** MEDIUM

---

## 6. CAPABILITY SEPARATION (OWNER vs ENGINEER)

### ✅ Yang Berfungsi
- `execution_context.ts` memisahkan capability dengan benar:
  - `ENGINEER`: `canReadRAG=true`, `canReadMemory=true`, `canWriteMemory=false`, `canWriteKnowledge=false`
  - `OWNER`: `canReadRAG=true`, `canReadMemory=true`, `canWriteMemory=false`
  - `LITE`: `canReadMemory=false`
- `PolicyEngine` hanya dijalankan untuk mode `ENGINEER` (L203).
- Evidence Gate hanya HARD BLOCK untuk mode `ENGINEER` dengan `totalEvidence === 0`.
- Verification Engine menggunakan mode-aware routing yang sudah diperbaiki hari ini.

### ⚠️ Temuan Tambahan — Mode Derivation Bisa Konflik
**Temuan:** `execution_context.ts` (L12) mendefinisikan `mode` dengan logika berlapis:
```typescript
const mode: MametCapabilityMode = (input.mode as MametCapabilityMode) || 
    (isMametEngineer ? "ENGINEER" : isMametLite ? "LITE" : (input.desktopOSMode ? "AI" : "LITE"));
```
Jika `appSource` dari JWT metadata adalah `engineer` tetapi `mode` dari payload adalah `OWNER`, nilai akhir adalah `OWNER`. Tapi `isMametEngineer` di L11 akan `true` karena melihat `appSource`. Ini bisa menyebabkan kebingungan antara `mode` dan `isMametEngineer` flag di beberapa tempat.

**Prioritas:** LOW

---

## Titik Putus Pipeline (Summary)

```
Frontend                          Backend
─────────────────────────────────────────────────────
ConversationEngine
  ├── Memory: globalMemory ──────────────→ ✅ Diterima, digunakan
  ├── semanticContext ────────────────────→ ❌ TIDAK DIBACA (Temuan 1)
  ├── mode ───────────────────────────────→ ✅ Diterima, diproses
  ├── ragEnabled ─────────────────────────→ ✅ Diterima
  └── history ────────────────────────────→ ✅ Diterima, dikompres

Backend Pipeline
  ├── RAG embedding ──────────────────────→ ❌ DINONAKTIFKAN untuk OWNER/LITE (Temuan 2)
  ├── Memory retrieval ────────────────────→ ✅ Berjalan untuk OWNER
  ├── Evidence Gate ───────────────────────→ ✅ Soft warning untuk OWNER
  ├── Verification ────────────────────────→ ✅ Mode-aware (diperbaiki hari ini)
  └── Response ────────────────────────────→ ✅ Dikirim kembali ke UI
```

---

## Tabel Prioritas Rekomendasi

| # | Temuan | File | Baris | Prioritas | Tindakan |
|---|--------|------|-------|-----------|---------|
| 1 | `semanticContext` tidak dibaca backend | `request_parser.ts` | L11 | MEDIUM | Tambah ke destructuring |
| 2 | RAG disabled untuk OWNER/LITE | `context_builder.ts` | L37-41 | HIGH | Aktifkan text-search fallback |
| 3 | MEMORY_V2_ENABLED tidak dikonfigurasi | `memory_manager_v1.ts` | L61 | LOW | Set env var di Supabase |
| 4 | Frontend VerificationEngine adalah stub | `Kernel.js` | L271-276 | LOW | Implementasi pre-flight check |
| 5 | effectiveRagThreshold mungkin undefined | `context_builder.ts` | L53 | MEDIUM | Tambah fallback value |
| 6 | Mode derivation bisa konflik | `execution_context.ts` | L12 | LOW | Klarifikasi prioritas logika |
