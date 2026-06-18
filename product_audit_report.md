# 📋 Laporan Audit Produk Teknis: Mamet AI
**Disusun oleh:** Technical Product Manager
**Tujuan:** Identifikasi ekosistem fitur, pemetaan arsitektur, dan evaluasi *Product-Market Fit* (PMF) dari Mamet AI.

---

## 1. Identifikasi Seluruh Fitur (Ecosystem Overview)
Mamet AI bukan sekadar *chatbot*, melainkan sistem asisten otonom hibrida (Web/Desktop) yang dilengkapi dengan penyimpanan memori jangka panjang, agen periset, eksekutor tugas terjadwal, dan pemonitor performa. 

Daftar modul utama yang ditemukan dalam proyek:
- **Core Chat Engine** (Antarmuka percakapan utama berbasis Gemini).
- **Memory Manager (V1)** (Sistem pengingat dan penangkap konteks personal).
- **Cron Manager** (Sistem eksekutor tugas terjadwal di belakang layar).
- **Shopee Ninja (Jalur 1 & 2)** (Modul pembuat link afiliasi otomatis ke Telegram).
- **RAG / Knowledge Base** (Sistem ekstraksi dokumen dan penyediaan konteks PDF/teks).
- **Deep Research / Scraper** (Sistem pencarian web dan analisis mendalam).
- **Observability & Billing Dashboard** (Panel pemantauan *cost*, latensi, dan performa AI).
- **Surgical Code Editor (Phase 3)** (Pengubah file lokal spesifik melalui Electron).

---

## 2. Fitur yang Benar-Benar Berfungsi (Production-Ready)
Fitur-fitur ini telah dikunci, stabil, dan dioptimalkan (terutama secara biaya) untuk penggunaan sehari-hari:

🟢 **Core Chat Engine (Gemini Pro/Flash)** - Stabil dengan latensi 2-4 detik dan 100% *Cost-Shielded*.
🟢 **Smart Rule-Based Memory** - Sistem penyimpanan fakta, *project*, *task*, dan *deadline* dengan ekstraksi regex 0 biaya ($0 cost).
🟢 **Observability Dashboard** - Pemantauan metrik *Real-Time* (LLM Calls, Memory Fetch, Error Flags) yang tersimpan otomatis di tabel Supabase `ai_system_logs`.
🟢 **Billing Dashboard & Circuit Breaker** - Sistem pelacak biaya yang akan memutus aliran jika batas harian ($0.50) tercapai.
🟢 **PWA & Electron Desktop Shell** - Antarmuka yang bisa diinstal di *Desktop* maupun berjalan di *Web Browser*.

---

## 3. Fitur yang Masih Eksperimen / Perlu Perbaikan (Experimental)
Fitur-fitur ini ada di dalam basis kode, namun rentan *error*, memakan biaya mahal, atau arsitekturnya dimatikan/di-banned sementara:

🟡 **Multi-Agent System (Router, Classifier, Summarizer)** - Saat ini *BANNED* (di-bypass) demi efisiensi biaya. Kode sub-agen (`researcher`, `coder`, `scraper`) masih ada di dalam sistem plugin namun tidak dipanggil secara dinamis oleh AI.
🟡 **Shopee Ninja (Autonomous Mode)** - Integrasi Telegram `BotFather` dan penjadwalan *Cron* terkadang menabrak pembatasan (*rate-limit*) atau kehilangan konteks jika antrean terlalu panjang.
🟡 **RAG & Vector Embeddings** - Fitur *retrieval* berbasis vektor (AI Embeddings) saat ini diturunkan paksa menjadi pencarian *string* sederhana demi pemangkasan biaya *server*.
🟡 **Surgical Edit (Electron File API)** - Masih bergantung pada sinkronisasi *path* absolut sistem OS pengguna yang rawan gagal jika folder dipindah.

---

## 4. Diagram Arsitektur Sederhana (Cost-Shielded Mode)
Arsitektur saat ini mengadopsi model *Single Response Engine* yang tangguh dan murah.

```mermaid
flowchart TD
    A[User (Web/Electron Desktop)] -->|Chat / Request| B(Frontend: React + Vite)
    B -->|API Fetch| C{Supabase Edge Function: agent-process}
    
    C -->|1. Preprocessing| D[Rule-Based Keyword Extractor]
    D -->|Match 'tugas/project/deadline'| E[(Supabase DB: user_memories)]
    
    C -->|2. Context Fetch| F[Ambil 5 Memori Relevan]
    F --> E
    
    C -->|3. Single AI Call| G[Gemini 1.5 Pro / Flash]
    G -->|Teks Jawaban| C
    
    C -->|4. Observability| H[(Supabase DB: ai_system_logs)]
    C -->|Respons Data| B
```

---

## 5. Ringkasan Tech Stack
Mamet AI dibangun dengan ekosistem modern (*Better Stack*):

*   **Frontend UI:** React.js, Vite, TailwindCSS, Recharts (Visualisasi).
*   **Desktop Wrapper:** Electron.js (Akses *Native File System*, Auto-Updater).
*   **Backend / Serverless:** Supabase Edge Functions (Deno / TypeScript).
*   **Database & Auth:** Supabase PostgreSQL (Tabel: `chats`, `user_memories`, `ai_system_logs`, `scheduled_tasks`), Supabase Auth.
*   **AI Models:** Google Gemini (1.5 Pro / 2.0 Flash) terhubung langsung via REST API dengan *fetch timeout guardrails*.

---

## 6. Keunggulan Mamet Dibanding Chatbot Biasa (ChatGPT/Claude)
Mengapa Mamet AI lebih dari sekadar "pembungkus" API?

1.  **Ingatan Persisten Terarah:** Berbeda dengan ChatGPT yang mengandalkan satu *thread* obrolan panjang yang membengkak, Mamet mengisolasi fakta (project, tugas) ke dalam *database* terpisah, sehingga ingatan bisa dipertahankan selamanya tanpa menghabiskan kuota *Context Window*.
2.  **Proteksi Kantong (Cost Shield):** Memiliki dasbor analitik biaya sendiri, limit sirkuit otomatis ($0.50), dan jaminan **maksimal 1 panggilan AI per klik**, memastikan pengguna tidak akan pernah bangkrut karena *hidden background loop*.
3.  **Eksekusi Sistem File Lokal (Phase 3):** Melalui Electron, Mamet tidak hanya memberi kode, tetapi memiliki otorisasi (*Surgical Edit*) untuk langsung menulis dan mengedit kode ke dalam folder kerja *(Hardisk)* pengguna.
4.  **Otonomi Terjadwal:** Fitur *Cron* memungkinkan Mamet menjalankan tugas (seperti melempar link afiliasi Shopee ke Telegram) saat pengguna tertidur.
5.  **Audit Transparan:** Pengguna memiliki kendali penuh dan pemantauan 100% *real-time* atas latensi server dan *error* lewat *Observability Dashboard*, sebuah fitur yang biasanya hanya dimiliki level *Enterprise*.
