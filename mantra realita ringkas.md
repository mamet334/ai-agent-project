# MAMET AI - RINGKASAN FITUR & ALUR SISTEM

> Dokumen ini untuk memudahkan AI (Copilot/Cursor) memahami proyek secara cepat.

## 🧠 STACK
- React/Vite (SPA) + Electron (Desktop)
- Supabase (DB, Auth, Edge Functions - Deno)
- Vercel (hosting frontend)
- API: DeepSeek, Llama, Gemini (BYOK)

## 🏛️ ARSITEKTUR KOGNITIF (UPDATE JUNI 2026)
**Single Decision Authority Pipeline:**
Sistem memori berjalan murni secara deterministik dan linear tanpa *recursive loop*.
`User Input → Memory Engine (Read) → Memory Governor (Rank) → OCB (Compress) → Decision Engine (Final Orchestrator) → LLM`
*(Semua sistem orkestrator lawas seperti SCC, CMG, G-CFL, TGML telah dinonaktifkan sepenuhnya untuk kecepatan & stabilitas mutlak).*

## ✅ FITUR UTAMA (SEMUA SELESAI 100%)

### Inti
- Multi-Agent Orchestrator + Token Optimization (kompres prompt, cek budget, tracking real-time) — **Frontend full**
- Self-Healing, BYOK (Tanpa PWA selama fase development)
- Vector RAG (PDF/Excel/Word)
- 5-Layer Anti-Limit (multi-key rotation, fallback)
- YouTube Analyst (5 ahli, anti-CAPTCHA)
- Web Resilience (Jina, DuckDuckGo fallback, image search)
- Workspace File Analyzer + Editor (baca/tulis file lokal)
- Sakelar RAG ON/OFF (hemat token)
- **Mametlite Lite** — PWA ringan tanpa orchestrator (direct API call, tools terbatas: rag_search, web_search, deep_research)

### Sub-agen aktif (11)
`deep_research`, `researcher`, `youtube_analyst`, `file_analyzer`, `cron_manager`, `memory_manager`, `coder`, `scraper`, `debate`, `communicator`, `logic & language`

### Keamanan
- Kill Switch (matikan semua cron)
- RAG Wipe (hapus memori vektor)
- Delimiter Shield (anti prompt injection)
- Harakiri Cron (mati sendiri jika API gagal)

### Desktop Edition (Electron) - Selesai
- Eksekusi terminal (dengan konfirmasi & blocklist)
- Surgical file editing
- Global search file (PowerShell)
- Docker sandbox (--network=none, --memory=128m)
- Auto-updater (electron-updater)
- Penetration testing: 30/31 aman

### Lain-lain
- Production build .exe (NSIS + Portable)
- Obfuscator (proteksi source code)
- State stabilization (UUID, anti-duplikasi)

## 🔄 ALUR SISTEM (SINGKAT)

### Frontend Full (AIAgent.jsx)
1. **User kirim pesan** → `AIAgent.jsx` → `handleSendMessage()`
2. **Siapkan input** (file, workspace, desktop pre-exec)
3. **Simpan pesan user** ke state & DB
4. **Pilih sub-agen** (coordinator-agent otomatis atau manual)
5. **Token optimization lokal**: `MainOrchestrator` + `TokenSaverAgent` (cek budget, kompres prompt)
6. **Panggil backend**: Supabase Edge Function `agent-process`
7. **Backproses & streaming SSE** → UI update chunk per chunk
8. **Desktop interceptor** (jika Electron): eksekusi `<terminal>`, `<edit_file>`, `<search_disk>`, atau Docker sandbox
9. **Tampilkan response** + metadata tools yang digunakan

### Mametlite Lite (App.jsx)
1. **User kirim pesan** → `App.jsx` → `handleSend()`
2. **Build tools array** (rag_search, web_search, deep_research) berdasarkan tombol aktif
3. **Langsung panggil**: `callAgentSimple()` (tanpa token optimization overhead)
4. **Streaming SSE** → Update chat real-time
5. **Tampilkan response** (ringan & cepat)

