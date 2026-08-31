MAMET AI — ROADMAP LANJUTAN (KNOWLEDGE OS PHASE 2)
Tanggal: 2026-06-28
Berdasarkan: tujuan universal.txt + permintaan arsitektur lanjutan
Status Awal: Fase 1-4 & 6 Universal Roadmap sudah selesai
============================================================


VISI PHASE 2
------------
Membangun KNOWLEDGE GOVERNANCE LAYER di atas Evidence Pipeline yang sudah ada.
Bukan lagi hanya "LLM dengan bukti" — tetapi "Knowledge Operating System"
yang mengatur siklus hidup, konflik, versi, dan kepercayaan setiap knowledge.

Analogi: Phase 1 = membangun fondasi rumah.
         Phase 2 = membangun sistem listrik, air, dan tata kelola rumah.


============================================================
12 PRIORITAS PHASE 2
============================================================


PRIORITAS 1 — Knowledge Governance Engine [SELESAI DIKERJAKAN]
===============================================================
Bintang: 5/5 | Status: SELESAI

Masalah: Tidak ada yang mengatur status ADR, Vision, MAEF.
         Engineer bisa mengambil ADR-0005 yang sudah SUPERSEDED oleh ADR-0018.

Solusi yang diimplementasikan:
  SQL: setup_knowledge_governance.sql
    - Tambah kolom governance_status ke project_memory_entries
      Enum: DRAFT | REVIEW | VERIFIED | APPROVED | ACTIVE | DEPRECATED | ARCHIVED | SUPERSEDED
    - Tambah kolom superseded_by UUID (self-reference)
    - Fungsi SQL: get_active_knowledge() — hanya return ACTIVE/APPROVED/VERIFIED
    - Fungsi SQL: supersede_knowledge(old_id, new_id) — atomic supersede
    - Trigger: prevent_double_active (satu knowledge hanya boleh punya satu versi ACTIVE)
    - View: knowledge_governance_summary

Dampak di index.ts:
  - Brain 1 Loader diperbarui: HANYA load governance_status IN ('ACTIVE', 'APPROVED', 'VERIFIED')
  - Jika ADR sudah SUPERSEDED → tidak masuk ke Brain 1
  - Log: "[GOVERNANCE] ADR-0005 SUPERSEDED, skipped."


PRIORITAS 2 — Version Management [SELESAI DIKERJAKAN]
======================================================
Bintang: 5/5 | Status: SELESAI

Masalah: Vision v1 dan v3 bisa keduanya ada di DB.
         Engineer mungkin ambil yang lama.

Solusi yang diimplementasikan:
  SQL: setup_knowledge_governance.sql
    - Tambah kolom: version_major, version_minor, version_patch, is_current
    - is_current = TRUE hanya untuk versi terbaru
    - Fungsi SQL: create_new_version(entry_id, new_content, bump_type)
      bump_type: 'major' | 'minor' | 'patch'
      Otomatis set is_current=FALSE pada versi lama
    - View: current_knowledge_versions
    - Brain 1 Loader: filter tambahan is_current = TRUE

Dampak:
  - Vision yang diambil Brain 1 DIJAMIN yang terbaru
  - Version history tetap tersimpan (is_current=FALSE)


PRIORITAS 3 — Conflict Resolver [SELESAI DIKERJAKAN]
=====================================================
Bintang: 5/5 | Status: SELESAI

Masalah: Vision berkata "Cloud First", ADR berkata "Local First" — siapa menang?
         Tidak ada komponen yang mendeteksi konflik.

Solusi yang diimplementasikan:
  SQL: setup_knowledge_governance.sql
    - Tabel baru: knowledge_conflicts
      Fields: entry_a_id, entry_b_id, conflict_type, description,
              resolution_status (OPEN|RESOLVED|IGNORED), resolved_by_id
    - Fungsi SQL: detect_keyword_conflicts(entry_ids[]) — deteksi konflik berbasis keyword

  TypeScript: lib/confidence_engine.ts
    - Fungsi: countActiveConflicts(entryIds[]) — hitung konflik aktif
    - Konflik aktif mengurangi confidence score
    - Di prompt: "[CONFLICT DETECTED] Vision vs ADR-0018 — Vision takes precedence."

  Policy: Hierarchy konflik: Vision > MAEF > ADR > Solution > Lesson > Task


PRIORITAS 4 — Knowledge Lifecycle [SELESAI DIKERJAKAN]
======================================================
Bintang: 4/5 | Status: SELESAI

Masalah: Knowledge langsung ACTIVE tanpa review.

Lifecycle yang diimplementasikan:
  DRAFT → REVIEW → VERIFIED → APPROVED → ACTIVE → DEPRECATED → ARCHIVED

  SQL: setup_knowledge_governance.sql
    - Kolom governance_status menggantikan kolom 'status' lama
    - Fungsi: advance_lifecycle(entry_id, new_status) dengan validasi transisi legal
    - Transisi ilegal akan di-reject oleh fungsi SQL
    - Trigger: log_lifecycle_change → tabel lifecycle_audit_log

  Aturan di Brain Loader:
    - Brain 1 HANYA load: ACTIVE, APPROVED, VERIFIED
    - DRAFT dan REVIEW tidak pernah masuk ke LLM context


