# MAMET AI - RINGKASAN FITUR & ALUR SISTEM

> Dokumen ini untuk memudahkan AI (Copilot/Cursor) memahami proyek secara cepat.

## 🧠 STACK
- React/Vite (PWA) + Electron (Desktop)
- Supabase (DB, Auth, Edge Functions - Deno)
- Vercel (hosting frontend)
- API: DeepSeek, Llama, Gemini (BYOK)

## ✅ FITUR UTAMA (SEMUA SELESAI 100%)

### Inti
- Multi-Agent Orchestrator + Token Optimization (kompres prompt, cek budget, tracking real-time)
- Self-Healing, BYOK, PWA
- Vector RAG (PDF/Excel/Word)
- 5-Layer Anti-Limit (multi-key rotation, fallback)
- YouTube Analyst (5 ahli, anti-CAPTCHA)
- Web Resilience (Jina, DuckDuckGo fallback, image search)
- Workspace File Analyzer + Editor (baca/tulis file lokal)
- Sakelar RAG ON/OFF (hemat token)

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

1. **User kirim pesan** → `AIAgent.jsx` → `handleSendMessage()`
2. **Siapkan input** (file, workspace, desktop pre-exec)
3. **Simpan pesan user** ke state & DB
4. **Pilih sub-agen** (coordinator-agent otomatis atau manual)
5. **Token optimization lokal**: `MainOrchestrator` + `TokenSaverAgent` (cek budget, kompres prompt)
6. **Panggil backend**: Supabase Edge Function `agent-process`
7. **Backproses & streaming SSE** → UI update chunk per chunk
8. **Desktop interceptor** (jika Electron): eksekusi `<terminal>`, `<edit_file>`, `<search_disk>`, atau Docker sandbox
9. **Tampilkan response** + metadata tools yang digunakan

## 🗺️ LOKASI FILE PENTING
- Orchestrator: `frontend/src/lib/mainOrchestrator.js`
- Token Saver: `frontend/src/lib/tokenSaverAgent.js`
- UI: `frontend/src/components/AIAgent.jsx`
- Backend: `backend/server.js`
- Edge Function: `supabase/functions/agent-process/index.ts`
- Electron main: `frontend/main.cjs`

## ⚠️ TANTANGAN YANG BELUM SELESAI
- Code Signing Certificate (SmartScreen masih peringatan)
- Auto-updater distribution (infrastruktur pending)
- API proxy backend (untuk sembunyikan API keys dari frontend)

---

> Catatan: Semua fitur di atas sudah diimplementasikan dalam kode (bukan rencana).