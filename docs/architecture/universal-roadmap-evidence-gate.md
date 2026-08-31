MAMET AI — UNIVERSAL ROADMAP
Berdasarkan: tujuan universal.txt
Tanggal: 2026-06-28
Status: Fase 1-4 & 6 SELESAI DIKERJAKAN
============================================================


VISI AKHIR
----------
Membangun Knowledge Operating System (KOS) untuk AI — bukan sekadar chatbot.
LLM hanya mesin inferensi yang bisa diganti (GPT -> Claude -> Gemini -> lokal).
Identitas Mamet tetap berasal dari backend.

Artinya: jika suatu hari Anda mengganti GPT -> Claude -> Gemini -> model lokal,
tidak ada yang berubah pada "kepribadian" Mamet. Yang berubah hanya mesin inferensinya.
Semua identitas tetap berasal dari backend.


============================================================
STATUS AUDIT KODE
============================================================

Komponen                  | Status Sebelum                                  | Status Sekarang
--------------------------|--------------------------------------------------|--------------------------------------------------
Evidence Pipeline         | Evidence Contract ada tapi LLM tetap dipanggil  | SELESAI — Hard Gate, Engineer diblok jika ev=0
Anti-Hallucination        | Hanya instruksi di prompt teks                  | SELESAI — EVIDENCE_GATE_VERDICT di system prompt
Source of Truth           | Brain 1 & 2 sudah ada di Engineer mode          | Tidak berubah (sudah bagus)
Pisah Assistant/Engineer  | appSource routing sudah ada                     | Tidak berubah (sudah bagus)
Project Memory            | Ada di DB (project_memory_entries, dll)         | Tidak berubah (sudah bagus)
Backup/Restore            | BELUM ADA                                       | SELESAI — 2 Edge Function baru
Auditability              | agent_logs parsial                              | SELESAI — evidence_audit_logs granular per request
Local First               | BELUM ADA                                       | Roadmap jangka panjang


============================================================
8 FASE ROADMAP
============================================================


FASE 1 — Hard Evidence Gate [STATUS: SELESAI]
----------------------------------------------
Prioritas: TERTINGGI

Masalah sebelumnya:
  Jika totalEvidence === 0, sistem hanya mencatat di teks contract.
  LLM tetap dipanggil dan bisa halusinasi ADR, MAEF, Task yang tidak ada.

Yang sudah dikerjakan di index.ts:
  - Import validateEvidence dan buildBlockedResponse dari evidence_validator.ts
  - Blok evidence contract lama diganti dengan validateEvidence()
  - Jika verdict === 'BLOCKED' (Engineer + evidence=0):
      Pipeline dihentikan TOTAL
      Respons terstruktur dikirim ke user
      LLM tidak dipanggil sama sekali
  - EVIDENCE_GATE_VERDICT diinjeksikan ke system prompt di semua kasus

File yang diubah:
  supabase/functions/agent-process/index.ts


FASE 2 — Evidence Validator Component [STATUS: SELESAI]
---------------------------------------------------------
File baru: supabase/functions/agent-process/lib/evidence_validator.ts

Interface EvidenceReport:
  - requestId: string
  - userId: string
  - mode: string (LITE | AI | ENGINEER)
  - brain1Count: number (Static knowledge: ADR, Lesson, Solution)
  - brain2Count: number (Dynamic: Tasks + Gaps + Verifications)
  - ragCount: number (RAG documents retrieved)
  - memoryCount: number (User memory nodes)
  - totalEvidence: number
  - isValid: boolean
  - blockReason: string | null
  - verdict: 'PASSED' | 'BLOCKED' | 'WARNING'
  - gateVerdictText: string (diinjeksikan ke system prompt)

Rules:
  RULE 1: Engineer + totalEvidence=0 -> BLOCKED (hard stop, LLM tidak dipanggil)
  RULE 2: Engineer + brain kosong tapi ada RAG/memory -> WARNING (lanjut tapi dibatasi)
  RULE 3: Non-Engineer + zero RAG + zero memory -> WARNING (boleh jawab dari pengetahuan umum)
  Default: PASSED

Exported functions:
  - validateEvidence(input: EvidenceInput): EvidenceReport
  - buildBlockedResponse(report: EvidenceReport, userMessage: string): string


FASE 3 — Granular Evidence Audit Log [STATUS: SELESAI]
-------------------------------------------------------
File baru: setup_evidence_audit_log.sql