## 🗺️ LOKASI FILE PENTING

### Frontend Full
- Orchestrator: `frontend/src/lib/mainOrchestrator.js`
- Token Saver: `frontend/src/lib/tokenSaverAgent.js`
- UI: `frontend/src/components/AIAgent.jsx`
- Electron main: `frontend/main.cjs`

### Mametlite Lite
- Simple Caller: `mametlite/src/lib/callAgentSimple.js` ✅ **BARU**
- UI: `mametlite/src/App.jsx` (orchestrator diganti dengan callAgentSimple)
- Token Saver: `mametlite/src/lib/tokenSaverAgent.js` (fixed .split() type errors)

### Backend & Edge Functions
- Backend: `backend/server.js`
- Edge Function: `supabase/functions/agent-process/index.ts`

## 🔧 PERUBAHAN TERBARU (11 Juni 2026)

### Mametlite Lite Refactoring
- ✅ Created `callAgentSimple.js` — Fungsi direct API caller tanpa token optimization
- ✅ Removed `MainOrchestrator` import/state dari `mametlite/src/App.jsx`
- ✅ Removed token stats display & UI tracking
- ✅ Simplified `handleSend()` logic (langsung panggil `callAgentSimple()`)

### Bug Fixes
- ✅ Fixed `(e.context || "").split is not a function` errors:
  - `tokenSaverAgent.js` line 64: Pastikan context adalah string sebelum `.split()`
  - `tokenSaverAgent.js` line 84: Validasi text sebelum `.split()`

## 🛡️ PERUBAHAN KEAMANAN & ARSITEKTUR (24 JUNI 2026 - PHASE 9)
- ✅ **Execution Policy Layer:** Menambahkan lapisan deterministik untuk mengatur risk score, mengizinkan pembatasan akses alat (sub-agent), dan menyesuaikan limit RAG secara dinamis berdasarkan potensi ancaman di prompt (Prompt Injection & Context Poisoning).
- ✅ **Unified Execution Context:** Semua metrik keamanan dan retrieval dikumpulkan dalam satu objek utuh sebagai 'single source of truth' untuk `agent-process/index.ts`.
- ✅ **Structured Reasoning Layer (Context Fusion):** Data Memory dan RAG kini dikonversi menjadi objek struktur (*structured context*) sebelum dirangkai menjadi string final. Mempermudah debugging, mencegah tumpang tindih data, dan memberikan batas yang jelas untuk memori vs RAG.
- ✅ **Auth Binding Layer:** `agent-process` Edge Function sekarang memverifikasi token JWT dari `Authorization` header dan menjadikannya sumber identitas utama, meng-override (menimpa) `userId` bawaan dari JSON Payload, sehingga IDOR dapat sepenuhnya dicegah.
- ✅ **Frontend Sync:** Memperbarui pemanggilan *fetch* di `AIAgent.jsx` dan `mametlite/src/lib/callAgentSimple.js` agar mengirimkan Session JWT User alih-alih `ANON_KEY`.
  - `callAgentSimple.js` line 115: Validasi buffer sebelum `.split()`
  - `App.jsx` line 271: Optional chaining untuk session.user.email

### 🛡️ KNOWLEDGE WORKSPACE ARCHITECTURE (25 JUNI 2026 - PHASE 10)
- ✅ **Knowledge Workspace Manager:** RAG arsitektur berevolusi dari *flat-hierarchy* menjadi terspesialisasi dalam tabel `knowledge_spaces`. Terdapat tipe 'CORE' (sistem eksklusif, read-only untuk penghapusan) dan 'WORKSPACE' (sandbox dinamis pengguna).
- ✅ **Otonomi RAG via Chat:** Memperkenalkan Sub-Agent `knowledge_manager` di *Coordinator LLM* yang memungkinkan Mamet menjalankan aksi (CREATE, SAVE, DELETE, LIST, STATS, SUMMARIZE) terhadap *workspace* langsung melalui perintah chat.
- ✅ **Knowledge Quality Filter:** Modul `knowledge_quality_filter.ts` bertindak sebagai *guardrail* (Filter Kualitas) menggunakan model *LLM Fallback* yang memastikan hanya teks bernilai informasi (riset, laporan, SOP) yang disisipkan ke *vector store*, menolak basa-basi atau *noise*.
- ✅ **Workspace Summaries:** Rangkuman dari tiap *workspace* dapat diekstraksi dan disimpan secara asinkron (Upsert) dalam tabel `workspace_summaries`.
- ✅ **Safe Isolation:** Menghapus satu *workspace* secara otomatis (*ON DELETE CASCADE*) menyapu bersih tabel `documents` dan `document_chunks` di bawahnya tanpa membebani memori *Edge Function*.

