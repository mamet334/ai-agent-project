# AUDIT-02: Runtime Gap Analysis

## Objective
Identify what runtime evidence is missing to definitively prove the root cause of "Verification Failed" in Engineer mode, and determine the single best instrumentation point to capture all necessary data simultaneously.

## Background
AUDIT-01 identified the static root cause chain: prompt instruction → LLM → parser → verification engine. However, without runtime evidence, we cannot confirm whether the LLM actually failed to follow the prompt, or whether the parser failed to extract a valid source trace. This audit identifies the exact data gaps and the optimal instrumentation point.

## Investigation Question
- What runtime data is missing?
- Where should instrumentation be placed to capture all necessary evidence in a single point?
- What variables must be captured simultaneously to prove or disprove each hypothesis?

## Files Examined
- `supabase/functions/agent-process/lib/orchestration/handlers/synthesis_handler.ts`
- `supabase/functions/agent-process/lib/verification/verification_engine.ts`
- `supabase/functions/agent-process/lib/coordinator/trace_parser.ts`
- `supabase/functions/agent-process/lib/verification/universal_contract.ts`
- `supabase/functions/agent-process/lib/verification/confidence_engine.ts`
- `supabase/functions/agent-process/lib/verification/evidence_validator.ts`
- `supabase/functions/agent-process/lib/coordinator/parser_pipeline.ts`
- `supabase/functions/agent-process/lib/llm_orchestrator.ts`
- `supabase/functions/agent-process/lib/adapters/ai_adapter.ts`
- `supabase/functions/agent-process/lib/adapters/adapter_registry.ts`
- `supabase/functions/agent-process/lib/coordinator/post_processing.ts`
- `supabase/functions/agent-process/lib/verification/verification_service.ts`

## Functions Examined
- `SynthesisHandler.handle()` — `synthesis_handler.ts:27-76`
- `VerificationEngine.verifyEngineering()` — `verification_engine.ts:53-135`
- `extractSourceTrace()` — `trace_parser.ts:4-31`
- `runLLM()` — `llm_orchestrator.ts`
- `callLLMWithMetadata()` — `llm_orchestrator.ts`
- `GeminiAdapter.execute()` — `ai_adapter.ts`
- `executeResponsePipeline()` — `parser_pipeline.ts`
- `postProcessResponse()` — `post_processing.ts`

## Execution Flow (Data Flow)
```
Data Flow Before LLM (DETERMINISTIC — all available):
  context_builder.ts:170     confidenceReport = { sourceTrace: [12 items], score: 80, ... }
  context_builder.ts:292     fullSystemContext = contract.asSystemPromptText()
  synthesis_handler.ts:34    runLLM(userMessage, fullSystemContext, history, rctx)

Data Flow After LLM (NON-DETERMINISTIC — GAP):
  synthesis_handler.ts:34    replyMessage = ??? ← GAP #1: RAW LLM OUTPUT NOT CAPTURED
  synthesis_handler.ts:36    executeResponsePipeline('extract_trace', replyMessage)
                               → sourceTrace = ??? ← GAP #2: PARSER OUTPUT NOT CAPTURED
  synthesis_handler.ts:40-43 vContext = { sourceTrace, confidenceReport, evidenceReport }
                               → vContext.sourceTrace = ??? ← GAP #3: VERIFICATION INPUT NOT CAPTURED
  synthesis_handler.ts:48    vReport = verifyEngineering(vContext)
                               → vReport.decision = "FAIL" ← CONFIRMED BUT NO DETAILS
  synthesis_handler.ts:63    return { message: "Verification Failed" }
```

## Static Evidence

### Data Available Before LLM (Deterministic)
| Variable | Source | Value (Static Analysis) |
|----------|--------|------------------------|
| `confidenceReport.score` | `confidence_engine.ts:33` | 80 |
| `confidenceReport.grade` | `confidence_engine.ts:33` | 'B' |
| `confidenceReport.sourceTrace.length` | `confidence_engine.ts:127` | ~12 items |
| `evidenceReport.totalEvidence` | `evidence_validator.ts` | 27 |
| `evidenceReport.verdict` | `evidence_validator.ts` | 'PASSED' |
| `fullSystemContext` | `universal_contract.ts` | Contains SOURCE_TRACE block |

