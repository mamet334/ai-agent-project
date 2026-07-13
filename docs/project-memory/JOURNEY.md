# Mamet AI Journey Log

Purpose: menyimpan alur perjalanan pengembangan Mamet AI agar pekerjaan bisa dilanjutkan tanpa kehilangan konteks.

## 2026-06-27 - Vision Baseline And Engineering Foundation

Status: Saved

### Trigger

Owner menambahkan:

- `MAMET AI VISION DOCUMENT.txt`
- `mamet ai engineering framework(MAEF).md`

Arahan owner: pahami visi Mamet AI dan lakukan perubahan yang diperlukan.

### Vision Understood

Mamet AI bukan chatbot, bukan AI coding biasa, dan bukan sekadar RAG.

Mamet AI adalah personal AI Operating System dengan:

- satu identitas utama: Mamet AI
- banyak capability internal: Assistant, MametLite, Engineer
- shared services: User Memory, Knowledge RAG, Project Memory
- LLM sebagai reasoning engine yang bisa diganti
- knowledge sebagai aset utama
- Project Memory sebagai sumber kebenaran engineering

### Engineering Principle Saved

MAEF ditetapkan sebagai konstitusi engineering tertinggi.

Urutan otoritas:

1. MAEF
2. Vision
3. Master Architecture Index
4. System Architecture
5. ADR
6. Technical Specification
7. Development Standard
8. Engineering Blueprint
9. Roadmap
10. Repository
11. Runtime System

### Files Added

- `docs/governance/MAEF.md`
- `docs/governance/VISION.md`
- `docs/architecture/MASTER-ARCHITECTURE-INDEX.md`
- `docs/architecture/ARCHITECTURE-GAPS.md`
- `docs/project-memory/PROJECT-MEMORY.md`
- `docs/project-memory/JOURNEY.md`
- `docs/adr/ADR-0001-maef-as-highest-authority.md`
- `docs/tasks/TASK-0001-maef-documentation-baseline.md`
- `docs/tasks/TASK-0002-repair-agent-process-context.md`
- `docs/tasks/TASK-0003-mametlite-source-boundary.md`
- `docs/tasks/TASK-0004-repair-windows-build.md`

### Code Changes

#### MametLite Boundary

File:

- `mametlite/src/lib/callAgentSimple.js`

Change:

- MametLite request now sends `appSource: "mametlite"`.

Purpose:

- Backend can distinguish MametLite from full Assistant.
- MametLite can stay lightweight and read-oriented.

#### Agent Process Context Repair

File:

- `supabase/functions/agent-process/index.ts`

Changes:

- Repaired invalid execution context structure.
- Created `ctx` before policy-based capability filtering.
- Replaced invalid dotted object properties with valid explicit properties.
- Added `appSource` into request handling.
- Added MametLite-aware policy:
  - `canReadMemory: false`
  - `canWriteMemory: false`
  - `canWriteKnowledge: false`
  - `canUseAutomation: false`
  - `canUseWorkspace: false`
- Fixed `retrieveMemories` call arity.
- Fixed Unicode regex flag in request risk scoring.

Purpose:

- Align runtime behavior with the Vision and MAEF.
- Prevent MametLite from silently inheriting full Assistant memory behavior.
- Begin turning `agent-process` into a controlled orchestrator.

### Verification

Passed:

```cmd
cd mametlite
npm.cmd run build
```

Passed:

```cmd
cd frontend
npm.cmd run build
```

Partial check:

```powershell
frontend\node_modules\.bin\tsc.cmd --noEmit --allowImportingTsExtensions --module esnext --target es2022 --moduleResolution bundler supabase\functions\agent-process\index.ts
```

Result:

- No syntax errors remain in `agent-process/index.ts`.
- Remaining errors are expected from checking Deno remote imports with Node TypeScript and from pre-existing type issues in related modules.

Native Deno/Supabase validation was not run because `deno` was not available in PATH.

### Current Known Architecture Gaps

- `agent-process` still needs native Deno/Supabase validation.
- Mamet Engineer is not yet a separate runtime capability.
- Project Memory exists as docs baseline, but not yet as database-backed internal service.
- The original `README.md` is older and partially out of date.
- Original vision text appears truncated at `Rejecte`; normalized in `docs/governance/VISION.md` as `Rejected`.

### Next Recommended Work