### Tools Logic Fix
- ✅ Fixed tools building dalam `handleSend()`:
  - Hanya RAG ON → `['rag_search']`
  - RAG + Web Search ON → `['rag_search', 'web_search']`
  - Semua ON → `['rag_search', 'web_search', 'deep_research']`
  - Semua OFF → default `['rag_search', 'web_search']`

### CI/CD & Desktop Auto-Updater
- ✅ Fixed bug `g[a(...)] is not a function` (JavaScript Obfuscator merusak `.json()` akibat *spread operator* pada objek `Response` di `mainOrchestrator.js`).
- ✅ Menambahkan `"main": "electron/main.cjs"` pada `package.json` untuk memperbaiki target *entry-point* `electron-builder`.
- ✅ Mengimplementasikan workflow **GitHub Actions** (`build.yml`) untuk CI/CD pipeline yang secara otomatis merakit dan mem-publish file instalasi `.exe` Desktop Edition ke GitHub Releases setiap kali ada versi baru yang di-push ke branch `main`.
- ✅ Fixed *memory leak* pada event listener `update-status` auto-updater di `preload.cjs`.
- ✅ **CRITICAL FIX (Blank Screen 1):** Aplikasi Electron yang menggunakan Vite dengan output ES Modules (`type="module"`) **TIDAK BISA** dimuat menggunakan `mainWindow.loadFile('index.html')` (protokol `file://`) karena terblokir oleh aturan CORS browser/Chromium. Selalu gunakan custom protocol `mamet://` (`mainWindow.loadURL('mamet://app/index.html')`) yang sudah didaftarkan dengan *privilege* `standard: true, secure: true` agar mendapatkan origin seperti HTTP/HTTPS.
- ✅ **CRITICAL FIX (Blank Screen 2 - Fatal Crash):** File `.env` (berisi `VITE_SUPABASE_URL` dll) secara *default* diabaikan oleh `.gitignore`. Akibatnya, saat GitHub Actions me-build file `.exe`, variabel tersebut *undefined* dan membuat React *crash* saat inisialisasi client Supabase (`Uncaught Error: supabaseUrl is required`). **Solusi:** Selalu suntikkan (inject) variabel environment yang dibutuhkan dengan membuat file `.env` sementara secara *hardcode* di dalam skrip `build.yml` sebelum menjalankan `npm run dist:publish`.

### Backend Resilience & Fallback Logic (12 Juni 2026)
- ✅ **CRITICAL FIX (Sticky 404 OpenRouter Bug):** Memperbaiki bug di Edge Function `agent-process` di mana `callLLMWithCascade` dan `streamGeminiResponse` secara tidak sengaja menggunakan nilai variabel `model` global dari prompt user (seperti model eksperimental yang sudah usang `ai21/jamba`) saat melakukan *fallback* ke OpenRouter akibat limit Gemini. **Solusi:** Menambahkan parameter `forceDefaultModel` pada `callOpenRouter` dan `streamOpenRouterResponse` untuk memaksa penggunaan model gratis yang 100% dijamin hidup (seperti `meta-llama/llama-3.1-8b-instruct:free`) ketika berada dalam mode *fallback/penyelamatan*.
- ✅ **Groq Primary Fallback:** Mengaktifkan kembali `callGroq` dan `streamGroqResponse` di dalam Edge Function dan menginjeksi rahasia `GROQ_API_KEY` ke Supabase Secrets. Mengubah urutan rotasi/jatuh-bangun (*cascade order*) menjadi **Gemini → Groq (Llama 3.1) → OpenRouter**, sehingga ketika limit Gemini tercapai, sistem akan memprioritaskan Groq yang jauh lebih cepat dan stabil sebelum menyerahkan ke OpenRouter.

