# Retrieval Tier Architecture — Design Document

**Status:** ✅ **Selesai Penuh (Fase 1, 2, & 3 — 2026-09-03)**: Tier 1 lokal, Tier 2 internal fallback, dan Tier 3 Web Comparison aktif dengan gerbang konfirmasi Owner (Human-in-Command).
**Changelog:** [`docs/project-memory/changelog/2026-09-02-pr9-retrieval-tier-fase1-selesai.md`](../project-memory/changelog/2026-09-02-pr9-retrieval-tier-fase1-selesai.md), [`docs/project-memory/changelog/2026-09-02-pr9-retrieval-tier-fase2-selesai.md`](../project-memory/changelog/2026-09-02-pr9-retrieval-tier-fase2-selesai.md), [`docs/project-memory/changelog/2026-09-03-tahap3-web-comparison-service.md`](../project-memory/changelog/2026-09-03-tahap3-web-comparison-service.md)
**Konteks:** Perluasan cakupan PR#5 (Adaptive Retrieval Strategy) dari retrieval satu-jalur (lokal saja) menjadi sistem retrieval bertingkat (lokal → pengetahuan internal LLM → web), agar tidak terjadi rework saat Tier 2/3 dibangun di kemudian hari.
**Prinsip yang diikuti:** One File One Responsibility, Architecture over Implementation, Borrowed CPU Principle.

---

## 1. Latar Belakang

Audit terhadap PR#5 menemukan bahwa `RetrievalStrategyService.apply()` sudah punya logika matang untuk retrieval lokal (Case A/B: neighbor expansion, full-document read, diversity-aware limiting), tetapi belum tersambung karena `AssistantService.js` belum punya jalur suplai chunk (`document_chunks`) yang terpisah dari sistem memory (`user_memories`).

Diskusi lanjutan mengarah ke kebutuhan yang lebih luas: retrieval pengetahuan seharusnya mengikuti pola bertingkat, mirip pola `SkillRegistry.matchTrigger()` — cek sumber lokal dulu, baru fallback ke sumber lain jika lokal tidak memadai.

Dokumen ini mendefinisikan **kontrak antar-tier** terlebih dahulu, supaya implementasi Tier 1 (yang gap-nya sudah konkret dan siap dikerjakan) tidak perlu dibongkar ulang ketika Tier 2 dan Tier 3 dirancang.

---

## 2. Tiga Tier Retrieval

| Tier | Sumber | Sifat | Status Kesiapan |
|---|---|---|---|
| **Tier 1 — Lokal** | `document_chunks` / `documents` (Supabase), diproses via **Edge Function `context_builder.ts`** & `RetrievalOrchestrator.js` | Primer, paling dipercaya, milik sendiri | ✅ **Selesai (Fase 1, 2026-09-02)**: terintegrasi untuk mode Assistant & Engineer via `context_builder.ts`, timeout 5s, fallback eksplisit, dan `RetrievalOrchestrator.js` di client. *(Catatan: evaluasi biaya CP9 berbasis kalkulasi/proyeksi teoretis).* |
| **Tier 2 — Internal LLM** | Pengetahuan bawaan model via `InternalKnowledgeFallbackService.js` & `RetrievalOrchestrator.js` | Fallback saat Tier 1 kurang/kosong (`sufficiency < 0.4`) | ✅ **Selesai (Fase 2, 2026-09-02)**: `InternalKnowledgeFallbackService.js` aktif, transisi otomatis di `RetrievalOrchestrator`, timeout 20s, format atribusi `[Sumber: Pengetahuan internal model]`, event telemetri dengan `traceId`, dan validasi `CHECK_002B` di `verification_engine.ts`. |
| **Tier 3 — Web** | Web search | Pembanding — up-to-date tapi tidak 100% akurat, tidak boleh dipercaya penuh tanpa penanda | ✅ **Selesai (Fase 3, 2026-09-03)**: `WebComparisonService.js` aktif, gerbang konfirmasi Owner (`Retrieval:RequestWebConfirmation`), timeout 8s, format atribusi `[Sumber: Web — {source_url}, akurasi tidak terverifikasi]`, fallback transparan, dan terdaftar di Kernel Phase 3. |