1. Run native Supabase/Deno validation for `agent-process`.
2. Finish `TASK-0002`: repair remaining runtime/type issues in Edge Function and related modules.
3. Finish `TASK-0003`: verify MametLite isolation in real request logs.
4. Create ADR for MametLite isolation after runtime verification.
5. Design Project Memory database/service layer.
6. Create Mamet Engineer capability blueprint.
7. Update old README and architecture docs to point to MAEF-first flow.

### Continuation Instruction

When continuing this project, start here:

1. Read `docs/governance/MAEF.md`.
2. Read `docs/governance/VISION.md`.
3. Read `docs/project-memory/PROJECT-MEMORY.md`.
4. Read this journey log.
5. Check `docs/architecture/ARCHITECTURE-GAPS.md`.
6. Continue from open tasks in `docs/tasks/`.

## 2026-06-27 - Mamet Engineer Blueprint And Roadmap

Status: Saved

### Trigger

Owner asked for the next step to realize the main vision.

### Decision

The next foundation is Mamet Engineer, because Vision defines Engineer as the official workshop that keeps Mamet AI evolving through Project Memory.

### Files Added

- `docs/blueprints/MAMET-ENGINEER-BLUEPRINT.md`
- `docs/roadmap/MAMET-AI-ROADMAP.md`
- `docs/adr/ADR-0002-mamet-engineer-as-internal-capability.md`
- `docs/tasks/TASK-0005-mamet-engineer-blueprint.md`
- `docs/tasks/TASK-0006-project-memory-service-design.md`

### What This Establishes

- Mamet Engineer is an internal capability, not a separate identity.
- Engineer must start from MAEF, Vision, Project Memory, Architecture, and Task before touching code.
- Project Memory is required future infrastructure for runtime Engineer.
- The roadmap now has phases from governance foundation to runtime capability separation and UI observability.

### Next Recommended Work

1. Continue `TASK-0002` until native Supabase/Deno validation passes.
2. Continue `TASK-0003` with runtime verification of MametLite isolation.
3. Start `TASK-0006` by designing the Project Memory database schema.

---

## 2026-06-23 to 2026-06-27 — Major Runtime Hardening Phase

Status: Saved (Retroactive entry — previously undocumented)

### Trigger

Multiple sessions focused on hardening Mamet AI's runtime security, observability, and integrity.

### Milestones Completed

#### Auth Binding Layer (2026-06-23)

- Replaced client-provided user IDs with JWT-authenticated identities in `agent-process`
- Eliminated IDOR vulnerabilities by enforcing server-authoritative auth in `buildUnifiedExecutionContext`
- Added `IdentityBlock` to `UniversalEvidenceContract`

#### Capability-Based Permission Model (2026-06-26)

- Refactored `agent-process` to use granular capability flags in `ExecutionContext`
- Introduced `PolicyEngine` with 11 rules (P-001 to P-011)
- Filtered tool access via capability flags: `canReadMemory`, `canWriteMemory`, `canUseWebSearch`, `canUseDesktopTools`, `canUseAutomation`
- Isolated MametLite from administrative capabilities

#### Knowledge Workspace Architecture (2026-06-24)

- Implemented universal hierarchical Knowledge Workspace system
- Migrated DB schema to support `knowledge_spaces` with space-based document ownership
- Deployed `knowledge_manager` sub-agent for workspace CRUD operations
- Enforced RAG data integrity via RAG Hard Isolation Layer with `p_space_id` routing

#### Two-Brain Context Model (2026-06-24 to 2026-06-27) — ADR-0006

- Formalized split between Static Engineering Knowledge (Brain 1) and Dynamic Engineering Context (Brain 2)
- Brain 1: loads `ACTIVE/APPROVED/VERIFIED` entries from `project_memory_entries`
- Brain 2: loads live `engineering_tasks`, `architecture_gaps`, `verification_runs` per request
- Governance-aware: SUPERSEDED/DEPRECATED entries blocked from Brain 1

#### Engineering Metrics — ADR-0007

- Defined 6 derived metrics from existing DB tables
- Documented that 4 of 9 Vision metrics are deferred (Average Confidence, Patch Acceptance Rate, Review Accuracy, Recurring Bug Rate) pending schema additions

#### Runtime Evidence Violations Hardening (2026-06-27)

- Implemented `UniversalEvidenceContract` — 6-block contract enforcing standard payload structure
- Implemented `ConfidenceEngine` — backend-deterministic scoring (0-100) based on evidence, conflicts, verification
- Implemented `VerificationEngine` — structural hard gate checking trace format, evidence, confidence presence
- Implemented `validateEvidence` — evidence count gate for ENGINEER mode (P-001)
- Added granular telemetry (`EVIDENCE_GATE` log) for audit of evidence delivery to LLM