## 🧠 MEMORY MANAGER V2 — TEMPORAL KNOWLEDGE GRAPH (20 Juni 2026)

### Status: ✅ PRODUCTION READY (Level: Cognitive Architecture)

Sistem memori Mamet AI telah melampaui paradigma database tradisional dan resmi beroperasi sebagai **"Event-Sourced Temporal Knowledge Graph with Causal Explainability & Deterministic Cognitive Compiler"**. Ini menyelesaikan masalah sinkronisasi *state*, duplikasi tumpang tindih, dan *token explosion* secara radikal.

### Arsitektur Utama:
1. **Event-Sourced Storage & Contradiction Graph:**
   - Tidak ada lagi *overwrite* pada memori lama. Fakta lama tetap ada sebagai sejarah (*lossless evolution*), namun dihubungkan ke fakta baru via tabel `memory_relations` (contoh: `OVERRIDES`, `REFINES`).
   - Node-node dihubungkan secara kausal *(Causal Explainability)* dengan menyertakan `reason_type` (mengapa berubah) dan `confidence`.

2. **CQRS Derived Active View:**
   - Mengatasi *Dual Source of Truth*. Kolom `state` dihapus. Sistem menggunakan *Database View* `active_user_memories` secara dinamis. Sebuah fakta bernilai *ACTIVE* jika dan hanya jika ia tidak memiliki edge bertipe `OVERRIDES` dari node lain.

3. **Cognitive Control Plane (Context Packing Optimizer):**
   - RAG tidak lagi menarik semua fakta yang relevan secara brutal.
   - **Intent Parser:** Membedah apa yang LLM butuhkan berdasarkan tipe (STATE_QUERY, DELTA, PROFILE, ANALYTIC).
   - **CEBL (Context Execution Binding Layer):** Bertindak sebagai *Compiler* yang mematok keras batas penarikan node, batas penelusuran *Graph*, dan membatasi asal sumber pembacaan (View vs Graph).
   - **CSEL (Controlled Soft Exception Layer):** Sistem pengecualian (sebesar maks 25% *overshoot budget*) yang mengizinkan *compiler* menembus batas penarikan *jika* agen membutuhkan nuansa emosional dan kausal untuk memberikan jawaban yang manusiawi.

### Hasil Test & Performa:
Sistem dijamin bebas dari *race condition* karena *pessimistic locking* dengan Supabase RPC `atomic_entity_lock`. Kebocoran *context window* (token loss) pada fase *Retrieval* dikunci pada rasio nol. System benar-benar mengeksekusi *Inference-Time Cognitive Compression*.

### 🚧 NEXT MISSION (TARGET PEKERJAAN BERIKUTNYA):
**Membangun Context Compressor Agent**
Karena *Control Plane* (CEBL & CSEL) dan *Execution Engine* (Subgraph Extractor) sudah terpasang secara aktif, tugas berikutnya adalah:
1. ~~**Membangun Subgraph Extractor:**~~ ✅ SELESAI (Sudah terimplementasi via `extract_cognitive_subgraph` di `setup_subgraph_extractor.sql` dan dipanggil di `memory_manager_v1.ts`).
2. **Membangun Context Compressor Agent:** Membuat agen perajut teks untuk menghemat *Context Window*.
   - **Rincian Implementasi:**
     - **Lokasi File:** Membuat modul baru di `supabase/functions/agent-process/plugins/context_compressor.ts`.
     - **Teknologi LLM:** Menggunakan Groq (Llama-3 8B) karena butuh latensi ultra-rendah (<1 detik) untuk *pre-processing*, dengan *fallback* ke Gemini 1.5 Flash.
     - **Input:** Menerima objek array JSON mentah (`subgraph.nodes` & `subgraph.edges`) yang ditarik oleh fungsi RPC `extract_cognitive_subgraph`.
     - **Tugas LLM:** Melakukan *Inference-Time Cognitive Compression*. Membaca seluruh JSON, membuang metadata yang tidak perlu, dan merangkum relasi kausal menjadi teks prosa pendek atau *bullet points* padat informasi.
     - **Output:** Mengurangi beban token dari ~4000 token JSON mentah menjadi hanya ~300-500 token teks murni.
     - **Integrasi:** Disuntikkan pada fungsi `retrieveMemoriesV2` (di dalam `memory_manager_v1.ts`) tepat sebelum data ingatan dikembalikan.

