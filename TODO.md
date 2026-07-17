# TODO - MODE IMPLEMENTASI ACTIVITY CLUSTER V1

## Plan
1. Audit current Activity Cluster (HomeDashboard.jsx) and execution trace service (ExecutionTraceService.js).
2. Define “pipeline node” as `trace_id` and map it into the Activity Cluster with minimal frontend changes.
3. Implement logic: when `fetchExecutionTrace(traceId)` returns empty timeline or missing telemetry => show node status `UNKNOWN` (NO TELEMETRY AVAILABLE) without failing.
4. Ensure known failures (failed/timeout) render red.
5. Keep existing graph behavior for nodes active/inactive and current right panel.
6. Run frontend build; fix any compile errors.
7. Commit changes and push to working branch.
8. Open pull request.

## Progress
- [x] Step 1: Audit files
- [x] Step 2: Implement pipeline nodes (trace_id based)
- [x] Step 3: UNKNOWN handling for empty timelines
- [x] Step 4: Failure coloring red
- [x] Step 5: Validate UI doesn’t break node inspector/graph interaction
- [x] Step 6: Build + fix compile errors
- [x] Step 7: Commit + push
- [x] Step 8: PR

## Next Task (V2 Follow-up)
- [ ] V2-A: Implement final execution pipeline mapping in `ExecutionTraceService.js`:
  - Intent → Memory Retrieval → RAG Retrieval → Planner → Tool Execution → Verification → Provider → Response Generation → Memory Writeback → Final Delivery
  - Default each missing step to `UNKNOWN` (no telemetry) without throwing UI error.
- [ ] V2-B: Extend `HomeDashboard.jsx` right panel for final detail fields:
  - Name, Type, Status, Latency, Provider, Cost, Timestamp, Trace ID, Dependencies, Related Events, Failures, Warnings, Evidence.
- [ ] V2-C: Add Pipeline Panel (conversation trace lifecycle):
  - Show step-by-step status and Failure Localization (root cause, failed step, latency).
- [ ] V2-D: Add/upgrade System Health panel statuses:
  - Supabase, Auth, Realtime, Storage, Edge Function, RAG, Embedding, Memory, Verification, Provider
  - Status set: Healthy / Degraded / Down / Unknown.
- [ ] V2-E: Add Bottleneck panel:
  - Top slowest components + latency metrics (P50/P95/P99) from existing telemetry.
- [ ] V2-F: Add Failure panel:
  - Recent known failures (tool timeout, provider error, verification fail, rag unavailable, supabase disconnected) using available logs.
- [ ] V2-G: Add Realtime panel:
  - Live event feed (retrieval/tool/verification/provider/writeback events) from current telemetry streams.
- [ ] V2-H: Add operation modes:
  - Conversation View, System View, Incident View, Performance View.
- [ ] V2-I: Testing plan (critical-path first, then thorough):
  - Critical-path on HomeDashboard impacted sections and trace status correctness.
  - Thorough testing across whole app flow when scope stabilized.

## Active Iteration (Autonomous V2 Core: Phase 1)
- [ ] P1-1: Update `ExecutionTraceService.js` (V2-A core mapping + UNKNOWN defaults).
- [ ] P1-2: Update `HomeDashboard.jsx` right panel detail fields (V2-B core).
- [ ] P1-3: Add pipeline/failure localization block (V2-C partial, core only).
- [ ] P1-4: Run build and fix compile issues.
- [ ] P1-5: Report progress, blockers, and next iteration scope.
