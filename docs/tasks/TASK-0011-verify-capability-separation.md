# TASK-0011: Verify Capability Separation

Status: Done
Owner: Mamet Engineer
Phase: 4
Date: 2026-06-27

## Goal

Verify that Phase 4 (Capability Separation) is fully implemented by the existing `MametCapabilityMode` in the `agent-process` Edge Function.

## Context

During Phase 1 and Phase 2, we progressively implemented capability boundaries for MametLite (`appSource: 'mametlite'`) and Mamet Engineer (`appSource: 'engineer'`). This task serves to formally audit the `agent-process` policy layer to ensure it meets the Phase 4 Exit Criteria without requiring new code changes.

## Acceptance Criteria

- [x] Capability Enum exists (`MametCapabilityMode`).
- [x] Policy Matrix is comprehensive.
- [x] Requests are routed by capability (`appSource`).
- [x] Shared services respect capability permissions (e.g., tools, memory writing).
- [x] Assistant mode: can use User Memory + Knowledge RAG.
- [x] MametLite mode: lightweight, read-oriented, no User Memory writes.
- [x] Engineer mode: uses Project Memory, no uncontrolled automation/writes.

## Verification

Code review of `agent-process/index.ts` confirms:
1. `type MametCapabilityMode = "AI" | "LITE" | "ENGINEER";` is defined.
2. Mode routing uses `appSource`:
   - `engineer` -> ENGINEER
   - `mametlite` -> LITE
   - else -> AI
3. Tool filtration respects `ctx.policy.canUseAutomation` and `canUseDesktopTools`.
4. Therefore, Phase 4 is natively fulfilled by prior architecture updates.