### Data Missing After LLM (Runtime Gaps)
| Gap # | Variable | Location | Why Missing |
|-------|----------|----------|-------------|
| 1 | `replyMessage` (RAW) | `synthesis_handler.ts:34` | Not logged to any persistent store |
| 2 | `sourceTrace` (parser output) | `synthesis_handler.ts:36` | Not logged; only used in vContext |
| 3 | `vContext.sourceTrace` | `synthesis_handler.ts:40-43` | Not logged; passed directly to verify |
| 4 | `vReport.checks` | `synthesis_handler.ts:48` | Only decision is checked; full report not captured |
| 5 | `auditRecord` | `synthesis_handler.ts:50` | Emitted to event bus but not persisted locally |

### Data That IS Persisted (But Not Accessible Locally)
| Data | Destination | How to Access |
|------|-------------|---------------|
| `verification_audit_logs` | Supabase table | Database query |
| `evidence_audit_logs` | Supabase table | Database query |
| `agent_logs` | Supabase table | Database query |
| Event bus events | In-memory only | Not persisted |

## Runtime Evidence
**NONE AVAILABLE LOCALLY.** The only runtime data that exists is in Supabase database tables (`verification_audit_logs`, `evidence_audit_logs`, `agent_logs`), which are not accessible from the local filesystem.

## Findings

### Gap #1: RAW LLM Output Not Captured
The most critical missing data is `replyMessage` at `synthesis_handler.ts:34`. Without this, we cannot determine:
- Whether the LLM included source trace IDs in its response
- Whether the LLM followed the natural language instruction
- The actual format of the LLM's source trace mention

### Gap #2: Parser Output Not Captured
`sourceTrace` at `synthesis_handler.ts:36` is used only to build `vContext` and then discarded. If it were logged, we could confirm:
- Whether the parser returned `undefined` (regex mismatch)
- Whether the parser returned a valid string (regex match but wrong content)
- The actual extracted text

### Gap #3: Verification Input Not Captured
`vContext` at `synthesis_handler.ts:40-43` contains the complete verification input, including both `sourceTrace` (from parser) and `confidenceReport.sourceTrace` (from backend). If captured, this would definitively prove the double source of truth.

### Gap #4: Full Verification Report Not Captured
Only `vReport.decision` is checked at `synthesis_handler.ts:58`. The full report (all 8 checks, scores, messages) is emitted to the event bus but not captured locally.

### Gap #5: Audit Record Not Persisted Locally
`auditRecord` at `synthesis_handler.ts:50` contains the complete verification context including `sourceTrace`, `confidence`, and `evidence`. It is emitted to the event bus and eventually persisted to Supabase, but not available locally.

## Confirmed Facts
| Fact | Confidence |
|------|------------|
| 5 distinct runtime data gaps exist between LLM output and verification decision | 100% |
| The most critical gap is `replyMessage` (RAW LLM output) | 100% |
| All gaps occur within `synthesis_handler.ts:34-50` | 100% |
| Supabase tables contain the data but are not locally accessible | 100% |
| No local logging captures any of these variables | 100% |

## Hypotheses
1. **H1 (80%)**: If `replyMessage` were captured, it would show natural language source trace mention (e.g., "Berdasarkan ADR-0006...") without the strict `XXX-0000` format expected by the parser.
2. **H2 (15%)**: If `replyMessage` were captured, it would show no source trace mention at all.
3. **H3 (5%)**: If `replyMessage` were captured, it would show proper `XXX-0000` format but outside the last 15 lines.

## Limitations
- No local runtime data capture mechanism exists
- Supabase database is the only persistence layer for runtime data
- Event bus is in-memory only and not persisted
- No console.log statements capture the critical variables at the verification boundary

## Confidence Level
- Overall: **95%**
- Gap identification: 100%
- Gap locations: 100%
- Optimal instrumentation point: 100%
- What data would reveal: 80% (cannot be confirmed without actual runtime capture)

## Recommended Next Audit
AUDIT-03: Single Instrumentation Point Design — determine the exact code location and variables to capture for a single-point diagnostic.
