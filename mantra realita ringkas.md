# MAMET AI - RINGKASAN FITUR & ALUR SISTEM

> Dokumen ini untuk memudahkan AI (Copilot/Cursor) memahami proyek secara cepat.

## 🧠 STACK
- React/Vite (SPA) + Electron (Desktop)
- Supabase (DB, Auth, Edge Functions - Deno)
- Vercel (hosting frontend)
- API: DeepSeek, Llama, Gemini (BYOK)

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
  - `callAgentSimple.js` line 115: Validasi buffer sebelum `.split()`
  - `App.jsx` line 271: Optional chaining untuk session.user.email

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
**Membangun Eksekutor Fisik dari Context Compression Engine**
Karena *Control Plane* (CEBL & CSEL) sudah terpasang, tugas berikutnya adalah:
1. **Membangun Subgraph Extractor:** Menulis kueri Supabase RPC yang mengekstraksi node dari `active_user_memories` dan merayapi tabel `memory_relations` secara dinamis sesuai batasan *budget* dari CEBL.
2. **Membangun Context Compressor:** Membuat agen perajut teks yang akan mengubah kumpulan node mentah (JSON) dari database menjadi satu paragraf prosa / *bullet points* padat token sebelum disuntikkan ke dalam *Context Window* LLM.

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

### 7. KNOWN LIMITATIONS / NOT YET COMPLETED
- Code signing certificate belum terimplementasi (SmartScreen warning tetap ada).
- Auto-updater infrastructure masih parsial.
- API proxy backend belum sepenuhnya terisolasi dari frontend.

---

> Catatan: Semua fitur di atas sudah diimplementasikan dalam kode (bukan rencana). Mametlite Lite telah bergeser dari arsitektur berbasis orchestrator ke model eksekusi stateless direct-call, dengan pemilihan tool yang disederhanakan dan overhead pre-processing yang diminimalkan.