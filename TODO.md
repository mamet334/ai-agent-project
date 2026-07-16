# TODO — Activity Cluster Upgrade (Execution Trace Contract)

## Phase 0 — Trace Propagation Audit

### Phase 0.1 — Trace Context Invariants
Before adding new telemetry events, verify:

1. Every execution event MUST have `trace_id`.
2. `trace_id` MUST remain stable during one request lifecycle.
3. Child operations inherit parent `trace_id`.
4. Missing `trace_id` events MUST NOT be rendered as Activity Cluster nodes.
5. Telemetry failure must not break execution flow.

### Trace Propagation Audit Tasks
- [ ] Identify how `trace_id` is created and threaded through the request lifecycle.
- [ ] Confirm which telemetry sink(s) already store `metadata.trace_id` (likely `public.agent_logs`).
- [ ] Map: Event producer → sink → required UI domain.

### Acceptance criteria Phase 0 (deliverable)
- [ ] Produce **Trace Context Map**:

```
Trace Context Map

Component                  trace_id available
------------------------------------------------
agent-process entry        YES
ExecutionContext           ?
Coordinator                ?
Memory Manager             ?
RAG Pipeline               ?
Tool Dispatcher            ?
LLM Provider Adapter       ?
Response Builder           ?
```

- [ ] Produce **Trace Propagation Audit Report** (root trace source + propagation path + missing propagation segments).


## Phase 1 — Response.Generated + Capability + Tool consolidation
- [ ] Verify existing event types in `agent-process/lib/event/event_bus.ts` for:
  - `Response.Generated`
  - `Capability.Executed`
  - `Tool.*`
- [ ] Confirm persistence into `public.agent_logs` with `trace_id` correlation.
- [ ] Acceptance test: generate one request, query last events for same `trace_id`.

## Phase 2 — Memory.Fetch
- [ ] Find producer boundaries for memory retrieval (retrieve/fetch/search) inside agent-process `lib/memory*`.
- [ ] Implement step events (without schema change) emitted into existing telemetry sink.
- [ ] Acceptance test: ensure `Memory.Fetch.Completed` exists and is correlated by `trace_id`.

## Phase 3 — RAG Retrieval
- [ ] Find producer boundaries for RAG search/embedding/context fusion inside agent-process `lib/rag*`.
- [ ] Implement step events into existing telemetry sink using existing correlation keys.
- [ ] Acceptance test: ensure `RAG.Search.Completed`, `RAG.Embedding.Generated`, `Context.Fused` exist.

## Phase 4 — LLM Call Trace
- [ ] Locate provider-call boundaries for all LLM providers.
- [ ] Implement step events for LLM call start/completed/failed into existing telemetry sink.
- [ ] Acceptance test: verify latency/tokens metadata for `LLM.Call.*`.

## Phase 5 — Pipeline Stage Trace
- [ ] Instrument request/pipeline stage transitions and failures.
- [ ] Acceptance test: verify `Pipeline.Stage.Completed` and `Pipeline.Failed` per stage.

## Non-goals (must remain untouched)
- [ ] No database schema changes.
- [ ] No backend architecture refactor.
- [ ] No new pipelines.


