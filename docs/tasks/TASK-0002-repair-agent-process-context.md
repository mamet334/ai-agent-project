# TASK-0002: Repair Agent Process Execution Context

Status: In Progress
Owner: Mamet Engineer

## Goal

Restore `supabase/functions/agent-process/index.ts` to valid TypeScript/Deno code while preserving the intended execution policy, auth binding, RAG, memory, streaming, and plugin orchestration behavior.

## Problem

The current file contains invalid context code such as:

- `ctx.auth.userId` used as a type property
- `ctx.request.finalMessage` used as a type property
- `ctx` used before it is declared
- `ctx.request.ctx.request.finalMessage`

## Acceptance Criteria

- The execution context type uses valid property names.
- `ctx` is created before any `ctx.*` access.
- Auth user ID is bound from Supabase JWT, not trusted from client payload.
- Existing response shape remains compatible with `frontend` and `mametlite`.
- Syntax/build verification is run.

## Progress

- Replaced invalid dotted property names in `MametExecutionContext`.
- Created `ctx` before policy-based capability filtering.
- Replaced invalid object literal shorthand usages with explicit property names.
- Fixed `retrieveMemories` call arity.
- Added MametLite-aware `canReadMemory` and `canWriteMemory` policy.

## Verification

Ran:

```powershell
frontend\node_modules\.bin\tsc.cmd --noEmit --allowImportingTsExtensions --module esnext --target es2022 --moduleResolution bundler supabase\functions\agent-process\index.ts
```

Result:

- No syntax errors remain in `agent-process/index.ts`.
- Remaining errors are expected from using Node TypeScript against Deno remote imports plus existing type issues in related modules.
