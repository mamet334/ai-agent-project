# TASK-0003: Enforce MametLite Source Boundary

Status: In Progress
Owner: Mamet Engineer

## Goal

Make MametLite explicitly read-oriented and lightweight, as required by Vision and MAEF.

## Problem

MametLite shares `agent-process` with full Mamet AI. Without an explicit source boundary, MametLite may inherit memory retrieval, memory write, or heavy orchestration behavior intended for the full Assistant.

## Proposed Direction

- Add `appSource: "mametlite"` to MametLite requests.
- Add backend policy handling for `appSource`.
- Disable background User Memory writes for MametLite by default.
- Keep RAG and web/research behavior lightweight.

## Acceptance Criteria

- MametLite requests are identifiable in backend logs/policy.
- MametLite does not write User Memory unless explicitly enabled.
- MametLite remains compatible with streaming response parsing.

## Progress

- `mametlite/src/lib/callAgentSimple.js` sends `appSource: "mametlite"`.
- `agent-process` reads `appSource`.
- `agent-process` policy treats MametLite as LITE mode.
- MametLite disables User Memory reads and writes by default.
