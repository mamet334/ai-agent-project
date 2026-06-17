# Struktur Alur Eksekusi Mamet AI

Berikut adalah struktur pohon (tree structure) yang memetakan alur dari *prompt* hingga *output* secara visual:

```text
User Mengirim Prompt
│
├── 1. Frontend / UI Layer
│   ├── Mamet Full (Desktop/Web)
│   │   ├── Tangkap input di AIAgent.jsx
│   │   ├── Kumpulkan konteks (file, workspace)
│   │   └── Optimasi Token (TokenSaverAgent & MainOrchestrator)
│   │       ├── Cek Budget
│   │       └── Kompres Prompt
│   │
│   └── Mametlite (PWA Ringan)
│       ├── Tangkap input di App.jsx
│       ├── Siapkan daftar alat bantu (RAG, Web Search)
│       └── Bypass optimasi (callAgentSimple.js)
│
├── 2. Network Layer (Mengirim ke Backend)
│   └── Menuju Endpoint: supabase/functions/agent-process
│
├── 3. Backend / Serverless Layer (Edge Function)
│   ├── Validasi Keamanan (Circuit Breaker)
│   ├── Trimming (Memangkas riwayat chat lawas)
│   └── 5-Layer Anti-Limit Engine
│       ├── Coba Gemini Key #1
│       ├── ├─ Jika 429 Limit ➔ Coba Gemini Key #2, #3, dst.
│       ├── ├─ Jika Semua Gemini Gagal ➔ Cascade ke Groq (Llama 3.1)
│       └── └─ Jika Groq Gagal ➔ Cascade ke OpenRouter
│
├── 4. Action & Tooling Layer (Jika Diperlukan)
│   ├── RAG Search (Cari ke Vector Database)
│   ├── Web Search (DuckDuckGo / Jina)
│   └── Sub-Agent Spesifik (Coder, YouTube, Researcher)
│
├── 5. Response & Execution Layer
│   ├── Streaming Data (SSE) dikembalikan perlahan ke Frontend
│   └── Desktop Interceptor (Hanya untuk versi Desktop .exe)
│       ├── Jika ada perintah <terminal> ➔ Eksekusi lokal (PowerShell/CMD)
│       ├── Jika ada perintah <edit_file> ➔ Edit file lokal
│       └── Jika butuh Sandbox ➔ Jalankan Docker
│
└── 6. Output Layer
    └── Teks dan hasil eksekusi ditampilkan di layar User secara Real-time
```

Struktur ini menggambarkan bagaimana Mamet AI memisahkan beban kerja (*Frontend* untuk optimasi/UI, *Backend* untuk keamanan dan *Routing* LLM, serta eksekusi lokal pada aplikasi Desktop).