### Lessons Learned

- `appSource` dari JWT metadata adalah variabel keamanan kritis. Jangan pernah ambil dari payload klien.
- Two-Brain Model signifikan mengurangi token usage dan meningkatkan relevansi konteks Engineer.
- VerificationEngine saat ini hanya structural check, bukan content check — ini adalah GAP-NEW-004 yang harus diselesaikan.
- Policy Engine (`policy_engine.ts`) adalah single source of truth untuk semua capability decisions — pertahankan filosofi ini.

### ADRs Created

- ADR-0003: Auth Binding Layer
- ADR-0004: Evidence-First Engineering
- ADR-0005: Unified Execution Policy
- ADR-0006: Two-Brain Context Model
- ADR-0007: Engineering Metrics Derived

---

## 2026-06-29 — Constitution v2 Enforcement & Architecture Audit

Status: Saved

### Trigger

Owner menetapkan MAEF v2 dan Vision Constitution v2 sebagai Source of Truth tertinggi dan memerintahkan audit menyeluruh terhadap repository.

### Decision

Tidak ada fitur baru. Fokus pada alignment terhadap konstitusi.

### Process

1. **Tahap 1 — Constitution Review:** Membaca MAEF v2 dan Vision v2 secara menyeluruh. Mengidentifikasi area yang tidak selaras.
2. **Tahap 2 — Architecture Gap Report:** Membandingkan MAEF → Vision → Repository → Runtime. Menemukan 18 gap total (4 Critical, 6 Major, 4 Minor, 4 Informational).
3. **Tahap 3 — Roadmap Alignment:** Menyusun 6 gelombang implementasi berdasarkan prinsip risiko rendah, backward compatible, incremental, deterministic.
4. **Tahap 4 — Implementation Plan:** 10 task dengan scope, test criteria, rollback plan, dan dependensi yang jelas.

### Constitution Review Report

Tersimpan di: `docs/architecture/CONSTITUTION-REVIEW-REPORT-2026-06-29.md`

### Wave 1 Executed (2026-06-29)

Task yang diselesaikan:
- **TASK-NEW-001:** Deprecated `docs/governance/MAEF.md` dan `docs/governance/VISION.md` — GAP-NEW-001 dan GAP-NEW-002 closed
- **TASK-NEW-002:** Updated `docs/architecture/MASTER-ARCHITECTURE-INDEX.md` — hirarki dokumen v2 established — GAP-NEW-014 closed
- **TASK-NEW-003:** Updated `docs/architecture/ARCHITECTURE-GAPS.md` — semua 18 gap disinkronkan — GAP-NEW-006 closed
- **TASK-NEW-004:** Updated `docs/project-memory/JOURNEY.md` (dokumen ini) — GAP-NEW-012 closed
- **TASK-NEW-009:** Added `scratch/README.md` — status scratch files jelas — GAP-NEW-013 closed

Files changed in Wave 1:

| File | Perubahan |
|---|---|
| `docs/governance/MAEF.md` | Added DEPRECATED header |
| `docs/governance/VISION.md` | Added DEPRECATED header |
| `docs/architecture/MASTER-ARCHITECTURE-INDEX.md` | Full rewrite with v2 hierarchy |
| `docs/architecture/ARCHITECTURE-GAPS.md` | Added 18 gaps from Constitution Review |
| `docs/project-memory/JOURNEY.md` | Added retroactive + Wave 1 entries |
| `scratch/README.md` | Created — declares scratch as non-production |

### Gaps Closed in Wave 1

- GAP-NEW-001: ✅ MAEF v1 deprecated
- GAP-NEW-002: ✅ Vision v1 deprecated
- GAP-NEW-006: ✅ Architecture Gap Register synced
- GAP-NEW-012: ✅ JOURNEY.md updated
- GAP-NEW-013: ✅ Scratch files labeled
- GAP-NEW-014: ✅ Master Architecture Index v2 established

### Open Gaps Remaining

| Gap | Severity | Wave |
|---|---|---|
| GAP-NEW-003 | Critical | Wave 5 |
| GAP-NEW-004 | Critical | Wave 6 |
| GAP-NEW-005 | Major | Wave 3 |
| GAP-NEW-007 | Major | Wave 2 |
| GAP-NEW-008 | Major | Wave 2 |
| GAP-NEW-009 | Major | Future |
| GAP-NEW-010 | Major | Wave 4 |
| GAP-NEW-011 | Minor | Future |
| GAP-NEW-015 | Info | Backlog |
| GAP-NEW-016 | Info | Backlog |
| GAP-NEW-017 | Info | Backlog |
| GAP-NEW-018 | Info | Backlog |

