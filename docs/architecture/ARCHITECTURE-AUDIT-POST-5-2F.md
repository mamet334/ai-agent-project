# Mamet AI — Architecture Gate Review (Post-Wave 5.2F)
**Target Audit:** LLM Execution / Coordinator Domain

---

## 1. Dependency Graph Audit
Berdasarkan kondisi *codebase* pasca Wave 5.2F, aliran eksekusi request sekarang membentuk topologi terarah (DAG) yang sangat rapi untuk fase pra-LLM:

\`\`\`text
HTTP Request
     │
     ▼
[ lib/request/request_pipeline.ts ] (Menangani Auth, CORS, Quota, Policy, Parsing, RuntimeContext Init)
     │
     ▼
[ lib/rag/rag_pipeline.ts ] (Menangani Vector Search, Global Memory, Deduplikasi, Fusion)
     │
     ▼
[ lib/verification/verification_pipeline.ts ] (Pre-Flight Hard Gate, Confidence Engine, Universal Contract)
     │
     ▼
[ index.ts (Remaining Monolith: Intent Router & Coordinator) ]
     │
     ├──► [ Intent Router ] ──(isChatBiasa)──► runLLM() ──► Post-Processing (Verification Soft Gate)
     │
     └──► [ Coordinator Loop ] ──► Sub-Agents ──► Reflection ──► runLLM()
             │
             ▼
[ lib/stream_handler.ts ] & [ lib/llm_orchestrator.ts ]
\`\`\`

**Status:**
- **Circular Dependency:** ZERO.
- **Hidden Dependency:** ZERO (Berkat `UnifiedExecutionContext` dan `RuntimeContext`).
- **Closure Leak:** ZERO.

---

## 2. LLM Execution Audit
Kode yang tersisa saat ini terbagi dalam beberapa lapisan logis yang masih tercampur di `index.ts` bagian bawah:

1. **Pure Logic:** Intent Router Regex & klasifikasi keyword, `extractSourceTrace` (parsing output), logika perulangan (Reflection Loop max 3 iterasi).
2. **Infrastructure:** Background Tasks (memanggil *Memory Queue* dan *Audit Persistence*).
3. **Transport:** Evaluasi *Stream* (`if (stream && !extractedImage)` memanggil `getStreamResponse`).
4. **Provider Adapter:** Abstrak, saat ini didelegasikan dengan baik ke `lib/llm_orchestrator.ts` (`runLLM`, `runCoordinatorLLM`).
5. **Orchestration:** Pembangunan *Coordinator System Prompt*, seleksi plugin (`getPluginByName`), penyatuan *grounding sources*, dan re-injeksi memori sub-agent.

---

## 3. Responsibility Audit (Remaining index.ts LOC Estimation)
Kira-kira tersisa **~780 baris kode (LOC)** di `index.ts` (termasuk deklarasi *handler* server). Tanggung jawab yang tersisa di `index.ts` adalah:

- **LLM Coordinator & Intent Router:** ~150 LOC (Deteksi keyword, routing "CHAT_BIASA" vs "BUTUH_AGENT").
- **Tool Calling & Reflection Loop:** ~300 LOC (Mengeksekusi plugin, menangkap output, iterasi perbaikan logika, akumulasi array `groundingSources`).
- **Output Parsing:** ~40 LOC (`extractSourceTrace` untuk memisahkan teks dari referensi).
- **Post-Processing & Self Verification:** ~80 LOC (Memanggil `VerificationEngine.verify` pasca-generasi LLM, menyimpan *Audit Log* akhir).
- **Streaming Hand-off:** ~20 LOC.

---

## 4. Public API Audit
Saat ini `index.ts` **MASIH** mengetahui terlalu banyak tentang detail *Orchestration*:
- **Streaming Format:** `index.ts` merakit manual fallback payload SSE (`JSON.stringify({ choices: [{ delta: { content: ... } }] })`) ketika Evidence Gate atau Policy memblokir request.
- **Tool Logic:** `index.ts` memanggil modul plugin eksternal dan secara eksplisit merakit format JSON XML (````xml_zip````) dan menangani kegagalan alat secara spesifik.
- *Retry/Fallback* level model sudah terabstraksi di `llm_orchestrator.ts`, sehingga `index.ts` aman dari isu *provider selection*.

---

## 5. RuntimeContext Audit
- **Penggunaan:** SANGAT BAIK. `executeRequestPipeline` menginisialisasi `rctx` murni sebagai kontainer *service* (Environment, Keys, Logger, Stream flag, Background Tasks).
- **Leak:** Tidak ada request state (pesan user, histori, dll) yang masuk ke `rctx`. Semuanya aman berada di `UnifiedExecutionContext`.
- **Dangling Variables:** Import seperti `WorkspaceGuardian` dan `geminiKeyIndex` sudah berhasil dibersihkan dari `index.ts` (sudah ditangani di facade Request).

---

## 6. Remaining Monolith (Risk Level)
Blok terbesar di `index.ts` saat ini:
1. **Tool Execution & Sub-Agent Coordinator Loop (LOC: ~300)**
   - *Estimasi Ekstraksi:* **HARD**. Karena loop ini secara dinamis memodifikasi array `groundingSources`, `toolExecution`, dan `subagentRuns` yang kemudian di-inject kembali ke prompt.
2. **Intent Router (LOC: ~150)**
   - *Estimasi Ekstraksi:* **EASY**. Hanya berupa serangkaian *if-else regex* dan satu panggilan LLM ringan pembagi jalur.
3. **Post-Processing / Post-Gate Verification (LOC: ~80)**
   - *Estimasi Ekstraksi:* **MEDIUM**. Tergantung pada hasil dari LLM, membutuhkan injeksi ke Background Tasks.

---

## 7. Candidate Extraction (Wave 5.2G)
Rekomendasi modul abstraksi untuk Wave 5.2G:
1. `lib/coordinator/intent_router.ts` (Menghapus regex panjang dan evaluasi `isChatBiasa`).
2. `lib/coordinator/subagent_loop.ts` (Membungkus iterasi 3x reflection).
3. `lib/coordinator/response_parser.ts` (Mengekstrak `extractSourceTrace` dan Regex ZIP).
4. `lib/coordinator/post_processor.ts` (Mengeksekusi *Soft-Gate Verification* dan antrian *Memory Write*).
5. **`lib/coordinator/execution_pipeline.ts`** (Facade akhir penyatu poin 1-4).

---

## 8. Risk Analysis (Risk Matrix)
Jika Wave 5.2G dilakukan sekarang:
- **Risiko Terbesar:** *State Loss* pada variabel array seperti `groundingSources` dan `subagentRuns`. Jika array ini hilang referensinya (pass-by-value vs pass-by-reference) saat dipindah antar fungsi, sub-agent akan amnesia di iterasi ke-2 atau ke-3.
- **Rawan Regression:** Streaming. Mengembalikan HTTP Response langsung dari dalam loop *Sub-Agent* vs mengembalikan String.
- **Ekstraksi Terakhir:** `subagent_loop.ts` HARUS menjadi yang terakhir dipindahkan setelah router dan parser terisolasi sempurna.

---

## 9. Architecture Score
- **Architecture:** 80/100 (Peningkatan masif, Pre-Flight murni Facade).
- **Maintainability:** 75/100 (Masih ada "pabrik sosis" di babak akhir `index.ts`).
- **Coupling:** 85/100 (Tingkat coupling rendah antar fase).
- **Cohesion:** 90/100 (Domain baru sangat fokus pada tugasnya masing-masing).
- **Testing Readiness:** 80/100.
- **Production Readiness:** 95/100 (Sistem saat ini 100% stabil).

---

## 10. Roadmap Wave 5.2G (Execution & Coordination)
Rencana Eksekusi:
- **5.2G.1 — Response & Trace Parser:** Pemindahan *pure function* (contoh: `extractSourceTrace`) agar kode bersih.
- **5.2G.2 — Post-Processing Extraction:** Memindahkan logika Soft Gate (Verification setelah LLM menjawab) ke `post_processor.ts`.
- **5.2G.3 — Intent Router Extraction:** Mengubah filter *desktop*, klasifikasi *keyword*, dan LLM pembagi menjadi satu *class/function*.
- **5.2G.4 — Sub-Agent Loop Abstraction:** Tahap paling kritis, mengenkapsulasi *while-loop / for-loop* eksekusi alat bantu ke dalam satu *Engine*.
- **5.2G.5 — Execution Facade Consolidation:** Penggantian total ~700 baris di `index.ts` dengan `executeCoordinatorPipeline()`.

### STATUS KESIAPAN
**GO FOR WAVE 5.2G**. Base stabil, *Compile/Runtime Clean*. Tidak ada utang regresi dari Wave 5.2F.
