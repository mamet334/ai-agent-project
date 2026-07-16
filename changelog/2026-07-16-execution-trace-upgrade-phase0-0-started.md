# 2026-07-16 — Execution Trace Upgrade / Phase 0 — Trace Propagation Audit (STARTED)

## Status
- Phase 0.1: Trace Context Invariants — **Documented**
- Phase 0 producer audit — **Pending (read-only audit in progress)**

## Goal
Menyiapkan kontrak eksekusi trace agar Activity Cluster dapat diubah dari v1 (telemetry approximation) menjadi v2 (true cognitive execution graph) tanpa perubahan schema/backend architecture.

## Non-goals
- No DB schema changes
- No backend architecture refactor
- No new pipelines

## Deliverables (from TODO.md)
1. **Trace Context Map**
2. **Trace Propagation Audit Report** (root trace source + propagation path + missing segments)

## Acceptance criteria (Phase 0)
- Setiap eksekusi event memiliki `trace_id`
- `trace_id` stabil selama satu request lifecycle
- Child operations inherit parent `trace_id`
- Missing `trace_id` events tidak dirender sebagai node Activity Cluster

## Notes
- Sink yang diduga menyimpan `metadata.trace_id`: `public.agent_logs` (pending verification).


