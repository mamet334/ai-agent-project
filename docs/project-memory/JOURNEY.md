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