### Lessons Learned

- Constitution review yang sistematis menemukan 18 gap yang sebelumnya tidak terdokumentasi — validasi bahwa proses ini diperlukan secara periodik.
- Gap terbesar bukan di runtime (yang sudah solid) melainkan di governance layer (MAEF dual-version, Project Memory hybrid).
- Wave 1 (documentation only) bisa diselesaikan tanpa risiko runtime sama sekali dan menutup 6 dari 18 gap.

### Next Steps

Wave 2: Schema migration DB — `confidence_score` dan `patch_accepted` columns.

---

## 2026-07-11 — Tool Dispatcher Shadow Mode + Backend Authority Architecture

Status: Saved

### Trigger

Penyelesaian *Architecture Gaps* yang berkaitan dengan kedaulatan kepemilikan (*Owner Sovereignty*) dan tata kelola eksekusi (*Execution Governance*). Agenda ini berfokus mengunci jalur eksekusi alat agar tak dapat dieksploitasi oleh halusinasi LLM atau manipulasi *frontend*.

### Milestones Completed

- **RFC-015 Tool Dispatcher (Phase 1-3):** 
  Diimplementasikan di *agent-process* sebagai *Single Choke Point* untuk seluruh eksekusi alat. Menggunakan arsitektur *Shadow Mode* (hanya observasi/log) untuk menghimpun metrik telemetri `TOOL_DISPATCHER_AUDIT` tanpa memecah alur klien.
- **Security Hardening (RuntimeContext & Recursive Dispatch):** 
  Perlindungan *null-check* ketat dan penghitung kedalaman *dispatch* (maksimal 5) demi mencegah ancaman *infinite recursion loop*. Kegagalan validasi langsung dilempar sebagai `DENY_ON_INTERNAL_ERROR` (*fail-closed*).
- **Risk Gate Expanded Evasion Patterns:** 
  Perluasan daftar hitam (*blacklist*) regex untuk menjegal vektor destruktif berantai, *encoding payload* (base64, certutil), serta alias sistem seperti `Remove-Item` atau `shred`.
- **Engineering Metrics Dashboards (GAP-NEW-007):** 
  Pembaruan kolom database (`patch_accepted`, `review_confirmed`, `bug_category`) dan penyempurnaan skrip metrik berbasis SQL untuk menangkap ke-9 metrik sesuai *Vision Constitution*.
- **RFC-016 Backend Authoritative Execution Architecture:** 
  Pembuatan draf arsitektur masa depan yang mengajukan konsep *Signed Execution Token* (SET), dirancang untuk memangkas *authority* dari *Svelte Desktop* dan menyerahkannya secara absolut ke Backend, menargetkan keamanan absolut *Zero Rogue Edits*.

### Lessons Learned

- AI Agent tidak cukup memiliki intelijensi. Ia membutuhkan *governance*.
- LLM bukanlah penguasa (*authority*), melainkan sekadar mesin *reasoning*. Eksekusi aktual tidak boleh serta merta tunduk pada *generation* LLM yang bersifat probabilistik.
- Pemaksaan kontrol eksekusi (Hard Enforcement) secara sepihak rentan merusak pengalaman operasional (*false positives*). Arsitektur transisional semacam *Shadow Mode* sangat mendesak.
- Telemetri asinkron tak bergaransi (*fire-and-forget*) di Edge Functions terbukti korup apabila proses mati; pemblokiran *await* tersinkronisasi adalah mitigasi terbaiknya.

### Gaps Closed / Evolved

- **GAP-NEW-007:** ✅ Resolved (Semua 9 Engineering Metrics kini berinfrastruktur penuh)
- **GAP-NEW-019:** ⏳ Open / Transitioning (Masih *Shadow Mode*, tertunda menanti realisasi RFC-016)

### Next Recommended Work

1. Kumpulkan metrik operasional dari *Shadow Mode* (`TOOL_DISPATCHER_AUDIT`).
2. Tinjau *False Positive* dan *False Negative* untuk validasi keamanan *Risk Gate*.
3. Fokus penyelesaian Gaps yang bersisa seperti GAP-NEW-009 (Self Engineering Lifecycle).

