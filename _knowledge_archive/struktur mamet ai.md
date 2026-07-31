# Struktur Alur Eksekusi Mamet AI

Berikut adalah representasi forensik dari arsitektur *Mamet AI* berdasarkan implementasi kode asli (*Evidence-Based Reality*):

```text
USER INTERACTION
│
├── A. Alur Chat & Instruksi (Mamet Full & Mametlite)
│   └── Input Chat via AIAgent.jsx / App.jsx
│       ├── Kumpulkan history & konfigurasi (Desktop/Web)
│       └── Kirim ke Endpoint: supabase/functions/agent-process
│
├── B. Alur RAG (Knowledge Base Ingestion)
│   └── Upload Dokumen via Modal Frontend
│       ├── Ekstrak File -> Teks (Client-side)
│       └── Kirim ke Endpoint: supabase/functions/rag-process
│           ├── Pemotongan teks (chunkText: 4500 karakter)
│           ├── Gemini Embedding API
│           └── Simpan Vector ke Supabase pgvector (documents & document_chunks)
│
SERVERLESS EXECUTION LAYER (supabase/functions/agent-process)
│
├── 1. Security & Identity Binding
│   ├── Auth Validation (Bearer Token JWT)
│   └── Unified Execution Policy Layer
│       └── Deteksi Injeksi & Penyalahgunaan Tools (ALLOW/BLOCK)
│
├── 2. Control Plane & Circuit Breaker
│   ├── Pengecekan Limit Harian ($0.50) via `check_daily_quota`
│   └── Async Token Tracker (Estimasi tagihan masuk ke tabel `api_usage`)
│
├── 3. Contextual Fusion (Mamet Brain)
│   ├── RAG Retrieval (Jika isRagEnabled = true)
│   │   └── Embedding Pencarian -> RPC `match_documents`
│   ├── Memory Gateway & Retrieval
│   │   ├── V2 Subgraph (Jika Aktif: extract_cognitive_subgraph -> compressCognitiveContext)
│   │   └── V1 Relational (Fallback: Deduplikasi -> Scoring -> Decay Function)
│   └── Penggabungan Konteks (System Prompt + Desktop OS Awareness + RAG + Memori)
│
├── 4. Cognitive Routing (Intent Router)
│   ├── Hardcoded Bypass (Eksekusi Lokal Desktop OS -> CHAT_BIASA)
│   ├── Analisis Kata Kunci Aksi (cron, cari, web, kode -> BUTUH_AGENT)
│   └── LLM Router Ringan (Menentukan CHAT_BIASA atau BUTUH_AGENT)
│
├── 5. Execution Pipeline
│   │
│   ├── JALUR A: Obrolan Biasa (CHAT_BIASA)
│   │   ├── Mengirim Langsung ke Main LLM Cascade
│   │   └── Async Memory Save (processMemoryWriteQueue -> fact_detector.ts)
│   │
│   └── JALUR B: Sub-Agent Orchestration (BUTUH_AGENT)
│       ├── Coordinator (Kepala Agent) Merencanakan Struktur Tugas JSON
│       ├── Dependency-Aware Graph Builder (Membagi tugas dalam Execution Tiers Parallel/Sequential)
│       ├── Sub-Agent Execution (Terisolasi dengan Hard Timeout & Budget Limit 24s)
│       │   ├── Traffic Light Model Selector (Scraper -> Groq, Coder -> OpenRouter, dll.)
│       │   └── Sub-Agents: researcher, cron_manager, file_analyzer, shopee_ninja, dll.
│       ├── Agregasi Hasil (Tier-by-Tier)
│       ├── Async Memory Save (Dari hasil output final)
│       └── Synthesizer (Menyusun Laporan Akhir)
│
├── 6. LLM Provider Cascade (Anti-Limit Engine)
│   ├── Prioritas 1: Spesifik Model User (Jika dipilih)
│   └── Prioritas Default (Multi-Key Rotation):
│       ├── 1. Gemini 2.0 Flash (Rotasi API Keys)
│       ├── 2. Groq (Llama 3.1) -> Fallback Pertama
│       └── 3. OpenRouter -> Fallback Terakhir
│
└── 7. Delivery & Client Execution
    ├── SSE Streaming (Mengirim respon Chunk per Chunk kembali ke Frontend)
    └── Desktop Native Agent (Khusus `.exe`)
        └── Mengeksekusi tag <terminal>, <edit_file>, atau <search_disk> langsung ke Hardisk User
```

Struktur ini merepresentasikan secara definitif alur data sebenarnya yang berada di lingkungan *production*, tanpa asumsi fitur abstrak yang tidak memiliki basis pada kode (*Evidence-Only*).
