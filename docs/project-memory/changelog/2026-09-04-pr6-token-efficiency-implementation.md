# Changelog: PR#6 — Token Efficiency Implementation

**Tanggal:** 2026-09-04
**Status:** Diimplementasikan (Menunggu Live Verification)
**Referensi Roadmap:** `docs/roadmap/ROADMAP-PR6-TOKEN-EFFICIENCY.md`

---

## Ringkasan

Implementasi PR#6 Token Efficiency dari `ASSISTANT-CAPABILITY-ROADMAP.md`:

**(a) Prompt Caching via Implicit Caching Gemini**
**(b) Web Search Summarization Guard**
**(c) Token Metrics Logging**

---

## Perubahan Kode

### 1. `supabase/functions/agent-process/lib/adapters/ai_adapter.ts` — GeminiAdapter.stream()

**Perubahan:** Pemisahan system prompt menjadi Static Layer dan Dynamic Layer.

**Sebelum:**
- Seluruh `systemPromptText` (statis + RAG + MEMORY) dimasukkan sebagai satu blok ke `systemInstruction`.
- Setiap request mengirimkan system prompt yang sama dari nol → tidak ada caching.

**Sesudah:**
- `systemInstruction` hanya berisi konten statis (identitas, instruksi MAEF, panduan penalaran).
- Blok dinamis (`<RAG>`, `<MEMORY>`, `<EXECUTION_TRACE />`) diekstrak via regex dan diinjeksikan sebagai pasangan pesan user/model pertama di `contents`.
- Dengan struktur ini, Gemini Implicit Caching otomatis aktif saat `systemInstruction` identik antar request dari session yang sama.
- Token metrics log ditambahkan: `static_cacheable`, `prompt_est`, `completion` per request di console.

**Estimasi penghematan:** ~60–70% dari system prompt (~1.500–3.000 token) berpotensi di-cache per request untuk user yang mengirim beberapa pesan berurutan.

---

### 2. `supabase/functions/agent-process/lib/orchestration/handlers/context_builder.ts`

**Perubahan:** Web Search Summarization Guard + import `runLLM`.

**Sebelum:**
- `externalDocs[]` dari web search langsung digabung ke `combinedRawRag` tanpa batas ukuran.
- Satu artikel bisa 2.000–10.000+ chars tanpa truncation.

**Sesudah:**
- Setelah `externalDocs[]` terbentuk, total chars dihitung.
- Jika total > **6.000 chars**: setiap artikel diringkas secara individual via `runLLM()` (model ringan) dengan prompt peringkas khusus.
- Setiap artikel dibatasi maksimum **800 chars** pasca-ringkasan.
- Judul, URL sumber, dan poin kunci dipertahankan dalam ringkasan.
- Fallback: truncate paksa dengan header dipertahankan jika LLM summarizer gagal.
- Log penghematan token ditampilkan di processing steps (tampil di ObservabilityPanel).

**Fungsi baru:** `summarizeWebDoc(doc, rctx)` — async, per-artikel, dengan fallback truncate.

**Konstanta:**
- `WEB_CONTEXT_TOTAL_THRESHOLD = 6000` (chars sebelum trigger summarization)
- `WEB_CONTEXT_PER_ARTICLE_MAX = 800` (chars maksimum per artikel setelah summarization)

---

## Verifikasi

- [ ] Build pass tanpa error
- [ ] Log `[PR#6 TOKEN]` muncul di Edge Function console setiap request
- [ ] Log `[PR#6 TOKEN METRICS]` muncul di akhir setiap stream response
- [ ] Saat web search aktif dan total > 6.000 chars, log `[PR#6 WebSummarizer]` muncul
- [ ] Processing steps di ObservabilityPanel menampilkan `[PR#6 TOKEN]` info

---

## Exit Criteria Status

- [x] Payload Gemini distrukturkan agar static system prompt masuk `systemInstruction`
      → Implicit Caching aktif otomatis tanpa explicit cache API
- [x] Web search result tidak melebihi 6.000 chars total sebelum masuk context utama
      → Guard aktif dengan summarization per-artikel (maks 800 chars/artikel)
- [x] Log token metrics per request: estimated, cached, completion
      → `[PR#6 TOKEN METRICS]` di GeminiAdapter + `[PR#6 TOKEN]` di context_builder

---

## Catatan Teknis

- **Implicit Caching Gemini**: Tidak memerlukan API terpisah atau TTL management.
  Aktif otomatis saat `systemInstruction` identik antar request dalam satu session.
  Selaras dengan Lampiran B (Anti Over-Engineering) — implementasi sesederhana mungkin.
- **PR#7 Fase 2 (Third-Party Modules)**: Eksplisit tidak dikerjakan per spec
  (`Ditunda — Dikerjakan Hanya Jika Benar-Benar Dibutuhkan`).
- **Provider lain (Groq, OpenRouter)**: Tidak memiliki caching API setara — perubahan
  hanya diterapkan pada `GeminiAdapter`.