Tabel: evidence_audit_logs
Fields:
  - id UUID (primary key)
  - request_id TEXT
  - user_id UUID (references auth.users)
  - mode TEXT (LITE | AI | ENGINEER)
  - app_source TEXT
  - brain1_count, brain2_count, rag_count, memory_count INTEGER
  - total_evidence INTEGER
  - brain1_ids, brain2_tasks, brain2_gaps, rag_docs JSONB
  - verdict TEXT (PASSED | BLOCKED | WARNING)
  - block_reason TEXT
  - llm_called BOOLEAN
  - message_preview TEXT (100 char pertama)
  - routing_scope TEXT (CORE | WORKSPACE)
  - workspace_id UUID
  - created_at TIMESTAMPTZ

RLS:
  - service_role: full access (untuk Edge Function)
  - authenticated: hanya baca log miliknya sendiri

View: evidence_audit_summary (analisis harian per mode & verdict)
Function: cleanup_old_evidence_logs() (hapus log > 30 hari)

LANGKAH MANUAL YANG DIPERLUKAN:
  Jalankan setup_evidence_audit_log.sql di Supabase Dashboard -> SQL Editor


FASE 4 — Backup & Restore System [STATUS: SELESAI]
---------------------------------------------------
Filosofi: "Dengan begitu Anda tidak terkunci pada Supabase."

File baru 1: supabase/functions/backup-export/index.ts
  Endpoint: POST /backup-export
  Body: { format: 'json' | 'markdown' | 'summary' }

  Format json:  Full data export semua tabel ke JSON
  Format markdown: Human-readable export (Project Memory, Tasks, Gaps, Spaces, Docs, Memories)
  Format summary: Statistik saja (jumlah row per tabel)

  Tabel yang di-backup:
    - knowledge_spaces
    - documents (BUKAN document_chunks — bisa di-re-embed ulang)
    - project_memory_entries
    - engineering_tasks
    - architecture_gaps
    - verification_runs
    - user_memories
    - agent_logs
    - evidence_audit_logs

  Auth: hanya bisa export data milik user sendiri

File baru 2: supabase/functions/backup-restore/index.ts
  Endpoint: POST /backup-restore
  Body: { backup: <JSON dari backup-export>, mode: 'dry_run' | 'restore', tables?: string[] }

  Mode dry_run: validasi backup tanpa menyimpan (aman)
  Mode restore: upsert data ke DB (50 rows per batch)

  Auth: hanya bisa restore backup milik user sendiri
  Safety: user_id di-override ke user yang merestore (tidak bisa inject user lain)

LANGKAH SETELAH RESTORE:
  Re-embed dokumen via rag-process untuk regenerate document_chunks + embedding vector


FASE 5 — Source of Truth Completeness [STATUS: PERLU AUDIT MANUAL DB]
----------------------------------------------------------------------
Pastikan ada entri di tabel project_memory_entries untuk:
  - entry_type: 'Vision'    -> Visi proyek Mamet AI
  - entry_type: 'MAEF'      -> Mamet AI Engineering Framework
  - entry_type: 'ADRLink'   -> Architecture Decision Records
  - entry_type: 'Solution'  -> Keputusan solusi yang sudah diambil
  - entry_type: 'Lesson'    -> Lesson learned dari proyek
  - entry_type: 'RootCause' -> Root cause analysis

Cara cek di Supabase:
  SELECT entry_type, COUNT(*) FROM project_memory_entries
  WHERE status = 'Verified'
  GROUP BY entry_type;


FASE 6 — Anti-Hallucination Hard Stop [STATUS: SELESAI — terintegrasi Fase 1+2]
---------------------------------------------------------------------------------
EVIDENCE_GATE_VERDICT diinjeksikan ke system prompt setiap request:

  BLOCKED -> LLM tidak dipanggil. User mendapat pesan terstruktur.
  WARNING -> LLM dipanggil dengan instruksi ketat: jangan sebut data yang tidak ada.
  PASSED  -> LLM dipanggil dengan daftar lengkap evidence yang boleh dirujuk.

Format teks yang diinjeksikan:
  [EVIDENCE_GATE_VERDICT: PASSED]
  Mode: ENGINEER | Total Evidence: 12
  Brain1(Static): 5 | Brain2(Dynamic): 4 | RAG: 2 | Memory: 1
  STATUS: PASSED — Evidence valid.
  Brain1 Loaded: ADR-001, ADR-002, Lesson-Fix-RAG (+2 more)
  Brain2 Tasks: TASK-042, TASK-043
  INSTRUKSI: Anda HANYA BOLEH menggunakan evidence yang terdaftar di atas.


