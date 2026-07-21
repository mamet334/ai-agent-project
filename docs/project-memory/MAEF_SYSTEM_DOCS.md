# DOKUMEN ARSITEKTUR MAMET OS (MAEF v3.0)
**Status:** Final Review Diskusi Teknis
**Tanggal:** 19 Juli 2026
**Berdasarkan Percakapan:** Dari `package.json` hingga `HomeDashboard.jsx` & Vercel Deploy.
**Ditujukan untuk:** Pemilik Sistem (Vibe Coder) & Engineer Internal.

---

## BAB 1: GAMBARAN UMUM ARSITEKTUR (TELAAH LENGKAP)

Mamet OS bukan aplikasi web biasa. Ia adalah **Aplikasi Desktop (Electron) + React + Supabase + AI Orchestrator**. Berikut struktur lapisannya:

### 1.1. Lapisan Frontend (UI / Renderer)
- **Framework:** React + Vite + Tailwind CSS.
- **Entry Point:** `App.jsx` (di `src/`).
- **Kernel Control:** `src/core/runtime/Kernel.js`. Kernel ini bertanggung jawab menginisialisasi semua layanan melalui 10 Fase *Bootstrap* (dari COLD ke RUNNING). Ia menggunakan `ServiceManager` sebagai wadah Dependency Injection.
- **Workspace/UI:** `src/components/os/OSDesktopShell.jsx` (mengatur layout sidebar & aplikasi). 
- **Manajemen Aplikasi:** `src/core/application/ApplicationManager.js` (mendaftarkan aplikasi seperti HomeDashboard, Tools, dll).
- **Sumber Perintah Pengguna:** `src/components/workbench/ConversationEngine.jsx` (Chat Interface).

### 1.2. Lapisan Backend / Serverless (Supabase Edge Function)
- **Entry Point Backend:** `index.ts` di Supabase Edge Function (project bernama `agent-process`).
- **Pemroses Request (Pipeline):** `executeRequestPipeline` di `request_pipeline.ts` (Memvalidasi Auth, parsing request, mengecek Quota, menyusun Prompt AI).
- **Otak Backend (Orchestrator):** `core_engine.ts` (menjalankan ContextBuilder, IntentRouter, ExecutionPlanner, lalu SynthesisHandler untuk memanggil LLM eksternal).
- **Adaptor LLM:** `SynthesisHandler.ts` (bertugas memanggil provider AI seperti Gemini, OpenAI, atau OpenRouter).

### 1.3. Lapisan Database & Observability (Supabase PostgreSQL)
- **Database Engine:** Supabase PostgreSQL dengan ekstensi `pgvector`.
- **RAG & Memori:** Tabel `user_memories`, `document_chunks` (dengan kolom `vector` untuk search), `chats`.
- **Project Memory:** Tabel `project_memory_entries`, `verification_runs`, `architecture_gaps`.
- **Telemetri:** Tabel `ai_system_logs`, `service_heartbeat`, `verification_audit_logs`.

### 1.4. Lapisan Desktop & Bot (Electron Node.js)
- **Bridging:** `preload.cjs` (menjembatani UI ke Node.js via `contextBridge.exposeInMainWorld`).
- **Main Process:** `main.cjs` (menjalankan window, mengatur Auto-Updater, dan menerima perintah IPC).
- **Mesin Bot/Kernel Eksekusi:** `airdropEngine.cjs` (memuat Puppeteer-Extra, Ghost Cursor, Recaptcha, dan menjalankan Chrome asli di desktop user).

---

## BAB 2: ALUR DATA EKSEKUSI (DARI CHAT KE BOT) - DETAIL TEKNIS

Berikut adalah alur lengkap saat user mengetik perintah "Jalankan Airdrop":

1. **User mengetik di `ConversationEngine.jsx`:** 
   - Teks dikirim melalui `fetch()` ke Supabase Edge Function (`https://.../functions/v1/agent-process`).
   - Payload berisi: `message`, `mode` (ASSISTANT/ENGINEER/LITE), `workspaceTarget`, dan header `x-byok-openrouter` (jika user memakai OpenRouter).

