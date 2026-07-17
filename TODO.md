# TODO - MAMET OBSERVABILITY INSTRUMENTATION MODE

## Plan Steps
1. Add backend telemetry producer utility (agent_logs, ai_system_logs, verification_audit_logs) without schema changes.
2. Add trace_id propagation helper at runtime boundary.
3. Instrument MEMORY endpoints + memory engine:
   - Memory.Read.Start / Memory.Read.End
   - Memory.Write.Start / Memory.Write.End / Memory.Write.Failed
4. Instrument backend runtime flow:
   - Pipeline.Start / Pipeline.Completed / Pipeline.Failed
   - Planner.Start / Planner.End / Planner.Failed
   - RAG.Start / RAG.Retrieval.Start / RAG.Retrieval.End / RAG.NoResult / RAG.Error
   - Tool.Requested / Tool.Invoked / Tool.Completed / Tool.Timeout / Tool.Failed
   - Provider.Request / Provider.Response / Provider.Error / Provider.Fallback
   - Verification.Start / Verification.Pass / Verification.Fail
5. Update frontend execution trace normalization for newly produced events.
6. Run frontend build and fix compile issues if any.
7. Add changelog entry for instrumentation rollout.

## Progress
- [x] Step 1: Planning approved
- [x] Step 2: Telemetry producer utility
- [x] Step 3: Trace propagation
- [x] Step 4: MEMORY instrumentation
- [ ] Step 5: Runtime instrumentation (Planner/RAG/Tools/Provider/Pipeline/Verification)
- [x] Step 6: Frontend trace normalization update
- [ ] Step 7: Build verification
- [ ] Step 8: Changelog update

## Instrumentation Expansion Progress (Backend + Frontend)
- [x] Add telemetry foundation (`backend/telemetry.js`)
- [x] Instrument `/api/chat` pipeline + provider events with trace propagation
- [x] Instrument `api/memory/read.ts` (Memory.Read.Start/End + trace_id)
- [x] Instrument `api/memory/write.ts` (Memory.Write.Start/End/Failed + trace_id)
- [x] Extend `frontend/src/services/ExecutionTraceService.js` event normalization for new telemetry taxonomy
- [x] Instrument planner + verification signals in `backend/server.js` coordinator flow
- [ ] Instrument RAG events in `backend/server.js`
- [ ] Instrument Tool lifecycle events in `backend/server.js` subagent/tool execution branches
- [ ] Final build + compile fix
- [ ] Commit + push branch kerja
- [ ] Create PR
