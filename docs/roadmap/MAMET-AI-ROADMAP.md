# Mamet AI Roadmap

Status: Baseline
Owner: Mamet AI Project

## North Star

Mamet AI becomes a personal AI Operating System with one identity, many internal capabilities, structured memory, replaceable reasoning engines, and owner-controlled evolution.

## Phase 0: Governance Foundation

Status: Done

Deliverables:

- MAEF baseline
- Vision baseline
- Master Architecture Index
- Architecture Gap register
- Project Memory baseline
- Journey log
- Initial ADR and task structure

## Phase 1: Stabilize Core Runtime

Status: Done

Goal:

Make the current Supabase-first runtime reliable enough to build on.

Tasks:

- Finish `TASK-0002`: repair `agent-process` context and validation.
- Finish `TASK-0003`: verify MametLite source boundary in runtime behavior.
- Add native Deno/Supabase validation path.
- Record all runtime fixes in Project Memory.

Exit Criteria:

- `agent-process` passes native validation.
- Full frontend build passes.
- MametLite build passes.
- MametLite does not read/write User Memory by default.

## Phase 2: Mamet Engineer Foundation

Status: Done

Goal:

Turn Mamet Engineer from a concept into a controlled engineering workflow.

Deliverables:

- TASK-0005: Mamet Engineer Blueprint adopted. Done.
- TASK-0006: Project Memory Service designed. Done.
- TASK-0007: Engineer policy boundary (`appSource: "engineer"`) active in production. Done.
- ADR-0003: Engineer Capability Mode documented. Done.

Exit Criteria — Verified:

- Every code change is traced to task, verification, and Project Memory. ✅
- Engineer capability has a clear runtime policy plan. ✅

## Phase 3: Project Memory Service

Status: Done

Goal:

Move Project Memory from docs-only baseline toward structured database storage queryable by Mamet Engineer.

Tasks:

- TASK-0008: Execute schema migration (Done).
- TASK-0009: Backfill existing Project Memory docs to database (Done).
- TASK-0010: Integrate Project Memory read into agent-process Engineer mode (Done).

Design artifacts available:

- `docs/tasks/TECH-SPEC-0006-project-memory-service.md`
- `docs/tasks/project-memory-schema-draft.sql`

Exit Criteria:

- Project Memory can store bug, root cause, task, ADR, and verification entries.
- Engineer can query Project Memory separately from User Memory and Knowledge RAG.

## Phase 4: Capability Separation

Status: Done

Goal:

Make Assistant, MametLite, and Engineer separate policy modes inside one Mamet AI identity.

Tasks:

- Define capability enum. (Done)
- Add policy matrix. (Done)
- Route requests by capability. (Done)
- Keep shared services controlled by capability permissions. (Done)

Exit Criteria:

- Assistant can use User Memory + Knowledge RAG. (Verified)
- MametLite is lightweight and read-oriented. (Verified)
- Engineer can use Project Memory and repository context. (Verified)

## Phase 5: UI And Observability

Status: Done

Goal:

Expose the system's growth and engineering state to the owner.

Tasks:

- Add Engineer dashboard. (Done — TASK-0012)
- Show open architecture gaps. (Done)
- Show Project Memory entries. (Done)
- Show verification history. (Done)
- Show roadmap phase status. (Done)

Exit Criteria:

- Owner can see what Mamet AI knows, what changed, and what is next. ✅

## Phase 6: Engineer as Reviewer

Status: Done

Goal:

Engineer can review code changes with full architectural context.

Deliverables:

- ADR-0004: Scoped Review + Two-Dimensional Confidence. Done.
- TASK-0014: Integrate 4-pillar review context into system prompt. Done.
- Review pipeline: Task → Affected Files → Git Diff → Relevant ADR → Relevant Coding Rules. Done.
- Engineer must request git diff from user before reviewing. Done.

Exit Criteria:

- Engineer refuses to review without git diff. ✅
- Confidence output has Coverage + Evidence Strength. ✅

## Phase 7: Engineer as Implementer

Status: Done

Goal:

Engineer can generate code patches with safety verification before apply.

Deliverables:

- ADR-0005: Implementer Safety Flow. Done.
- TASK-0015: Self Verification block mandatory before User Review. Done.
- Safety flow: Generate Patch → Self Verification (syntax, arch, rules, dep) → User Review → Apply. Done.

Exit Criteria:

- Every patch includes Self Verification block. ✅
- AI outputs "Awaiting User Review before Apply." ✅

## Phase 8: Self Maintenance

Status: Done

Goal:

Engineer can monitor overall project health, not just error logs.

Deliverables:

- Health Report covers both BRAIN 1 (Static) and BRAIN 2 (Dynamic). Done.
- Deprecated ADR lazy-loaded only on conflict/history keywords. Done.
- Monitoring dimensions: Gaps, Tasks, Verifications, Dependencies, Tests. Done.

Exit Criteria:

- Health report output covers 6+ dimensions. ✅
- Deprecated ADR loaded only when relevant. ✅

## Post-Baseline: Observability Layer

Status: Done

Goal:

Provide structured context separation and measurable engineering metrics.

Deliverables:

- ADR-0006: Two-Brain Context Model (Static Knowledge vs Dynamic Context). Done.
- ADR-0007: Engineering Metrics as Derived Queries. Done.
- TASK-0016: 6 derived metrics defined with SQL queries. Done.
- Health Snapshot query verified against live Supabase data. Done.

Exit Criteria:

- Engineer prompt explicitly labels BRAIN 1 and BRAIN 2 sources. ✅
- All 6 metrics can be computed from existing tables without schema changes. ✅