**Prinsip transisi antar-tier:** setiap tier hanya aktif jika tier sebelumnya tidak memenuhi ambang kecukupan (*sufficiency threshold*), bukan berjalan paralel secara default. Ini penting untuk efisiensi token (selaras PR#6) dan menghindari pemanggilan web yang tidak perlu.

---

## 3. Kontrak Antar-Tier (Interface)

Supaya Tier 2/3 bisa "plug-in" tanpa mengubah struktur Tier 1, setiap tier — apa pun sumbernya — harus mengembalikan bentuk data yang seragam:

```javascript
{
  chunks: Array<{
    content: string,
    source_type: 'local' | 'llm_internal' | 'web',
    source_url?: string,       // wajib untuk 'local' dan 'web', kosong untuk 'llm_internal'
    similarity?: number,       // hanya relevan untuk 'local'
    retrieved_at?: string
  }>,
  strategy: string,            // penanda strategi yang dipakai tier ini
  sufficiency: number,         // skor 0–1, dipakai tier berikutnya untuk memutuskan lanjut atau berhenti
  tier: 1 | 2 | 3
}
```

**Field kunci: `sufficiency`.**
Ini yang belum ada di `RetrievalStrategyService.apply()` saat ini dan perlu ditambahkan sebagai bagian dari implementasi Tier 1 — bukan field baru yang dipaksakan belakangan. Sumber nilainya bisa diturunkan dari data yang sudah ada:
- Dari `strategy` hasil `_detectCase()` (`'empty'` → sufficiency 0; `'case_a_full_read'` → sufficiency tinggi).
- Dari rata-rata `similarity` chunk yang terpilih.

**Atribusi sumber di prompt LLM (`formatAsContext`):**
Format markdown yang sudah ada (`--- Konteks {i+1} [Sumber: {source_url}] ---`) perlu **diperluas**, bukan diganti, untuk menandai `source_type`:
```
--- Konteks {i+1} [Sumber: Lokal — {source_url}] ---
--- Konteks {i+1} [Sumber: Pengetahuan internal model] ---
--- Konteks {i+1} [Sumber: Web — {source_url}, akurasi tidak terverifikasi] ---
```
Ini menjaga kejujuran asal jawaban ke user — prinsip yang sudah berjalan di PR#4 tetap dipertahankan, hanya diperluas cakupannya.

---

## 4. Kriteria Transisi Antar-Tier (Draft — perlu ditinjau)

| Transisi | Kondisi Pemicu (usulan awal) |
|---|---|
| Tier 1 → Tier 2 | `sufficiency < 0.4` ATAU `strategy === 'empty'` (chunks kosong sama sekali) |
| Tier 2 → Tier 3 | LLM sendiri menandai ketidakyakinan atas jawaban internal (mekanisme deteksi ini belum ditentukan — lihat Open Question di §6) |
| Tier 3 aktif tapi hasil tetap tidak memadai | Tampilkan ke user bahwa jawaban tidak dapat diverifikasi penuh, alih-alih memaksakan jawaban |

Angka threshold (`0.4`) — **starting point yang disepakati**, perlu divalidasi dengan data nyata setelah Tier 1 berjalan, bukan angka final.

---

## 5. Pemetaan File — One File One Responsibility

Prinsip: setiap tier punya *service* sendiri yang bertanggung jawab tunggal atas sumbernya. Tidak ada satu file yang mengurus lebih dari satu tier.

| File | Tanggung Jawab | Status |
|---|---|---|
| `context_builder.ts` (Edge Function) | **Tier 1** — titik eksekusi utama server-side: memanggil strategi retrieval, menerapkan timeout, dan menjalankan fallback saat gagal | Sudah ada (keyword search dasar), perlu diperluas dengan strategi Case A/B, timeout, dan fallback |
| `RetrievalStrategyService.js` | Logika strategi retrieval (Case A/B: neighbor expansion, full-document read, diversity limiting) — **dipanggil dari dalam Edge Function** via import, bukan lagi dari `AssistantService.js` di client | Sudah ada, perlu tambah `sufficiency` scoring; **tetap file terpisah, di-import oleh `context_builder.ts`** — perlu dipastikan kompatibel dengan runtime Deno (tidak memakai API khusus Node/browser) |
| `KnowledgeService.js` | Query mentah ke `document_chunks`/`documents` — perannya menyempit jadi dipanggil dari sisi Edge Function via import, bukan lagi dipanggil langsung dari `AssistantService.js` | Perlu refactor dari `ilike`/`knowledge_base` legacy; **tetap file terpisah, di-import oleh `context_builder.ts`** — sama seperti `RetrievalStrategyService.js`, perlu dipastikan kompatibel Deno |
| *(baru)* `InternalKnowledgeFallbackService.js` | **Hanya** Tier 2 — logika keputusan "apakah pengetahuan internal LLM cukup", tanpa strategi retrieval lokal maupun web | Belum ada — desain di fase selanjutnya |
| *(baru)* `WebComparisonService.js` | **Hanya** Tier 3 — pemanggilan web search dengan timeout, fallback saat gagal, dan penandaan hasil sebagai "tidak terverifikasi penuh" | Belum ada — desain di fase selanjutnya |
| `RetrievalOrchestrator.js` | **Hanya** mengatur urutan pemanggilan tier 1→2→3 berdasarkan `sufficiency`, menggabungkan hasil akhir sebelum diteruskan ke `AssistantService` | **Dibangun di Fase 1** sebagai kerangka kosong di sisi client — untuk Fase 1, isinya membungkus **pemanggilan ke Edge Function** (bukan langsung ke `RetrievalStrategyService`), belum ada logic switching aktif |
| `AssistantService.js` | Tetap hanya orkestrasi percakapan — memanggil `RetrievalOrchestrator` (bukan tier individual, bukan Edge Function langsung), lalu suntik hasil ke prompt | Titik integrasi tunggal, tidak berubah struktur besar |

**Catatan penting:** `RetrievalOrchestrator.js` sengaja dipisah dari `AssistantService.js` supaya logic percabangan tier tidak menumpuk di file yang sudah besar — ini langsung mengantisipasi risiko *God File* yang sudah pernah teridentifikasi di audit `engineer.js` sebelumnya.

**Keputusan packaging (§6 poin 4, ditegaskan lebih lanjut):** `RetrievalStrategyService.js` dan `KnowledgeService.js` **tetap sebagai file terpisah**, di-*import* oleh `context_builder.ts` — bukan dipindah/ditulis ulang menyatu ke dalam Edge Function. Konsekuensi teknis yang perlu diperhatikan saat implementasi: kedua file ini harus dipastikan tidak memakai API yang hanya tersedia di Node.js/browser (mis. modul `fs`, `window`, dependency npm yang tidak kompatibel Deno) — kalau ada, bagian itu perlu diisolasi atau disesuaikan agar tetap bisa di-*import* langsung tanpa perlu ditulis ulang total.

---

## 6. Open Questions (Perlu Keputusan Sebelum Tier 2/3 Dirancang Detail)

1. **Mekanisme deteksi "LLM tidak yakin" untuk transisi Tier 2 → Tier 3** — riset menunjukkan pola umum industri berupa *layered confidence checkpoints* alih-alih satu mekanisme tunggal:
   - **Checkpoint retrieval:** skor kecukupan dihitung dari hasil retrieval itu sendiri (mirip `sufficiency` di §3). Beberapa implementasi enterprise (mis. Azure AI Search, dibahas di artikel Microsoft Community Hub soal *Confidence-Aware RAG*) memakai skor reranking numerik untuk menilai relevansi dokumen sebelum diteruskan ke LLM, sebagai checkpoint pertama sebelum jawaban dibentuk.
   - **Checkpoint abstention LLM:** model diminta secara eksplisit menyatakan ketidakyakinan lewat prompting, alih-alih membiarkan jawaban "terdengar yakin" padahal tidak didukung data yang diambil — pola ini dikenal sebagai upaya mengatasi apa yang disebut *hallucination laundering* (jawaban terlihat berbasis fakta padahal tidak benar-benar didukung bukti).
   - **Pola fallback bertingkat serupa** sudah dipakai di riset lain (SemEval-2025, HalluSearch pipeline): query dipersempit dulu lewat ekstraksi kata kunci sebelum fallback ke LLM murni, dan hasil dari LLM murni secara eksplisit ditandai kurang dapat diandalkan secara faktual dibanding hasil retrieval — sejalan dengan pendekatan penandaan sumber yang sudah dirancang di §3 (`source_type`).

   **Implikasi untuk desain kita:** mekanisme deteksi confidence sebaiknya **tidak** hanya mengandalkan LLM menilai dirinya sendiri, tapi kombinasi (a) skor kecukupan dari data retrieval Tier 1 (`sufficiency`, sudah ada di kontrak §3) dan (b) instruksi eksplisit ke LLM untuk menyatakan abstain/tidak yakin saat Tier 2 dipakai — bukan heuristik tunggal yang dikarang sendiri tanpa dasar. Ini masih perlu disesuaikan dengan kondisi nyata Mamet Ecosystem (mis. model apa yang dipakai, apakah mendukung structured abstention), jadi belum final secara angka/threshold — tapi arah desainnya sudah berbasis pola yang teruji di industri, bukan tebakan.

   *Sumber: "Confidence-Aware RAG" (Microsoft Community Hub); "HalluSearch" SemEval-2025 Task 3 (arXiv 2504.10168).*
2. ~~Siapa yang memicu web search~~ — **Diputuskan:** web search (Tier 3) wajib melalui konfirmasi user terlebih dahulu, tidak dipanggil otomatis oleh sistem. Sejalan dengan prinsip *Human in Command*. Implikasi: `WebComparisonService.js` (Fase 3) perlu jalur untuk menampilkan prompt konfirmasi ke user sebelum eksekusi, dan `RetrievalOrchestrator.js` harus bisa "pause" menunggu respons user saat transisi Tier 2 → Tier 3 terpicu.
3. ~~Biaya & latensi Tier 3~~ — **Diputuskan:** web search wajib punya batas waktu (timeout **8–10 detik**, lihat §8). Jika pencarian gagal atau timeout, LLM **tetap harus jujur** ke user — tidak boleh memaksakan jawaban seolah-olah didukung data web padahal pencarian gagal. Implikasi teknis:
   - `WebComparisonService.js` (Fase 3) perlu mekanisme timeout eksplisit pada pemanggilan web search, dengan nilai batas yang perlu ditentukan saat implementasi (bukan dibiarkan tanpa batas).
   - Saat timeout/gagal, hasil yang diteruskan ke `RetrievalOrchestrator.js` harus secara eksplisit menandai kegagalan (bukan mengembalikan `chunks` kosong secara diam-diam), supaya `AssistantService.js` bisa menyampaikan ke user bahwa pencarian web tidak berhasil — selaras dengan prinsip atribusi sumber di §3 (`source_type`), dan mencegah pola *hallucination laundering* yang sudah disinggung di poin 1.
   - Fallback saat gagal: jawaban tetap disusun dari Tier 1/Tier 2 yang sudah ada, dengan disclaimer eksplisit bahwa perbandingan web tidak berhasil dilakukan.
4. ~~Duplikasi dengan RAG server-side~~ — **Diputuskan:** Tier 1 memakai **Edge Function (`context_builder.ts`, server-side)** sebagai sumber utama, bukan `RetrievalStrategyService` di client. Keputusan ini mengubah beberapa hal dari desain awal dokumen ini — lihat catatan revisi di §5 dan §7. Ketentuan tambahan:
   - **Mekanisme fallback wajib ada:** jika pemanggilan Edge Function gagal, user tetap harus mendapat hasil (tidak boleh kosong tanpa penjelasan) — konsisten dengan prinsip kejujuran yang sama seperti kegagalan Tier 3 (lihat poin 3).
   - **Timeout wajib ada** pada pemanggilan Edge Function: **5 detik** (lihat §8). Catatan penting: Supabase Edge Function punya limit CPU time terakumulasi hanya 2 detik (terpisah dari limit wall-clock 150 detik) — perlu diperhatikan saat load testing agar `context_builder.ts` tidak throttle akibat komputasi berat sebelum mencapai batas 5 detik ini.
   - **Load testing biaya wajib dilakukan** sebelum Fase 1 dianggap selesai — pengujian sederhana untuk memastikan biaya Edge Function tidak membengkak akibat frekuensi pemanggilan tinggi. Ini masuk sebagai item kerja eksplisit di roadmap Fase 1 (§7), bukan asumsi bahwa biaya otomatis aman.

---

## 7. Roadmap Bertahap

### Fase 1 — Tier 1 (Lokal via Edge Function), dengan slot kontrak untuk Tier 2/3

**Cakupan diperluas (keputusan tambahan setelah audit Checkpoint 1):** audit implementasi menemukan `context_builder.ts` sebenarnya punya **dua jalur RAG paralel** yang keduanya belum tersambung ke `RetrievalStrategyService.apply()`:
- **Mode Assistant/Lite** — query `ilike` inline langsung di `context_builder.ts` (hanya ambil `content, document_id`, field atribusi sumber PR#4 hilang).
- **Mode Engineer** — lewat `document_search.ts` (vector search RPC `match_documents`, sudah ada dedup + hybrid re-ranking, lebih matang secara teknis).

**Diputuskan:** Fase 1 mencakup **kedua mode sekaligus**, termasuk perubahan pada `context_builder.ts` itu sendiri (bukan hanya `KnowledgeService.js`) — karena kedua jalur sama-sama perlu tersambung ke `RetrievalStrategyService.apply()` agar Tier 1 benar-benar konsisten di seluruh mode sistem, bukan hanya salah satunya.

Pembagian tanggung jawab hasil sinkronisasi:
- **`KnowledgeService.js` (refactor)** — Query Abstraction Layer universal, memastikan field kontrak PR#4/PR#5 (`id, document_id, content, source_url, source_type, similarity`) selalu diambil konsisten, dipakai oleh jalur Assistant/Lite.
- **`document_search.ts`** — **dipertahankan**, tetap bertanggung jawab atas vector search RPC + dedup untuk mode Engineer, tapi hasilnya disalurkan lewat `RetrievalStrategyService.apply()` sebelum diformat ke prompt (bukan diganti total).
- **`RetrievalStrategyService.js`** — tetap satu-satunya pemilik logic Case A/B dan `sufficiency` scoring, menerima raw chunks dari kedua sumber di atas.
- **`context_builder.ts`** — blok query inline (mode Assistant/Lite) diganti dengan pemanggilan terstruktur via `KnowledgeService` + `RetrievalStrategyService.apply()`; blok mode Engineer diubah agar hasil `document_search.ts` juga disalurkan lewat `RetrievalStrategyService.apply()` sebelum dipakai.

Karena `context_builder.ts` adalah file inti yang mempengaruhi seluruh alur chat (bukan hanya RAG), perubahan pada mode Assistant/Lite dan mode Engineer dikerjakan sebagai checkpoint terpisah dan diverifikasi masing-masing sebelum digabung — bukan satu patch besar sekaligus.

Daftar kerja Fase 1 (Selesai 2026-09-02, lihat changelog: [`2026-09-02-pr9-retrieval-tier-fase1-selesai.md`](../project-memory/changelog/2026-09-02-pr9-retrieval-tier-fase1-selesai.md)):
- ✅ **Audit Deno (CP1):** Dipastikan kompatibilitas runtime, identifikasi gap import Vite di `KnowledgeService.js`.
- ✅ **Refactor `KnowledgeService.js` (CP2):** Universal ES module, Dependency Injection `supabaseClient`, target `document_chunks` / `documents`, return `Array<ChunkObject>`.
- ✅ **Mode Assistant/Lite di `context_builder.ts` (CP3):** Ganti query inline ad-hoc dengan `KnowledgeService` + `RetrievalStrategyService.apply()`.
- ✅ **Mode Engineer di `context_builder.ts` (CP4):** Pertahankan `document_search.ts`, salurkan hasilnya ke `RetrievalStrategyService.apply()`.
- ✅ **`sufficiency` Scoring & Kontrak Tier (CP5):** Skor `0.0–1.0` (50% strategi + 50% similarity, threshold awal 0.4), metadata `tier: 1`, format `source_type`.
- ✅ **Timeout 5s & Explicit Fallback (CP6):** `Promise.race` timeout 5 detik pada `ragPromise`, status failure dicatat transparan di `ctx.state.tier1Retrieval`.
- ✅ **Bangun `RetrievalOrchestrator.js` (CP7):** Client-side wrapper di `frontend/src/core/runtime/services/RetrievalOrchestrator.js`, terdaftar di `Kernel.js` Phase 3.
- ✅ **Sambungkan `AssistantService.js` (CP8):** Integrasi titik tunggal ke `RetrievalOrchestrator.retrieve()`, memisahkan memory dan knowledge.
- ✅ **Load Testing Biaya (CP9 — Proyeksi Teoretis):** Analisis profil beban dan proyeksi teoretis 10.000 turn/bulan (~2% kuota Supabase, $0.00 mode Assistant, ~$0.06 mode Engineer). *(Catatan: stress testing live aktif bersifat opsional/pending).*

### Fase 2 — Tier 2 (Internal LLM Fallback) — ✅ SELESAI (2026-09-02)
- ✅ **Bangun `InternalKnowledgeFallbackService.js` (CP1):** Service terpisah untuk mengelola fallback directive, timeout 20s, dan atribusi sumber `llm_internal`.
- ✅ **Integrasi `RetrievalOrchestrator.js` (CP2):** Transisi otomatis saat Tier 1 `sufficiency < 0.4`, 0 chunks, atau error/timeout; format atribusi `[Sumber: Pengetahuan internal model]`.
- ✅ **Telemetri & Observabilitas (CP2):** Event `Retrieval:Tier2Fallback` memuat `traceId`, `query`, dan `sufficiency` untuk pelacakan di `cost_ledger`.
- ✅ **Extend `verification_engine.ts` (CP3):** Menambahkan `CHECK_002B_INTERNAL_KNOWLEDGE_DISCLAIMER` untuk memvalidasi bahwa LLM mengakui keterbatasan pengetahuan parametrik saat Tier 2 aktif.

### Fase 3 — Tier 3 (Web Comparison) — ✅ SELESAI (2026-09-03)
- ✅ **Bangun `WebComparisonService.js` (CP1):** Service terpisah untuk eksekusi web search, manajemen timeout 8s, dan penandaan hasil `source_type: 'web'`.
- ✅ **Selesaikan Open Question #2 dan #3 (CP2):** Gerbang konfirmasi Owner (`Retrieval:RequestWebConfirmation` / Human-in-Command) dan timeout 8s dengan fallback transparan.
- ✅ **Perluas `RetrievalOrchestrator.js` (CP3):** Transisi berjenjang Tier 1 → Tier 2 → Tier 3 dengan fallback disclaimer jika web search ditolak/timeout/gagal.
- ✅ **Perluas `formatAsContext()` (CP4):** Penandaan eksplisit `[Sumber: Web — {source_url}, akurasi tidak terverifikasi]` di prompt LLM.
- ✅ **Registrasi Kernel.js Phase 3 (CP5):** Didaftarkan resmi di `Kernel.js` berdampingan dengan `RetrievalOrchestrator`.

---

## 8. Yang Belum Diputuskan (Menunggu Arahan)

- ~~Pilihan arsitektur lokasi RAG~~ — **Sudah diputuskan** (lihat §6 poin 4): Edge Function `context_builder.ts`, server-side, dengan fallback dan timeout wajib, plus load testing biaya sebagai syarat Fase 1.
- ~~Apakah `RetrievalStrategyService.js`/`KnowledgeService.js` dipindah atau tetap terpisah~~ — **Diputuskan:** tetap file terpisah, di-*import* oleh `context_builder.ts` (lihat §5).
- ~~Threshold `sufficiency` final~~ — **Diputuskan:** mulai dari **0.4** sebagai starting point (bukan angka final), divalidasi ulang dengan data nyata setelah Tier 1 berjalan di Fase 1 (lihat §4).
- ~~Nilai batas waktu (timeout) konkret~~ — **Diputuskan**, berdasarkan referensi standar industri (AWS Lambda, Apigee, Telnyx Edge Compute) dan batasan spesifik platform Supabase:
  - **Edge Function `context_builder.ts` (query DB lokal):** timeout **5 detik**. Catatan penting: Supabase Edge Function punya limit CPU time terakumulasi hanya **2 detik** (terpisah dari limit wall-clock 150 detik untuk `fetch()`) — kalau `context_builder.ts` melakukan komputasi berat (bukan cuma menunggu I/O), bisa throttle jauh sebelum mencapai 5 detik. Ini perlu diperhatikan saat load testing di Fase 1.
  - **Web search (Tier 3, third-party):** timeout **8–10 detik** — lebih longgar karena API pihak ketiga biasanya lebih lambat dari query DB internal.
- ~~Apakah `RetrievalOrchestrator.js` dibangun sekarang atau ditunda~~ — **Diputuskan:** dibangun sekarang di Fase 1 sebagai kerangka kosong (belum ada logic tier-switching aktif, karena baru 1 tier yang jalan). Tujuannya supaya saat Fase 2 dimulai, sudah jelas file mana yang menjadi titik pemakaian/perluasan — tidak perlu dicari atau dibuat baru dari nol.

