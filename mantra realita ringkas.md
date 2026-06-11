# MAMET AI - RINGKASAN FITUR & ALUR SISTEM

> Dokumen ini untuk memudahkan AI (Copilot/Cursor) memahami proyek secara cepat.

## 🧠 STACK
- React/Vite (PWA) + Electron (Desktop)
- Supabase (DB, Auth, Edge Functions - Deno)
- Vercel (hosting frontend)
- API: DeepSeek, Llama, Gemini (BYOK)

## ✅ FITUR UTAMA (SEMUA SELESAI 100%)

### Inti
- Multi-Agent Orchestrator + Token Optimization (kompres prompt, cek budget, tracking real-time) — **Frontend full**
- Self-Healing, BYOK, PWA
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

## 🔍 ANALISIS SISTEM OTAK AI
- Frontend full menyalakan `MainOrchestrator` + `TokenSaverAgent` untuk optimasi prompt dan pengecekan budget sebelum backend.
- Mametlite Lite memanggil `callAgentSimple()` langsung ke Supabase Edge Function tanpa orchestrator, dengan tools terbatas.
- `agent-process` Edge Function menjadi pusat kontrol request: validasi, circuit breaker quota, history trimming, BYOK selection, dan SSE streaming.
- Rotasi key BYOK dilakukan untuk `gemini`, `groq`, `openai`, dan `openrouter`; fallback dipilih sesuai prioritas provider.
- Model utama adalah Gemini, dengan OpenRouter untuk model `openrouter-*` dan Groq sebagai fallback/cadangan.
- RAG disupport lewat embedding Gemini dalam fungsi `rag-process`, lalu diintegrasikan ke prompt saat `rag_search` aktif.
- Web search dan deep research dimasukkan ke payload Gemini sebagai tool `google_search` dan plugin khusus.
- Backend juga mendukung sub-agent coordinator, function calling, file parsing, dan logging biaya token per request.
- Sistem resiliency mengutamakan retry multi-key, fallback engine, dan circuit breaker harian untuk kontrol biaya.

## ⚠️ TANTANGAN YANG BELUM SELESAI
- Code Signing Certificate (SmartScreen masih peringatan)
- Auto-updater distribution (infrastruktur pending)
- API proxy backend (untuk sembunyikan API keys dari frontend)

---

> Catatan: Semua fitur di atas sudah diimplementasikan dalam kode (bukan rencana).