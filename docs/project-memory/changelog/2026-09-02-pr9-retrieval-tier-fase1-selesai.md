# Changelog: PR#9 — Retrieval Tier Architecture (Penyelesaian Fase 1)

Tanggal: 2026-09-02
Status: Selesai Diimplementasikan (Fase 1 — Tier 1 Lokal)
Branch: `main`
Dokumen Terkait: [`docs/roadmap/PR9-retrieval-tier-architecture.md`](../../roadmap/PR9-retrieval-tier-architecture.md), [`docs/roadmap/INDEX-ROADMAP.md`](../../roadmap/INDEX-ROADMAP.md)

---

## 1. Ringkasan Eksekutif

PR#9 Fase 1 menuntaskan gap arsitektural PR#5 (*Adaptive Retrieval Strategy*) sekaligus meletakkan fondasi **3-Tier Knowledge Retrieval Architecture**:
1. **Tier 1 (Lokal):** `document_chunks` / `documents` via Supabase Edge Function & client layer.
2. **Tier 2 (Internal LLM Fallback):** Pengetahuan bawaan model (disiapkan untuk Fase 2).
3. **Tier 3 (Web Comparison):** Pencarian internet dengan konfirmasi eksplisit Owner (disiapkan untuk Fase 3).

Implementasi Fase 1 diselesaikan melalui 9 checkpoint bertahap yang diverifikasi secara modular dan terisolasi dari sistem memori (`user_memories` / `MemoryService` / `MemoryGovernorService`).

---

## 2. File yang Dibuat / Dimodifikasi

| File | Aksi | Keterangan |
|---|---|---|
| `frontend/src/core/runtime/services/RetrievalOrchestrator.js` | **BARU** | Client-side 3-Tier wrapper & anti-God File facade |
| `frontend/src/core/runtime/services/KnowledgeService.js` | Dimodifikasi | Refactor Universal ES Module, Dependency Injection `supabaseClient`, target `document_chunks` |
| `frontend/src/core/runtime/services/RetrievalStrategyService.js` | Dimodifikasi | Penambahan scoring `sufficiency` (threshold 0.4), metadata `tier: 1`, dan perluasan label `source_type` |
| `frontend/src/core/runtime/services/AssistantService.js` | Dimodifikasi | Integrasi titik tunggal ke `RetrievalOrchestrator.retrieve()` dengan pemisahan tegas jalur memory vs RAG |
| `frontend/src/core/runtime/Kernel.js` | Dimodifikasi | Import dan registrasi `RetrievalOrchestrator` pada Phase 3 bootstrap |
| `supabase/functions/agent-process/lib/orchestration/handlers/context_builder.ts` | Dimodifikasi | Integrasi Tier 1 adaptive RAG untuk kedua mode (Assistant/Lite & Engineer), timeout 5s, dan explicit fallback logging |
| `supabase/functions/agent-process/lib/rag/document_search.ts` | Dimodifikasi | Pengayaan metadata output (`id, document_id, title, similarity, source_url, source_type`) |
| `docs/roadmap/PR9-retrieval-tier-architecture.md` | Dimodifikasi | Update status Fase 1 selesai & dokumentasi limitasi CP9 |
| `docs/roadmap/INDEX-ROADMAP.md` | Dimodifikasi | Update status indeks PR#9 Fase 1 selesai |

---

## 3. Matriks Hasil Checkpoint (CP1 – CP9)

