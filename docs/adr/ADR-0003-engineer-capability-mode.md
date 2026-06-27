# ADR-0003: Engineer Capability Mode in Agent Process

Status: Accepted
Date: 2026-06-27
Phase: 2

## Context

MAEF Bab 10 defines three capability modes:
- Assistant: daily interactions using memory and knowledge
- MametLite: fast, read-oriented, lightweight
- Mamet Engineer: internal engineering capability

The `agent-process` backend previously only had two modes (AI and LITE). Engineer had no explicit runtime boundary, meaning an Engineer request would inherit full AI permissions including automation tools and memory writes — inconsistent with MAMET-ENGINEER-BLUEPRINT.md requirements.

## Decision

Add a third runtime mode `ENGINEER` to `MametCapabilityMode` in `agent-process/index.ts`.

Engineer mode policy:
- Full reasoning access (RAG read, memory read) for context-aware analysis
- No User Memory writes (uncontrolled writes blocked)
- No automation tools (cron_manager blocked)
- No desktop OS execution (terminal/file exec blocked)
- Activated via `appSource: "engineer"` in request payload

## Rationale

This enforces MAEF Bab 8 (AI Governance) at the runtime level:
- Engineer can analyze and reason but cannot act autonomously
- Automation and OS execution require explicit owner action
- Separation at appSource level is consistent with MametLite pattern (appSource: "mametlite")

## Consequences

- Any client sending `appSource: "engineer"` will receive Engineer-scoped permissions
- Future Engineer UI can safely send engineer-mode requests
- Policy is enforced server-side, not client-side (cannot be bypassed by frontend)

## References

- MAMET-ENGINEER-BLUEPRINT.md Stage 2
- TASK-0007
- MAEF Bab 10 (Capability Model)
- MAEF Bab 8 (AI Governance)