2. **Backend (`request_pipeline.ts`) memproses Request:**
   - `handleAuth()` memverifikasi user via Supabase Auth.
   - `parseRequestParams()` mengekstrak payload.
   - `buildUnifiedExecutionContext()` menyusun konteks.
   - **Penyusunan Prompt (Bagian Kritis):** `agentIdentityPrompt` disusun. Di sinilah aturan "DILARANG KERAS menggunakan pengetahuan internal" (Penyebab Bug 2) dan aturan "Jika minta Airdrop, keluarkan tag `<run_airdrop task="...">`" ditulis.
   - **Hard Gate Key:** Backend memeriksa `GEMINI_API_KEY`. Jika kosong, sistem `throw Error` (Penyebab Bug Koneksi OpenRouter).

3. **Backend (`core_engine.ts`) menjalankan Pipeline AI:**
   - `ContextBuilderHandler` menyatukan data.
   - `IntentRouterHandler` memutuskan jenis permintaan (chat biasa atau eksekusi).
   - `ExecutionPlannerHandler` menyusun rencana.
   - `SynthesisHandler` memanggil LLM (Gemini/OpenRouter) menggunakan API Key yang ada di `rctx.keys`.

4. **LLM Menghasilkan Respons (Dengan Tag Khusus):**
   - AI mengeluarkan jawaban teks, lalu menyisipkan tag `<run_airdrop task="galxe_campaign"></run_airdrop>`.
   - Respons dikembalikan ke Frontend dalam bentuk Stream.

5. **Frontend (`ConversationEngine.jsx`) menerima Stream & Menganalisis:**
   - Di dalam fungsi `handleSend`, ada sebuah blok bernama **`OS EXECUTION INTERCEPTOR`**.
   - Blok ini mem-parsing teks balasan AI menggunakan Regex. Jika mendeteksi tag `<terminal>`, `<edit_file>`, atau `<run_airdrop>`, ia langsung memanggil `window.electronAPI.runAirdropTask(...)` atau fungsi eksekusi lainnya.

6. **Eksekusi Desktop (`main.cjs` via `ipcMain`):**
   - `preload.cjs` meneruskan panggilan ke `main.cjs`.
   - `main.cjs` menangkap di `ipcMain.handle('run-airdrop-stealth', ...)`.
   - Memunculkan **`EngineerApprovalDialog.jsx`** di UI (konfirmasi keamanan ke user).
   - Jika disetujui, `main.cjs` memanggil `airdropEngine.cjs` dengan parameter yang sesuai.

7. **Bot Berjalan (`airdropEngine.cjs`):**
   - Membuka Chrome ASLI (bukan Chromium).
   - Memuat session login (cookie) dari folder `userData/StealthSession`.
   - Menggerakkan mouse ala manusia via `ghost-cursor`.
   - Menyelesaikan CAPTCHA via `RecaptchaPlugin`.

---

## BAB 3: DAFTAR MASALAH & ANALISIS ROOT CAUSE (LENGKAP)

Berdasarkan diskusi kita, berikut adalah **6 masalah utama** yang berhasil diidentifikasi:

### Masalah #1: Backend Hard Gate ke Gemini (Menyebabkan OpenRouter Tidak Bisa Dipakai)
- **Lokasi:** `request_pipeline.ts`.
- **Analisis:** Di dalam file ini, ada logika yang memaksa `GEMINI_API_KEY` harus ada di env. Jika tidak, backend akan `throw error` dan mematikan proses. Saat user memasukkan key OpenRouter di UI, backend tetap memeriksa `if (!GEMINI_API_KEY)` dan crash, sehingga AI tidak pernah merespons.
- **Dampak:** User merasa sudah input key valid dan saldo ada, tapi AI tidak terhubung.