FASE 7 — Project Memory Cleanup [STATUS: BELUM DIKERJAKAN — Background Task]
------------------------------------------------------------------------------
Langkah yang perlu dilakukan:
  1. Query dokumen RAG yang tidak pernah matched selama 30 hari
  2. Hapus document_chunks duplikat (similarity > 0.99)
  3. Verifikasi semua knowledge_spaces masih aktif
  4. Arsipkan project_memory_entries yang statusnya 'Deprecated'

Query cek dokumen tidak aktif (jalankan di Supabase):
  SELECT d.title, d.created_at
  FROM documents d
  LEFT JOIN document_chunks dc ON dc.document_id = d.id
  WHERE d.created_at < NOW() - INTERVAL '30 days'
  GROUP BY d.id, d.title, d.created_at
  HAVING COUNT(dc.id) = 0;


FASE 8 — Local First Architecture [STATUS: JANGKA PANJANG]
-----------------------------------------------------------
Vision: Mamet berjalan tanpa internet kecuali LLM cloud.

Arsitektur target:
  Laptop -> PostgreSQL (Docker) -> pgvector -> Storage lokal
         -> Embedding (Ollama) -> Mamet -> LLM (cloud atau lokal)

Jika internet mati, tetap bisa:
  - Engineer mode (Brain 1 & 2 dari DB lokal)
  - Project Memory (ADR, Task, Gap dari DB lokal)
  - RAG retrieval (vector search dari pgvector lokal)

Yang masih perlu internet:
  - LLM cloud (Gemini, Claude, GPT)
  - Kecuali menggunakan model lokal (Ollama, LM Studio)

Langkah pertama:
  1. Buat docker-compose.yml: PostgreSQL + pgvector
  2. Export schema Supabase -> port ke Docker PostgreSQL
  3. Test koneksi Mamet ke DB lokal
  4. Buat environment variable switcher: SUPABASE vs LOCAL_PG


============================================================
FILE YANG DIBUAT/DIUBAH
============================================================

1. supabase/functions/agent-process/index.ts
   -> DIUBAH: Import evidence_validator, integrasi Hard Gate, audit log background task

2. supabase/functions/agent-process/lib/evidence_validator.ts
   -> BARU DIBUAT: Evidence Validator Component

3. setup_evidence_audit_log.sql
   -> BARU DIBUAT: SQL untuk tabel evidence_audit_logs

4. supabase/functions/backup-export/index.ts
   -> BARU DIBUAT: Backup Export Edge Function

5. supabase/functions/backup-restore/index.ts
   -> BARU DIBUAT: Backup Restore Edge Function

6. mamet universal roadmap.txt (file ini)
   -> BARU DIBUAT: Dokumentasi roadmap permanen di dalam project


============================================================
LANGKAH MANUAL YANG MASIH DIPERLUKAN
============================================================

1. JALANKAN SQL DI SUPABASE:
   Buka Supabase Dashboard -> SQL Editor
   Copy-paste isi file: setup_evidence_audit_log.sql
   Klik Run

2. DEPLOY EDGE FUNCTIONS:
   supabase functions deploy agent-process
   supabase functions deploy backup-export
   supabase functions deploy backup-restore

3. AUDIT ISI DB:
   Pastikan project_memory_entries punya entri Vision, MAEF, ADR
   (lihat panduan di Fase 5)

4. TEST BACKUP:
   Coba POST ke /backup-export dengan format: 'summary'
   Verifikasi semua tabel critical tidak EMPTY


============================================================
PRINSIP ARSITEKTUR (dari tujuan universal.txt)
============================================================

"Bukan membangun AI yang bergantung pada GPT-4o Mini, Claude, atau model tertentu,
melainkan membangun backend yang cukup kuat sehingga model apa pun yang dipasang
akan 'berperilaku sebagai Mamet'."

Lapisan Knowledge Operating System:

IDENTITY LAYER  -> Vision, MAEF, ADR, Rules (project_memory_entries)
MEMORY LAYER    -> Project Memory, Lessons, Decisions (project_memory_entries)
KNOWLEDGE LAYER -> RAG, Dokumen, Referensi (documents + document_chunks)
RUNTIME LAYER   -> Active Task, Verification, Gaps, Git Diff (engineering_*)
AUDIT LAYER     -> Log, Confidence, Source Evidence, History (evidence_audit_logs)

============================================================
END OF ROADMAP
============================================================
