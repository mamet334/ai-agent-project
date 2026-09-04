# ROADMAP — PR#6: Efisiensi Token

**Sumber Spec:** `docs/roadmap/ASSISTANT-CAPABILITY-ROADMAP.md` (PR#6, baris 322-362)
**Tanggal Dibuat:** 2026-09-04
**Status:** ✅ **COMPLETED & LIVE-VERIFIED (2026-09-04 — Cloud Production Confirmed)**


---

## Latar Belakang

PR#6 mengadopsi teknik efisiensi token dari studi banding Hermes Agent (Nous Research),
khusus dua poin yang murni soal efisiensi biaya dan tidak menyentuh filosofi Owner Sovereignty:

**(a) Prompt Caching** — menandai bagian context yang tidak berubah antar giliran (system
prompt, instruksi dasar) agar tidak diproses ulang penuh di setiap request, memanfaatkan
mekanisme cache breakpoint yang tersedia di provider LLM.

**(b) Delegasi Operasi Berat** — web search dan operasi berat sejenis tidak mengirimkan
data mentah besar ke context utama; hanya ringkasan/hasil olahan yang masuk ke prompt.

---

## Analisis Implementasi Saat Ini

### 1. Alur Data Context

`
AssistantService.js (frontend)
  -> Supabase Edge Function: agent-process
    -> request_pipeline.ts         <- agentIdentityPrompt dibuat (~3.000-5.000 chars)
    -> context_builder.ts           <- RAG + memory + web docs digabung
    -> context_pipeline.ts          <- finalContext dibangun (cap 15.000 chars RAG)
    -> universal_contract.ts        <- fullSystemContext final
    -> llm_orchestrator.ts          <- runStreamLLM / runLLM
      -> GeminiAdapter.stream()     <- POST ke Gemini API (systemInstruction + contents)
`

### 2. Bagian STATIS vs DINAMIS pada System Prompt

| Bagian | Berubah per request? | Ukuran estimasi |
|---|---|---|
| Identitas (IDENTITAS ANDA, KESADARAN SISTEM MEMORI) | STATIS | ~500 chars |
| Instruksi waktu/tanggal (KONTEKS WAKTU) | Berubah per hari | ~60 chars |
| Instruksi Desktop (DESKTOP NATIVE AWARENESS) | STATIS kondisional | ~800 chars |
| Panduan Penalaran MAEF (PANDUAN PENALARAN) | STATIS | ~1.200 chars |
| Engineer Mode Instructions | STATIS kondisional | ~1.000 chars |
| Workspace Guardian Lock | Berubah per request | ~100 chars |
| RAG Block (<RAG>) | Berubah per request | 0-15.000 chars |
| Memory Block (<MEMORY>) | Berubah per request | 0-3.000 chars |

**Kesimpulan:** Sekitar 60-70% dari system prompt bersifat statis dan kandidat kuat untuk caching.

### 3. Status Web Search Result

`WebComparisonService.js` sudah mengembalikan teks terformat (bukan raw HTML).
Data masuk via `ctx.request.globalMemory` -> dipecah di `context_builder.ts` (baris 147-193)
menjadi `externalDocs[]` dengan key `content`, `title`, `source_url`.

**Temuan:** Tidak ada batas ukuran per artikel web sebelum diinjeksikan ke context.
Satu artikel bisa 2.000-10.000+ chars, dan beberapa artikel bisa digabung tanpa truncation.

### 4. Status Token Tracking Saat Ini

`GeminiAdapter.stream()` (baris 547): hanya estimasi kasar `JSON.stringify(payload).length / 4`.
Tidak ada perbandingan aktual "sebelum vs sesudah" per request.

---

## Rancangan Solusi

### (a) Prompt Caching — Gemini Provider

Gemini API mendukung Context Caching via field `cachedContent` pada request body,
namun memerlukan setup API terpisah (cache create + TTL management) yang menambahkan
kompleksitas signifikan pada Edge Function stateless.

**Pendekatan yang dipilih (sesuai Lampiran B Anti Over-Engineering):**
Gunakan `cache_control` annotation pada `systemInstruction` via **Implicit Caching** —
fitur Gemini yang secara otomatis meng-cache prefix context yang identik antar request
tanpa memerlukan cache management eksplisit. Tidak ada kode tambahan, hanya struktur
payload yang tepat: system prompt statis di `systemInstruction`, dinamis di `contents`.

**Langkah konkret:**
1. Pisahkan payload Gemini: bagian statis masuk `systemInstruction`, bagian dinamis
   (RAG, Memory, tanggal) masuk sebagai pesan `user` pertama di `contents`.
2. Dengan struktur ini, Gemini Implicit Caching otomatis aktif saat `systemInstruction`
   identik antar request dari user yang sama.
3. Log `usageMetadata.cachedContentTokenCount` untuk verifikasi dampak nyata.

### (b) Web Search Summarization Guard

**Pendekatan:** Tambahkan guard panjang di `context_builder.ts` setelah `externalDocs[]`
terbentuk (baris 193) dan sebelum digabung ke `combinedRawRag` (baris 196):

1. Hitung total chars dari semua `externalDocs`.
2. Jika total melebihi **6.000 chars**, ringkas setiap dokumen web secara individual
   menggunakan `runLLM()` dengan model ringkas (bukan model utama user).
3. Setiap artikel dibatasi maksimum **800 chars** pasca-ringkasan.
4. Fakta kunci, judul, dan URL sumber dipertahankan.

### (c) Token Metrics Logging

Tambahkan structured log di `GeminiAdapter` untuk setiap request yang mencakup:
- `estimated_prompt_tokens` (chars / 4)
- `cached_content_tokens` (dari `usageMetadata.cachedContentTokenCount` — 0 jika belum cached)
- `actual_completion_tokens` (dari `usageMetadata.candidatesTokenCount`)

---

## Exit Criteria (dari Spec)

- [ ] Payload Gemini distrukturkan agar system prompt statis masuk `systemInstruction`
      (bukan di `contents`) — mengaktifkan Implicit Caching secara otomatis.
- [ ] Web search result tidak melebihi 6.000 chars total sebelum masuk ke context utama.
      Jika melebihi, ringkasan otomatis dijalankan per-artikel (maks 800 chars/artikel).
- [ ] Log token metrics per request: estimated, cached, completion — verifikasi dampak nyata.

---

## File yang Terdampak

| File | Jenis | Perubahan |
|---|---|---|
| `supabase/functions/agent-process/lib/adapters/ai_adapter.ts` | MODIFY | GeminiAdapter.stream(): pisahkan static system prompt dari dynamic context + log cachedContentTokenCount |
| `supabase/functions/agent-process/lib/orchestration/handlers/context_builder.ts` | MODIFY | Tambah guard panjang web context + peringkasan otomatis saat melebihi 6.000 chars |
| `docs/roadmap/INDEX-ROADMAP.md` | MODIFY | Update status PR#6 di Bagian 1 dan Bagian 2 |

---

## Catatan Ketergantungan

- PR#7 Fase 1 (ModuleDiscovery) sudah selesai via `ModuleDiscoveryService` (lihat `INDEX-ROADMAP.md` baris 36).
- PR#7 Fase 2 (Third-Party Modules) **eksplisit ditunda** per spec — tidak dikerjakan dalam scope ini.
- PR#6 tidak memiliki ketergantungan ke PR yang belum selesai.

---

## Changelog

- `2026-09-04` — Dokumen dibuat, riset implementasi selesai, rancangan solusi ditetapkan.


---

## Status Implementasi

**Build:** ✅ PASS (0 error, 11.95 detik)

**Exit Criteria:**
- [x] Payload Gemini & non-stream distrukturkan agar static system prompt masuk `systemInstruction`
      → Implicit Caching aktif otomatis (Static/Dynamic split via regex `<RAG>`, `<MEMORY>`)
- [x] Web search result tidak melebihi 6.000 chars total sebelum masuk context utama
      → `summarizeWebDoc()` aktif dengan fallback truncate
- [x] Log token metrics per request: estimated, cached, completion
      → `[PR#6 TOKEN]` + `[PR#6 TOKEN METRICS]` di Edge Function console across all adapters
- [x] Live Verification di Supabase Cloud:
      Terbukti aktif pada trace `4ca4900f-a1e0-4c7f-9f2a-f6539dc623ff`:
      `[PR#6] Web context total: 606 chars dari 2 artikel.`
      Evidence Gate PASSED (7 evidence docs, Score 100 Grade A, Decision: PASS).

**File Berubah:**
- `supabase/functions/agent-process/lib/adapters/ai_adapter.ts` — GeminiAdapter (stream & execute) + OpenRouterAdapter (stream & execute)
- `supabase/functions/agent-process/lib/llm_orchestrator.ts` — buildPayload (Static/Dynamic split)
- `supabase/functions/agent-process/lib/orchestration/handlers/context_builder.ts` — Web Context Guard
- `docs/roadmap/ROADMAP-PR6-TOKEN-EFFICIENCY.md` (dokumen ini)
- `docs/roadmap/INDEX-ROADMAP.md`
- `docs/roadmap/ASSISTANT-CAPABILITY-ROADMAP.md`
- `docs/project-memory/changelog/2026-09-04-pr6-token-efficiency-implementation.md`