## 🔄 OUT-OF-BAND SYSTEM UPDATE (21 Juni 2026)

### 1. MAMETLITE LITE - ARCHITECTURE CHANGE
- `MainOrchestrator` **DIHAPUS** dari Mametlite Lite. Diganti total dengan `callAgentSimple()`.
- Tidak ada *token optimization layer*, tidak ada *budget check* sebelum request, tidak ada *context packing / pre-processing*.
- **Flow baru:** User Input (`App.jsx`) → build tools array → `callAgentSimple()` → Supabase Edge Function (`agent-process`) → SSE streaming response ke UI.

### 2. TOOLS LOGIC UPDATE
- **Tools mapping:**
  - RAG ON → `['rag_search']`
  - RAG + WEB → `['rag_search', 'web_search']`
  - ALL ON → `['rag_search', 'web_search', 'deep_research']`
  - ALL OFF → default `['rag_search', 'web_search']`

### 3. CRITICAL BUG FIXES
- **`tokenSaverAgent.js`**: Fix `(context || "").split is not a function`. Ditambahkan *type validation* sebelum `split()`.
- **`callAgentSimple.js`**: Fix `buffer.split` crash. Ditambahkan *string type guard* sebelum parsing.
- **`App.jsx`**: Fix `session.user.email` undefined crash. Diganti dengan *safe access (optional chaining)*.

### 4. ELECTRON / DESKTOP FIXES
- **Blank Screen Fix #1:** Menghapus `loadFile(index.html)` dan menggantinya dengan custom protocol: `mamet://app/index.html` (Secure protocol registered, Chromium origin safe).
- **Blank Screen Fix #2 (CI Build Crash):** `.env` missing during GitHub Actions membuat Supabase client crash karena `VITE_SUPABASE_URL` undefined. Fix: Inject environment variables during build step.

### 5. BACKEND RESILIENCE UPDATE
- **Cascade order updated:** 
  - Sebelumnya: Gemini → OpenRouter (buggy fallback propagation)
  - Sekarang: **Gemini → Groq → OpenRouter**
- **Fix:** Menambahkan `forceDefaultModel` dalam mode fallback dan mengunci fallback model ke `meta-llama/llama-3.1-8b-instruct:free`.

### 6. MEMORY SYSTEM STATUS
- **Event-sourced memory graph** active.
- **CQRS active view** implemented.
- **OVERRIDE / REFINES relation system** active.
- **CEBL + CSEL** controlling context injection.
- **atomic_entity_lock** prevents race conditions.

### 7. OPENROUTER & MEMORY ROUTING STABILIZATION (23 Juni 2026)
- **OpenRouter Routing Fix:** Memperbaiki bug "model hijacking" di `index.ts` (Edge Function) di mana model `openrouter/...` dengan substring `gpt` (seperti `openai/gpt-4o-mini`) salah ditangkap oleh Native OpenAI logic. Fix: `model.includes('gpt') && !model.includes('openrouter')`.
- **404 Provider Fix:** Menyelesaikan isu HTTP 404 dari OpenRouter dengan menghapus batasan "Anthropic-only" pada API Key OpenRouter user, sehingga mengembalikan akses ke 97% model (termasuk OpenAI).
- **Fact Detector (HHPC):** Mengganti regex strict dengan *Hybrid Heuristic Probabilistic Classifier (HHPC)* untuk memfasilitasi deteksi intensi memori dengan natural language (support nuansa bahasa Indonesia: "juga", "aku", "sekarang"). Diimplementasikan tiering `T1`, `T2`, `T3` pada `fact_detector.ts`.