### Masalah #2: RAG & Memory Fetch Dikerjakan di Frontend (Melanggar MAEF)
- **Lokasi:** `ConversationEngine.jsx` dan `MemoryService` (Frontend).
- **Analisis:** Aplikasi saat ini mengambil konteks memori dengan melakukan query ke `kernel.serviceManager.get('MemoryService')` langsung di browser. Data tersebut dikirim ke backend via HTTP. Ini membuang bandwidth, tidak aman (bisa dimanipulasi user), dan tidak memanfaatkan fitur `pgvector` di Supabase yang seharusnya bisa melakukan *similarity search* langsung di database.
- **Dampak:** Biaya token AI membengkak karena konteks yang dikirim tidak optimal, dan backend tidak memiliki kendali atas "data mana yang valid".

### Masalah #3: Prompt AI Terlalu Keras (Bertentangan dengan Konstitusi)
- **Lokasi:** `request_pipeline.ts` (bagian `agentIdentityPrompt`).
- **Analisis:** Terdapat instruksi *"ANDA HANYA BOLEH MENJAWAB BERDASARKAN DATA DARI BLOK <RAG> DAN <MEMORY> SAJA! JANGAN PERNAH MENGGUNAKAN PENGETAHUAN INTERNAL LLM ANDA!"*. 
- **Dampak:** AI menjadi bodoh. Jika database tidak punya jawaban, AI menolak menjawab, padahal Konstitusi Mamet mengizinkan AI memberi rekomendasi (HYPOTHESIS) selama diberi label status.

### Masalah #4: Activity Cluster di Dashboard Tidak Memantau Pipeline dengan Benar
- **Lokasi:** `HomeDashboard.jsx`.
- **Analisis:** Di panel grafik Force Graph, Anda sudah membuat *Pipeline Services* (Supabase, Agent, Verification), tetapi node-node ini **hanya terhubung ke `cat-telemetry`**, dan **TIDAK terhubung langsung ke `core-maef`**. Akibatnya, status merah (DOWN) pada node pipeline tidak menunjukkan "saluran terputus" ke Core secara visual.
- **Dampak:** Grafik tidak bisa digunakan untuk *monitoring* koneksi sistem secara cepat.

### Masalah #5: Kode `HomeDashboard.jsx` Spaghetti (1600 Baris)
- **Lokasi:** `HomeDashboard.jsx`.
- **Analisis:** Logika pengambilan data (`fetchData`), perhitungan statistik (`observability`, `vitals`), penyusunan node, logika warna (`getNodeColor`), dan render UI semuanya tergabung dalam satu file besar.
- **Dampak:** Sulit didebug. Jika ada bug di *Health Indicator* atau *Link* grafik, Anda harus mencari di 1600 baris tersebut tanpa arah yang jelas.

### Masalah #6: AI Tools (Cursor/Windsurf) Masih Membawa DNA "AI Agent"
- **Lokasi:** GitHub Repository & Vercel Project.
- **Analisis:** Nama repositori GitHub dan URL Deployment Vercel masih menggunakan `ai-agent-project`. Ketika AI Tools (seperti Cursor) membaca folder lokal yang bernama `ai-agent-project`, mereka membangun *semantic index* berdasarkan nama itu. Akibatnya, mereka terus menulis kode dengan pola "AI Agent" alih-alih "Mamet OS".
- **Dampak:** Sensasi UX "seperti login" terjadi karena identitas sistem masih dibayangi oleh nama lama.

---

## BAB 4: SOLUSI & LANGKAH PERBAIKAN DETAIL

### Solusi 1 (Untuk Masalah #1 & #2): Refactoring `request_pipeline.ts`
- **Hapus** baris `if (!GEMINI_API_KEY) throw...`.
- **Prioritaskan** OpenRouter: Gunakan `const OPENROUTER_API_KEY = request.headers.get('x-byok-openrouter') || process.env.OPENROUTER_API_KEY`.
- **Pindahkan Query RAG ke Backend:** Di dalam `request_pipeline.ts`, tambahkan logika Supabase query: 
  ```javascript
  const supabase = createClient(url, key);
  const { data: memories } = await supabase.rpc('match_memories', { query_embedding: userVector, match_threshold: 0.7, match_count: 5 });
  ```
  Data ini langsung dimasukkan ke dalam prompt sebagai `globalMemory`, bukan dari Frontend.

