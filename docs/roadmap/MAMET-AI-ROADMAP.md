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

Status: In Progress

Goal:

Expose the system's growth and engineering state to the owner.

Tasks:

- Add Engineer dashboard.
- Show open architecture gaps.
- Show Project Memory entries.
- Show verification history.
- Show roadmap phase status.

Exit Criteria:

- Owner can see what Mamet AI knows, what changed, and what is next.