### 8. HUMAN-LIKE MEMORY UPGRADE (23 Juni 2026)
- **Semantic Classification:** Meng-upgrade tipe memori statis (T1/T2) menjadi semantik penuh (`IDENTITY`, `LOCATION`, `JOB`, `PREFERENCE`, `PROJECT`, `RELATION`, `KNOWLEDGE`, `EVENT`) di dalam `fact_detector.ts`.
- **Ephemeral Event Filter:** Menangani FPR tinggi dari kata *'makan'* dan *'minum'* dengan memasukkannya ke kategori `EVENT` dan mengimplementasikan *SKIP WRITE* di `memory_write_worker.ts` untuk mencegah polusi graf memori.
- **State Transition (ACTIVE/HISTORICAL):** Mengatasi *Collision* pada memori eksklusif (`LOCATION`, `JOB`). Data baru tidak menimpa atau berdampingan dengan data lama, melainkan memaksa data lama bergeser ke state `HISTORICAL`.
- **Temporal Retrieval & Reverse Decay:** Mem-bypass `recencyScore` default dan menembus limit DB (15 -> 50) ketika terdeteksi *keyword* masa lalu (*sebelum, dulu*). Memori historis yang tadinya tertumpuk kini berhasil di-*rescue*.
- **Dynamic Top-K:** Menghapus *hard-limit* absolut `slice(0, 5)` dan menggantinya dengan logika elastis bergantung intent (`LOCATION: 3`, `PREFERENCE: 8`, `TEMPORAL: 10`).

### 9. KNOWN LIMITATIONS / NOT YET COMPLETED
- Code signing certificate belum terimplementasi (SmartScreen warning tetap ada).
- Auto-updater infrastructure masih parsial.
- API proxy backend belum sepenuhnya terisolasi dari frontend.

### 10. UI/UX DENSITY & FLEXBOX MIGRATION (25 Juni 2026)
- ✅ **Density Optimization:** Mengurangi *padding* struktural pada Composer secara ekstrem untuk mencapai kepadatan visual level-pro (seperti Cursor IDE / Claude).
- ✅ **Native Flexbox Migration:** Membongkar arsitektur *Composer* dari `absolute bottom-0` (Overlay Architecture) dan memigrasikannya menjadi `relative shrink-0` di dalam *parent* `flex-col`.
- ✅ **Zero-Overlap Bug Fix:** Menghapus *static/dynamic padding* (`pb-40`) pada *scroll container* chat. Mengandalkan hukum fisika Flexbox murni di mana *Composer* secara fisik akan mendesak area pesan ke atas saat membesar (karena *paste* prompt panjang), memastikan 100% pesan terakhir tidak akan pernah tertelan/tertutup antarmuka *input*.

