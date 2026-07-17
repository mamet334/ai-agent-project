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
- [ ] Step 2: Implement pipeline nodes (trace_id based)
- [ ] Step 3: UNKNOWN handling for empty timelines
- [ ] Step 4: Failure coloring red
- [ ] Step 5: Validate UI doesn’t break node inspector/graph interaction
- [ ] Step 6: Build + fix compile errors
- [ ] Step 7: Commit + push
- [ ] Step 8: PR