PRIORITAS 5 — Universal Evidence Contract [SELESAI DIKERJAKAN]
===============================================================
Bintang: 5/5 | Status: SELESAI

Masalah: Format payload ke LLM belum terstandar.
         Ganti GPT ke Claude → format bisa berbeda.

Solusi yang diimplementasikan:
  TypeScript: lib/universal_evidence_contract.ts
    - Interface UniversalEvidenceContract dengan 6 blok:
        IDENTITY: nama, mode, kapabilitas
        MEMORY: konteks memori user
        KNOWLEDGE: Brain 1 + Brain 2 + RAG
        RUNTIME: task aktif, verifikasi terakhir
        CONSTRAINT: apa yang boleh dan tidak boleh dilakukan
        OUTPUT_CONTRACT: format output yang diharapkan

  Fungsi: buildUniversalContract(ctx, evidenceReport, confidenceReport)
    → menghasilkan string payload yang bisa dikirim ke GPT/Claude/Gemini/Llama
    → format SAMA, tidak peduli LLM mana yang dipakai

  Integrasi di index.ts:
    - Menggantikan penyusunan fullSystemContext yang tersebar
    - Universal contract dibangun SETELAH Evidence Gate PASSED


PRIORITAS 6 — Knowledge Graph [SELESAI DIKERJAKAN]
===================================================
Bintang: 4/5 | Status: SELESAI (SQL layer)

Masalah: Knowledge masih berupa dokumen terpisah tanpa relasi eksplisit.

Solusi yang diimplementasikan:
  SQL: setup_knowledge_governance.sql
    - Tabel baru: knowledge_relationships
      Fields: from_id, to_id, relation_type, strength, created_by, notes
      relation_type: INFLUENCES | SUPERSEDES | GENERATED | IMPLEMENTS |
                     CONFLICTS_WITH | REFERENCES | CAUSED_BY | RESOLVED_BY
    - View: knowledge_graph_summary
    - Fungsi: get_related_knowledge(entry_id, depth) — traversal graph

  TypeScript: confidence_engine.ts
    - buildSourceTrace() menggunakan relasi graph untuk tracing jawaban


PRIORITAS 7 — Runtime Contract (Formalisasi) [SELESAI DIKERJAKAN]
==================================================================
Bintang: 5/5 | Status: SELESAI

Masalah: Evidence Gate sudah ada tapi belum menjadi kontrak formal backend.

Solusi yang diimplementasikan:
  TypeScript: lib/universal_evidence_contract.ts
    - RuntimeContract section mencakup:
        evidence_gate_verdict: PASSED | BLOCKED | WARNING
        minimum_evidence_required: by mode
        allowed_knowledge_types: by mode
        forbidden_actions: by mode

  Integrasi:
    - RuntimeContract SELALU ada di setiap request
    - LLM menerima kontrak ini di awal system prompt
    - Jika BLOCKED: backend tidak kirim ke LLM sama sekali


PRIORITAS 8 — Confidence Engine [SELESAI DIKERJAKAN]
====================================================
Bintang: 4/5 | Status: SELESAI

Masalah: Confidence selama ini dari LLM (tidak objektif).

Solusi yang diimplementasikan:
  TypeScript: lib/confidence_engine.ts
    - Fungsi: calculateConfidence(evidenceReport, conflictCount, versionStatus)
    - Formula backend (deterministic):
        base = 50
        + evidenceCount * 8 (max +40)
        - conflictCount * 15
        + (is_current ? 10 : -20)
        + (verificationPass ? 10 : 0)
        - (mode=ENGINEER && brain=0 ? 20 : 0)
    - Output: ConfidenceReport { score(0-100), grade(A/B/C/D/F), breakdown }
    - Injeksi ke sistem prompt: [BACKEND_CONFIDENCE: 87% | Grade: B]


PRIORITAS 9 — Source Trace [SELESAI DIKERJAKAN]
================================================
Bintang: 5/5 | Status: SELESAI

Masalah: Tidak ada cara tahu jawaban Engineer berdasarkan evidence apa.

Solusi yang diimplementasikan:
  TypeScript: lib/confidence_engine.ts
    - Interface SourceTraceItem: { type, id, title, status, version, relationship }
    - Fungsi: buildSourceTrace(brain1, brain2, rag, memory)
    - Output: array semua evidence yang digunakan, siap ditampilkan di frontend

  Format output di response:
    [SOURCE_TRACE]
    1. [ADR] ADR-0006 Two-Brain Model — ACTIVE v1.0.0
    2. [TASK] TASK-042 Evidence Gate Implementation — InProgress
    3. [RAG] knowledge-doc.pdf — Space: CORE
    4. [MEMORY] 3 memory nodes loaded

  Di audit log (evidence_audit_logs):
    - source_trace disimpan sebagai JSONB untuk query kemudian


