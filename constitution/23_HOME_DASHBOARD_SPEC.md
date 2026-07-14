# MAMET KNOWLEDGE GRAPH DASHBOARD CONSTITUTION

## Context
Mamet OS bukan admin dashboard.
Mamet OS adalah AI Operating System.
Dashboard Home bukan digunakan untuk KPI bisnis, chart penjualan, atau analytics tradisional.

Dashboard Home adalah:
> Visualisasi otak Mamet secara realtime.

Tujuan dashboard adalah membuat Owner dapat melihat:
* apa yang diketahui Mamet
* bagaimana pengetahuan saling terhubung
* bagaimana memory berkembang
* bagaimana RAG berkembang
* bagaimana Supabase berkembang
* bagaimana ecosystem saling terhubung

---

## SUPREME VISUAL INSPIRATION
Primary inspiration:
* Obsidian Graph View
* Hermes Knowledge Graph
* Neural Network Visualization
* Knowledge Constellation

Bukan:
* ERP Dashboard
* Admin Panel
* SaaS Metrics Dashboard
* CRM Dashboard

---

## CORE PRINCIPLE
Dashboard harus terasa seperti:
> melihat otak Mamet dari luar.

Owner harus dapat melihat:
* neuron
* koneksi
* cluster
* pertumbuhan pengetahuan
* pusat gravitasi pengetahuan

---

## CENTRAL NODE
Node pusat mutlak:
`SUPABASE`

Supabase adalah jantung sistem.
Semua koneksi berasal dari sini.

---

## FIRST LAYER NODES
Node utama yang terhubung langsung ke Supabase:
* User Memory
* RAG Knowledge
* Conversations
* Workspace Data
* Documents
* Embeddings
* Memory Relations
* API Usage
* Audit Logs
* System Logs
* Knowledge Spaces
* Edge Functions
* Storage
* Auth
* Realtime

---

## SECOND LAYER NODES
Setiap kategori memiliki node turunannya.

Contoh:

**USER MEMORY**
* preference
* identity
* project
* work
* skills
* goals
* decisions

**RAG KNOWLEDGE**
* PDF
* DOCX
* Markdown
* Website
* Research
* Projects

**CONVERSATION**
* Lite
* Assistant
* Engineer
* Workspace Chat

---

## DYNAMIC GROWTH
Jumlah node harus mengikuti isi database.

Contoh:
- Jika user memiliki `10 memories`, maka graph kecil.
- Jika user memiliki `1000 memories`, maka graph membesar.
- Jika user memiliki `10000 memories`, maka graph terlihat seperti Obsidian Graph.

Semakin pintar Mamet, semakin besar graph.

---

## RELATIONSHIP RULE
Setiap garis harus mewakili relasi nyata.

Contoh:
`user_memories` ↓ `memory_relations` ↓ `documents` ↓ `document_chunks` ↓ `embeddings`

Jika relasi tidak ada di Supabase: jangan digambar.
Graph harus berasal dari database sebenarnya.
Bukan dummy data.

---

## NODE COLORS
* **Green:** Memory
* **Purple:** RAG
* **Blue:** Workspace
* **Yellow:** Conversation
* **White:** Infrastructure
* **Red:** Errors / Alerts

---

## HOME SCREEN LAYOUT

```text
┌─────────────────────────────────────────────┐
│                MAMET BRAIN                  │
│                                             │
│         •     •      •                      │
│      •     SUPABASE    •                    │
│   •     •     ●     •     •                │
│      • USER MEMORY •                        │
│                                             │
│  RAG ●──────────● CONVERSATION             │
│                                             │
│      WORKSPACE ●                            │
│                                             │
└─────────────────────────────────────────────┘
```

---

## RIGHT PANEL
Tampilkan informasi realtime:
* Total Memories
* Total Documents
* Total Embeddings
* Total Conversations
* Total Workspaces
* Database Size
* API Usage
* Health Score

---

## LIVE MODE
* Jika memory bertambah: node baru muncul.
* Jika document diupload: cluster baru muncul.
* Jika memory relation dibuat: garis baru muncul.

Dashboard harus terasa hidup.

---

## EMOTIONAL GOAL
Ketika Owner membuka Home Dashboard, Owner harus merasakan:
> "Saya sedang melihat otak Mamet hidup dan tumbuh."

Bukan:
> "Saya sedang melihat dashboard admin."

Graph tersebut bisa menjadi debugger memory, debugger RAG, debugger relasi, observability tool, health monitor, dan knowledge explorer—sehingga Home benar-benar menjadi jendela menuju otak Mamet.
