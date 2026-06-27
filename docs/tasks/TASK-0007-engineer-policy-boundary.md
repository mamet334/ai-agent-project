# TASK-0007: Implement Engineer Policy Boundary

Status: Done
Owner: Mamet Engineer
Date: 2026-06-27
Phase: 2

## Goal

Add explicit `appSource: "engineer"` handling to `agent-process` backend policy so that Mamet Engineer requests are identifiable, controlled, and separated from Assistant and MametLite.

## Problem

Currently only two appSource values are handled:
- `"assistant"` (default) — full AI mode, memory read/write allowed
- `"mametlite"` — read-only, no User Memory

Mamet Engineer needs its own policy boundary per MAEF Bab 10 (Capability Model) and MAMET-ENGINEER-BLUEPRINT.md Stage 2.

## Engineer Policy Requirements (from Blueprint)

Allow:
- Project Memory read (future)
- Repository-aware analysis context
- Controlled patch planning

Block:
- Unrelated User Memory writes
- Uncontrolled automation (cron_manager)
- Production deployment without explicit owner action

## Acceptance Criteria

- `agent-process` recognizes `appSource: "engineer"`
- Engineer mode inherits AI-level reasoning but blocks automation tools
- Policy logs reflect `mode: "ENGINEER"` in trace
- TASK-0007 entry added to Project Memory

## Implementation Scope

File: `supabase/functions/agent-process/index.ts`
Change: Add `isEngineer` branch in `buildUnifiedExecutionContext()`

## Verification

**Static (tsc):**
- No new syntax errors introduced.
- All errors are pre-existing Deno/remote import limitations (expected baseline).

**Deploy:**
- Deployed to BrainBox AI (ref: uuyzdjifhdfyyvpxsofu). Exit code: 0.
- `agent-process` ACTIVE, CORS confirmed.

**Policy matrix confirmed in code:**

| Capability | AI | LITE | ENGINEER |
|---|---|---|---|
| canReadRAG | ✅ | ✅ | ✅ |
| canReadMemory | ✅ | ❌ | ✅ |
| canWriteMemory | ✅ | ❌ | ❌ |
| canUseAutomation | ✅ | ❌ | ❌ |
| canUseDesktopTools | ✅ | ❌ | ❌ |