PRIORITAS 10 — Knowledge Health Monitor [SELESAI DIKERJAKAN]
============================================================
Bintang: 4/5 | Status: SELESAI (SQL View + API Endpoint)

Masalah: Tidak ada dashboard kesehatan knowledge.

Solusi yang diimplementasikan:
  SQL: setup_knowledge_governance.sql
    - View: knowledge_health_dashboard
      Menampilkan: total_active, total_deprecated, total_draft,
                   total_superseded, open_conflicts, orphan_knowledge,
                   missing_verification, health_score(0-100)
    - Orphan knowledge: knowledge tanpa relationship DAN tanpa task/verification

  Edge Function: supabase/functions/knowledge-health/index.ts
    - GET /knowledge-health → return health dashboard JSON
    - Auth-protected
    - Bisa dipakai frontend untuk menampilkan status kesehatan knowledge


PRIORITAS 11 — Migration Layer (Enhanced) [SELESAI DIKERJAKAN]
===============================================================
Bintang: 4/5 | Status: SELESAI (enhancement dari backup-export yang ada)

Catatan: backup-export sudah ada dari roadmap sebelumnya.
         Yang ditambahkan: dukungan format SQL dan metadata governance.

Solusi yang diimplementasikan:
  Update backup-export/index.ts:
    - Format baru: 'sql' → export sebagai INSERT statements
    - Sertakan tabel governance baru dalam backup:
        knowledge_relationships, knowledge_conflicts
    - Export metadata versi setiap knowledge entry

  Tujuan:
    - Export JSON → import ke PostgreSQL lokal
    - Export JSON → import ke SQLite (future)
    - Mamet tidak tergantung Supabase


PRIORITAS 12 — Policy Engine [SELESAI DIKERJAKAN]
==================================================
Bintang: 5/5 | Status: SELESAI

Masalah: Aturan tersebar di seluruh index.ts (if-else berulang).
         Tidak ada satu tempat yang menjadi "hakim aturan".

Solusi yang diimplementasikan:
  TypeScript: lib/policy_engine.ts
    - Class PolicyEngine dengan semua aturan terpusat:
        evaluate(mode, action, context) → PolicyDecision
    - Semua aturan didefinisikan di POLICY_RULES array:
        { mode, action, condition, decision, reason }
    - Actions yang di-cover:
        CALL_LLM, WRITE_MEMORY, READ_MEMORY, USE_WEB, USE_AUTOMATION,
        USE_DESKTOP, WRITE_KNOWLEDGE, USE_WORKSPACE, ANSWER_WITHOUT_EVIDENCE
    - Output PolicyDecision: { allow, reason, constraints, auditNote }

  Integrasi di index.ts:
    - PolicyEngine.evaluate() dipanggil di awal setiap request
    - Menggantikan logika if-else yang tersebar


============================================================
FILE YANG DIBUAT/DIUBAH
============================================================

FILE BARU:
  1. setup_knowledge_governance.sql      — SQL: Governance + Version + Graph + Conflict + Health
  2. supabase/functions/agent-process/lib/policy_engine.ts     — Priority 12
  3. supabase/functions/agent-process/lib/confidence_engine.ts — Priority 8 + 9
  4. supabase/functions/agent-process/lib/universal_evidence_contract.ts — Priority 5 + 7
  5. supabase/functions/knowledge-health/index.ts              — Priority 10 API
  6. roadmap lanjutan phase 2.txt                             — Dokumen ini

FILE DIUBAH:
  7. supabase/functions/agent-process/index.ts
     - Import: policy_engine, confidence_engine, universal_evidence_contract
     - Brain 1 Loader: filter governance_status + is_current
     - Setelah Evidence Gate: build confidence report + source trace
     - Universal contract sebagai payload ke LLM
  8. supabase/functions/backup-export/index.ts
     - Tambah tabel knowledge_relationships, knowledge_conflicts
     - Tambah format 'sql'


============================================================
LANGKAH MANUAL YANG DIPERLUKAN
============================================================

1. JALANKAN SQL DI SUPABASE:
   Buka Supabase Dashboard → SQL Editor
   Copy-paste isi: setup_knowledge_governance.sql
   Klik Run

2. DEPLOY EDGE FUNCTIONS:
   supabase functions deploy agent-process
   supabase functions deploy knowledge-health

3. MIGRASI DATA LAMA:
   UPDATE project_memory_entries
   SET governance_status = 'ACTIVE',
       is_current = TRUE,
       version_major = 1,
       version_minor = 0,
       version_patch = 0
   WHERE status = 'Verified';

   UPDATE project_memory_entries
   SET governance_status = 'DEPRECATED'
   WHERE status = 'Deprecated';


============================================================
END OF PHASE 2 ROADMAP
============================================================
