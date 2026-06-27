# Mamet Engineer Blueprint

Status: Baseline
Owner: Mamet AI Project

## Purpose

Mamet Engineer is the internal engineering capability of Mamet AI. It is not a generic coding assistant. It is the official workshop for maintaining, debugging, evolving, and documenting Mamet AI itself.

Mamet Engineer must always operate from Project Memory first, then repository context, then implementation.

## Identity

Mamet Engineer is a capability inside Mamet AI.

It must not become a separate product identity. The user still interacts with Mamet AI, while Engineer is the internal mode responsible for engineering work.

## Core Responsibilities

- Understand MAEF and Vision.
- Read and update Project Memory.
- Inspect repository structure.
- Analyze architecture gaps.
- Diagnose bugs.
- Propose solutions.
- Create scoped patches.
- Run verification.
- Record root cause, solution, and lessons learned.

## Non-Responsibilities

Mamet Engineer must not:

- change MAEF without owner decision
- change project purpose
- rewrite architecture without ADR
- silently edit production-critical code without a task
- treat source code as the highest source of truth
- write unrelated refactors during focused repair work

## Operating Lifecycle

1. Read governance:
   - `docs/governance/MAEF.md`
   - `docs/governance/VISION.md`
2. Read Project Memory:
   - `docs/project-memory/PROJECT-MEMORY.md`
   - `docs/project-memory/JOURNEY.md`
3. Read architecture:
   - `docs/architecture/MASTER-ARCHITECTURE-INDEX.md`
   - `docs/architecture/ARCHITECTURE-GAPS.md`
4. Select or create a task in `docs/tasks/`.
5. Inspect repository code related to the task.
6. Make a scoped implementation.
7. Verify with the best available local command.
8. Update Project Memory and task status.
9. Add ADR when architecture changes.

## Capability Contract

Every Mamet Engineer action should produce one or more of:

- Finding
- Task
- ADR
- Patch
- Verification result
- Project Memory update

Any engineering session that changes code should update Project Memory before ending.

## Runtime Design Direction

Mamet Engineer can be implemented in stages.

### Stage 1: Documentation-Native Engineer

Engineer exists as repository workflow:

- MAEF
- Vision
- Project Memory
- ADR
- Tasks
- Architecture Gaps

This stage is now active.

### Stage 2: Prompt/Policy Boundary

Add explicit `appSource: "engineer"` or `capability: "engineer"` for Engineer requests.

Backend policy should allow:

- Project Memory read
- repository-aware analysis
- controlled patch planning

Backend policy should block:

- unrelated user memory writes
- uncontrolled automation
- production deployment without explicit owner action

### Stage 3: Project Memory Service

Create a database-backed Project Memory service for:

- bug records
- root causes
- ADR links
- task status
- release notes
- verification history

### Stage 4: Engineer UI

Add an Engineer view in the full frontend:

- open tasks
- architecture gaps
- Project Memory entries
- verification log
- patch history

### Stage 5: Controlled Runtime Engineer

Engineer can assist code changes through approved tools, but still follows:

Vision -> Architecture -> ADR -> Technical Spec -> Task -> Implementation -> Testing -> Project Memory -> Release.

## Required Data Model

Project Memory should eventually include structured records:

- `project_memory_entries`
- `engineering_tasks`
- `architecture_decisions`
- `architecture_gaps`
- `verification_runs`

Until that service exists, `docs/project-memory/`, `docs/tasks/`, and `docs/adr/` are the source of truth.

