# Architecture Gaps

Status: Active

This file records differences between MAEF, Vision, architecture, and current implementation.

## GAP-0001: Project Memory did not exist as a first-class repository area

Status: In Progress

MAEF and Vision require Project Memory as a source of truth for Engineer. The repository previously had scattered audit notes, reports, and scratch files, but no canonical Project Memory location.

Resolution started:

- Added `docs/project-memory/PROJECT-MEMORY.md`
- Added ADR and task structure

## GAP-0002: MametLite is not fully isolated from full Assistant memory behavior

Status: In Progress

MametLite is defined as fast and read-oriented. Existing notes indicate it may share `agent-process` with full Mamet behavior and may risk memory retrieval/write coupling unless explicit source boundaries are enforced.

Required next step:

- Continue verifying the explicit request source boundary `appSource: "mametlite"`.
- Ensure MametLite does not write User Memory unless explicitly allowed.
- Verify RAG remains read-oriented for MametLite.

Progress:

- `mametlite/src/lib/callAgentSimple.js` now sends `appSource: "mametlite"`.
- `agent-process` policy now disables User Memory read/write for MametLite by default.

## GAP-0003: `agent-process/index.ts` contains syntactically invalid context code

Status: In Progress

The current file contains invalid TypeScript-like identifiers in type definitions and object literals, including `ctx.auth.userId` as a property name and `ctx` usage before declaration.

Required next step:

- Continue focused repair task.
- Verify with native Deno/Supabase tooling when available.

Progress:

- Invalid dotted shorthand context fields were replaced with valid explicit properties.
- `ctx` is now created before capability filtering.
- `tsc` parse check no longer reports syntax errors in `agent-process/index.ts`; remaining errors are Deno/remote import limitations and existing type issues in related modules.

## GAP-0004: Build pipeline fails on Windows path handling

Status: Resolved

Both `frontend` and `mametlite` production builds fail because Vite/Rollup receives absolute Windows paths for emitted `index.html`.

Resolution:

- The failure was caused by running through PowerShell `npm.ps1`/path handling.
- Running builds through `cmd` with `npm.cmd run build` succeeds for both `frontend` and `mametlite`.