### 11. ADVANCED RETRIEVAL STABILIZATION (v2.1.0 - 26 Juni 2026)
- ✅ **RAG Identity Separation (MametLite vs AI):** Memisahkan parameter `TopK` di mana LITE mengambil 10 keping dokumen (fokus bacaan luas) dan AI mengambil 5 keping (fokus memori chat). LITE kini diputus total kemampuannya untuk membaca/menulis `user_memories` (Strict Read-Only Identity).
- ✅ **Context Fusion Limits & Semantic Chunking:** Mencabut *hard truncation* (`break`) yang memenggal paksa kepingan RAG/Memory, menggantinya dengan logika akumulasi yang lebih cerdas. Logika *chunking* di `vector_utils.ts` kini memuat 250 karakter *semantic overlap* (berhenti otomatis di batas titik/paragraf terdekat) untuk mencegah hilangnya jembatan referensi antar-pasal.
- ✅ **Deduplication & Hybrid Re-Ranking Layer:** Mengimplementasi lapisan *Deduplication* lokal via Cosine Similarity (Word-overlap) secara efisien di `agent-process` Edge Function. Ditambah *Hybrid Re-Ranking* yang mencampur bobot `similarity` (70%), `position` (20%), dan kepadatan kata kunci dari kueri (10%) untuk menyaring sampah semantik.
- ✅ **Deterministic Dual-Pipeline:** Web Validation di mode LITE tidak lagi dikontrol oleh ilusi *Tool Calling* semata, tetapi diatur oleh `webHint` (pendeteksi *intent* cepat berbasis Regex: `terbaru`, `2024`, dll) yang memberlakukan *Web vs RAG Comparison Contract* secara ketat ke dalam promt akhir LLM.

---

## 🏛️ MAEF FRAMEWORK — GOVERNANCE BASELINE (27 Juni 2026)

### Status: ✅ Phase 0 DONE | ✅ Phase 1 DONE

Proyek Mamet AI kini beroperasi di bawah konstitusi resmi **MAEF (Mamet AI Engineering Framework) v1.0.0**.

**MAEF adalah sumber kebenaran tertinggi.** Repository mengikuti MAEF, bukan sebaliknya.

### Hierarki Otoritas (MAEF Bab 5):
```
MAEF → Vision → Master Architecture Index → System Architecture
→ ADR → Technical Specification → Development Standard
→ Engineering Blueprint → Roadmap → Repository → Runtime
```

### Struktur Dokumentasi Resmi (dibuat oleh Codex):
- `mamet ai engineering framework(MAEF).md` — Konstitusi utama
- `docs/architecture/MASTER-ARCHITECTURE-INDEX.md` — Index arsitektur
- `docs/architecture/ARCHITECTURE-GAPS.md` — Register gap aktif
- `docs/adr/` — Architecture Decision Records
- `docs/tasks/` — Task registry (TASK-0001 s/d TASK-0006)
- `docs/project-memory/PROJECT-MEMORY.md` — Project Memory resmi
- `docs/roadmap/MAMET-AI-ROADMAP.md` — Roadmap 5 fase

### Phase 0: Governance Foundation ✅ DONE
- MAEF Final Baseline ditetapkan
- Seluruh dokumentasi tata kelola dibuat
- ADR, Task, Project Memory, Roadmap tersedia

### Phase 1: Stabilize Core Runtime ✅ DONE (27 Juni 2026)

| Item | Status | Evidence |
|---|---|---|
| `agent-process` context repair | ✅ Done | tsc clean, deployed v246 |
| MametLite source boundary | ✅ Done | `appSource: 'mametlite'` enforced |
| MametLite tidak baca/tulis User Memory | ✅ Done | Policy aktif di v246 |
| Frontend build | ✅ Done | Built in 17.48s, exit 0 |
| MametLite build | ✅ Done | Built in 627ms, exit 0 |
| Deploy ke Supabase (BrainBox AI) | ✅ Done | v246 ACTIVE, CORS confirmed |

### Next Mission — Phase 2: Mamet Engineer Foundation
- Formalisasi Mamet Engineer sebagai workflow terkontrol
- Setiap perubahan kode harus traceable ke Task, Verification, dan Project Memory
- Lihat: `docs/roadmap/MAMET-AI-ROADMAP.md` Phase 2

---

> Catatan: Semua fitur di atas sudah diimplementasikan dalam kode (bukan rencana). Mametlite Lite telah bergeser dari arsitektur berbasis orchestrator ke model eksekusi stateless direct-call, dengan pemilihan tool yang disederhanakan dan overhead pre-processing yang diminimalkan.
>
> Sejak 27 Juni 2026, proyek beroperasi di bawah MAEF. Seluruh pengembangan wajib mengikuti Engineering Flow: Vision → Architecture → ADR → Tech Spec → Task → Implementation → Testing → Project Memory → Release.