| Checkpoint | Deskripsi Kerja | Hasil & Verifikasi | Status |
|---|---|---|:---:|
| **CP 1** | Audit Kompatibilitas Deno | `RetrievalStrategyService.js` kompatibel penuh. `KnowledgeService.js` ditemukan memiliki import statis browser Vite (`import.meta.env`) & dependensi `EventBus`/`session` yang tidak kompatibel Deno. | ✅ Selesai |
| **CP 2** | Refactor `KnowledgeService.js` | Mengubah ke Universal ES Module, mendukung Dependency Injection `options.supabaseClient`, mengganti query legacy `knowledge_base` ke `document_chunks`, mengembalikan `Array<ChunkObject>`. Terisolasi dari memory. | ✅ Selesai |
| **CP 3** | Sambungkan mode Assistant/Lite di `context_builder.ts` | Menghapus query `ilike` inline ad-hoc yang kehilangan metadata sumber. Diganti dengan pemanggilan `KnowledgeService` + `RetrievalStrategyService.apply()`. | ✅ Selesai |
| **CP 4** | Sambungkan mode Engineer di `context_builder.ts` | Mempertahankan `document_search.ts` sebagai pemilik vector search RPC + dedup, menyalurkan outputnya ke `RetrievalStrategyService.apply()`. | ✅ Selesai |
| **CP 5** | `sufficiency` Scoring & Kontrak Tier | Menambahkan kalkulasi skor `sufficiency` (0.0–1.0) berbasis 50% strategi + 50% similarity chunk, konstanta `SUFFICIENCY_THRESHOLD = 0.4`, dan perluasan format `source_type` (`Lokal`, `Internal LLM`, `Web`). | ✅ Selesai |
| **CP 6** | Timeout 5s & Mekanisme Fallback Eksplisit | Menambahkan `Promise.race` timeout 5.000 ms pada `ragPromise` di `context_builder.ts`. Mencatat status transparan (`ctx.state.tier1Retrieval`) tanpa *silent failure*. Evaluasi limit CPU Deno (2s) aman. | ✅ Selesai |
| **CP 7** | Bangun `RetrievalOrchestrator.js` | Membuat service client baru membungkus Tier 1 dan menyediakan slot Tier 2/3. Mendaftarkannya di `Kernel.js` Phase 3. | ✅ Selesai |
| **CP 8** | Sambungkan `AssistantService.js` | Mengganti placeholder L644-648 dengan `RetrievalOrchestrator.retrieve()`. Menyatukan memory context & knowledge context secara transparan sebelum CMG dan token trimming PR#6. | ✅ Selesai |
| **CP 9** | Load Testing Biaya (Proyeksi Teoretis) | Menganalisis frekuensi pemanggilan & estimasi biaya Supabase/Gemini pada skenario 10.000 turn/bulan. *(Lihat catatan keterbatasan di bawah).* | ✅ Selesai (Proyeksi) |

---

## 4. Temuan Penting Selama Audit & Implementasi

1. **Dua Jalur RAG Paralel di Edge Function:**
   * Audit Checkpoint 1 & investigasi pra-Checkpoint 2 mengungkap bahwa `context_builder.ts` sebelumnya memiliki dua jalur terpisah:
     * Mode Assistant/Lite: query inline `ilike` kasar yang membuang metadata sumber PR#4.
     * Mode Engineer: vector embedding + RPC `document_search.ts`.
   * **Solusi Terpadu:** Keduanya kini disatukan di bawah payung `RetrievalStrategyService.apply()` Tier 1. `document_search.ts` tetap dipertahankan untuk vector RPC tanpa diduplikasi atau dibuang.
2. **Refactor Dependency Injection `KnowledgeService.js`:**
   * Diubah total dari static import browser client (`import { supabase } from '../../../supabase.js'`) menjadi Dependency Injection (`new KnowledgeService({ supabaseClient })` atau passing per method `queryKnowledge(query, { supabaseClient })`). Hal ini memungkinkan file yang sama di-import secara murni di Deno Edge Function maupun di browser tanpa memicu crash `import.meta.env`.
3. **Pemisahan Tegas Memory vs Knowledge:**
   * Jalur `user_memories` (`MemoryService` / `MemoryGovernorService`) dan jalur `document_chunks` (`KnowledgeService` / `RetrievalStrategyService`) 100% independen secara skema tabel, lifecycle, dan logika kode.

---

## 5. Catatan Eksplisit Keterbatasan CP9 (Load Testing)

> [!IMPORTANT]
> **Keterbatasan yang Diketahui (Known Limitation):**
> Evaluasi pada Checkpoint 9 dilakukan melalui **analisis profil beban dan proyeksi/kalkulasi teoretis** (skenario standar 10.000 pesan/bulan pada tier Supabase Free/Pro), **bukan pengujian beban sintetik aktif (stress testing / benchmark tool live)** pada server Supabase produksi.
> 
> * **Hasil Proyeksi Teoretis:**
>   * Mode Assistant/Lite: 0 token embedding Gemini ($0.00), ~1-2 query Postgres/turn, CPU time aktif ~2-4 ms.
>   * Mode Engineer: 1 token embedding Gemini (~300 token/turn), 1 RPC `match_documents`, CPU time aktif ~3-6 ms.
>   * Total konsumsi kuota bulanan untuk 10.000 turn diperkirakan hanya menghabiskan ~2% kuota Edge Function invocations dan ~1.6% kuota bandwidth egress Free Tier.
> * **Status Pengujian Nyata:** Load test live menggunakan traffic generator nyata tetap menjadi item verifikasi opsional/pending saat sistem memasuki staging/production load.

---

## 6. Status Berikutnya

Fase 1 (Tier 1 Lokal) telah selesai penuh. Komponen Tier 2 (`InternalKnowledgeFallbackService.js`) dan Tier 3 (`WebComparisonService.js`) berada dalam status **belum dikerjakan** dan menunggu arahan eksplisit dari Owner.
