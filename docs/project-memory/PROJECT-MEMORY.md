# Mamet AI Project Memory

Status: Baseline
Owner: Mamet Engineer

## Purpose

Project Memory is the durable engineering memory of Mamet AI. It is the source of truth for what the project has learned through architecture decisions, bugs, root causes, fixes, testing, and releases.

Source code can change. Project Memory keeps the experience.

## Journey Log

The chronological development trail is stored in:

- `docs/project-memory/JOURNEY.md`

## Current Understanding

Mamet AI is a personal AI Operating System with multiple internal capabilities:

- Assistant: full daily assistant
- MametLite: lightweight read-oriented mode
- Engineer: internal engineering capability

The LLM is a replaceable reasoning engine. The durable asset is knowledge.

## Repository Map

| Area | Meaning |
| --- | --- |
| `frontend/` | Full Mamet AI web and Electron client |
| `mametlite/` | Lightweight client for RAG and research |
| `supabase/functions/agent-process/` | Main AI orchestrator |
| `supabase/functions/rag-process/` | Document ingestion and embedding |
| `backend/` | Legacy Express backend |
| `docs/` | Architecture, governance, tasks, ADR, Project Memory |
| `lib/`, `api/` | Memory/cognition experiments and API modules |
| `scratch/` | Investigation and patch scripts, not source of truth |

## Verified Findings

### PM-0001: Modern runtime is Supabase-first

Status: Verified

The full frontend and MametLite call Supabase Edge Functions for agent processing. `backend/server.js` exists, but it is legacy relative to the current Supabase-based runtime.

### PM-0002: `agent-process/index.ts` context repair

Status: Resolved ✅

The file had invalid context object code. All dotted property names and premature `ctx` usage have been repaired.

Update 2026-06-27 (Static Verification):

- `MametExecutionContext` type uses valid property names.
- `ctx` is created before any `ctx.*` access (line 266).
- `AUTH_USER_ID` bound from Supabase JWT (line 205), not from client payload.
- `canReadMemory: !isMametLite` and `canWriteMemory: mode === "AI" && !isMametLite` enforced at policy layer.
- Node tsc parse: no syntax errors.

Deploy verification 2026-06-27 (Session: Antigravity):

- Deployed to BrainBox AI (ref: uuyzdjifhdfyyvpxsofu) via `npx supabase functions deploy`.
- Deployed as **version 246**, status: ACTIVE.
- Runtime check: `OPTIONS /functions/v1/agent-process` → HTTP 200, CORS header `*` confirmed.
- `health-check` function → HTTP 200 confirmed (Supabase Edge runtime is live).
- `agent_logs` table accessible (no entries yet — awaiting first user request post-deploy).

### PM-0003: UI production builds

Status: Resolved

Verification 2026-06-27 (Session: Antigravity):

- `mametlite`: `cmd /c cd mametlite && npm run build` → **✓ built in 627ms**. Output: `dist/assets/index-g-RIn69p.js 413.27 kB`.
- `frontend`: `cmd /c cd frontend && npm run build` → **✓ built in 17.48s**. Post-build script (crossorigin + CSP strip) ran successfully. Exit code: 0.

Root cause (historical): PowerShell `npm.ps1` path handling. Fixed by using `cmd`.

GAP-0004: Closed.

## Open Engineering Tasks

- `TASK-0001`: Establish MAEF-aligned documentation baseline.
- `TASK-0002`: Repair `agent-process` execution context. Status: **Done ✅**. Deployed v246. Runtime CORS/OPTIONS confirmed.
- `TASK-0003`: Enforce MametLite source boundary. Status: **Done ✅**. Policy live in deployed v246. `appSource: 'mametlite'` enforced at payload and backend.
- `TASK-0004`: Repair Windows build pipeline. Status: **Done ✅**. Re-verified 2026-06-27.
- `TASK-0005`: Create Mamet Engineer Blueprint. Status: Done.
- `TASK-0006`: Design Project Memory Service. Status: Proposed.

## Memory Update Rule

Every meaningful engineering change should add or update:

- finding
- root cause
- solution
- verification
- related ADR or task