### Solusi 2 (Untuk Masalah #3): Memperbaiki Prompt AI
- Ubah instruksi di `agentIdentityPrompt` menjadi **Three-Tier System**:
  - `[STATUS: VERIFIED]` (jika data dari Database).
  - `[STATUS: HYPOTHESIS]` (jika database kosong, AI boleh memakai pengetahuan internal, dengan label).
  - `[STATUS: INSUFFICIENT]` (jika keduanya kosong, AI katakan tidak tahu).

### Solusi 3 (Untuk Masalah #4 & #5): Refactoring `HomeDashboard.jsx`
- **Pecah Kode (Refactoring):**
  - Pindahkan query data ke `hooks/useDashboardData.js`.
  - Pindahkan helper warna ke `utils/healthHelpers.js`.
  - Pindahkan Panel Kanan (Observability) ke `components/dashboard/SystemHealthPanel.jsx`.
- **Tambahkan Link Pipeline ke Core:** Di loop pembuatan node pipeline, tambahkan:
  ```javascript
  links.push({ source: service.id, target: 'core-maef', color: status === 'HEALTHY' ? '#22c55e' : '#ef4444' });
  ```

### Solusi 4 (Untuk Masalah #6): Perbaikan Identitas GitHub & Vercel
- **Langkah 1:** Buka GitHub → Settings → Rename Repository dari `ai-agent-project` menjadi `mamet-os`.
- **Langkah 2:** Di Dashboard Vercel, buat Project Baru dengan nama `mamet-os` (pilih repo baru yang sudah berganti nama). Hapus project Vercel yang lama (atau rename project name di Settings → General).
- **Langkah 3:** Tutup AI Tools (Cursor/Windsurf), rename folder lokal di komputer Anda menjadi `mamet-os`, buka kembali folder tersebut di AI Tools untuk mereset indeks konteks AI.
- **Langkah 4:** Deploy ulang Supabase Edge Function ke domain Vercel yang baru.

---

## BAB 5: STRUKTUR FOLDER & FUNGSI INTI (REFERENSI CEPAT)

| Folder / File | Fungsi Utama |
| :--- | :--- |
| `electron/main.cjs` | Menjaga window Electron, Auto-Updater, dan IPC Bridge (memanggil `airdropEngine`). |
| `electron/airdropEngine.cjs` | Mesin Bot (Puppeteer, Ghost Cursor, Recaptcha). |
| `frontend/src/App.jsx` | Entry Point UI. Memuat Kernel & menyediakan User Session. |
| `frontend/src/core/runtime/Kernel.js` | Inisialisasi sistem 10 fase, manajemen layanan (ServiceManager). |
| `frontend/src/core/runtime/services/` | Berisi `BrainService.js` (pengatur AI), `engineer.js` (eksekutor perintah), `MemoryService.js`, dll. |
| `frontend/src/components/workbench/ConversationEngine.jsx` | Chat UI, pengirim request ke Supabase, dan **Interceptor** (parsing tag `<run_airdrop>`, `<terminal>`). |
| `backend/supabase/functions/agent-process/index.ts` | Pintu masuk backend (Edge Function). |
| `backend/supabase/functions/agent-process/request_pipeline.ts` | Validasi Auth, CORS, Penyusunan Prompt, & API Key. |
| `backend/supabase/functions/agent-process/core_engine.ts` | Menjalankan pipeline AI (ContextBuilder → IntentRouter → ExecutionPlanner → SynthesisHandler). |

---

## BAB 6: CATATAN PENUTUP UNTUK "VIBE CODER"
Dokumen ini adalah **"Single Source of Truth"** Anda. 
Ke depannya, saat Anda ingin memperbaiki bug atau menambah fitur:
1. Buka dokumen ini.
2. Lihat **BAB 3** untuk mengidentifikasi apakah masalah sudah terdaftar.
3. Ambil solusi di **BAB 4**.
4. Jika ada masalah baru, tuliskan di bawah dokumen ini sebagai tambahan.

