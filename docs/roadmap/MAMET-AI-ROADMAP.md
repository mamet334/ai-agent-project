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

Status: In Progress

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

Status: Proposed

Goal:

Turn Mamet Engineer from a concept into a controlled engineering workflow.

Tasks:

- Adopt `docs/blueprints/MAMET-ENGINEER-BLUEPRINT.md`.
- Add Engineer policy boundary.
- Add Project Memory update requirement to all engineering tasks.
- Add structured task and ADR conventions.

Exit Criteria:

- Every code change can be traced to task, verification, and Project Memory.
- Engineer capability has a clear runtime policy plan.

## Phase 3: Project Memory Service

Status: Proposed

Goal:

Move Project Memory from docs-only baseline toward structured storage.

Tasks:

- Design database schema.
- Add RLS/security model.
- Add read/write API or Supabase functions.
- Add migration SQL.
- Backfill baseline docs as initial records.

Exit Criteria:

- Project Memory can store bug, root cause, task, ADR, and verification entries.
- Engineer can query Project Memory separately from User Memory and Knowledge RAG.

## Phase 4: Capability Separation

Status: Proposed

Goal:

Make Assistant, MametLite, and Engineer separate policy modes inside one Mamet AI identity.

Tasks:

- Define capability enum.
- Add policy matrix.
- Route requests by capability.
- Keep shared services controlled by capability permissions.

Exit Criteria:

- Assistant can use User Memory + Knowledge RAG.
- MametLite is lightweight and read-oriented.
- Engineer can use Project Memory and repository context.

## Phase 5: UI And Observability

Status: Proposed

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

