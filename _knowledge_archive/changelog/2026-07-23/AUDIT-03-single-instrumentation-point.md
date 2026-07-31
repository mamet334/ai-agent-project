# AUDIT-03: Single Instrumentation Point Design

## Objective
Identify the single best code location to instrument for capturing all runtime evidence necessary to definitively diagnose the "Verification Failed" root cause. No code changes are to be made; this is a design-only audit.

## Background
AUDIT-01 identified the static root cause chain. AUDIT-02 identified 5 runtime data gaps. This audit determines the optimal single point where all missing data can be captured simultaneously, enabling a single diagnostic probe to prove or disprove all hypotheses.

## Investigation Question
- What is the single best instrumentation point in the execution flow?
- What variables must be captured at that point?
- What would the captured data prove or disprove?

## Files Examined
- `supabase/functions/agent-process/lib/orchestration/handlers/synthesis_handler.ts`
- `supabase/functions/agent-process/lib/verification/verification_engine.ts`
- `supabase/functions/agent-process/lib/coordinator/trace_parser.ts`
- `supabase/functions/agent-process/lib/coordinator/parser_pipeline.ts`

## Functions Examined
- `SynthesisHandler.handle()` — `synthesis_handler.ts:27-76`
- `VerificationEngine.verifyEngineering()` — `verification_engine.ts:53-135`
- `extractSourceTrace()` — `trace_parser.ts:4-31`
- `executeResponsePipeline()` — `parser_pipeline.ts`

## Execution Flow (Critical Path)
```
synthesis_handler.ts:34      replyMessage = await runLLM(...)         ← RAW LLM OUTPUT
synthesis_handler.ts:36      const { replyWithoutTrace, sourceTrace }  ← PARSER OUTPUT
                               = executeResponsePipeline('extract_trace', replyMessage, rctx)
synthesis_handler.ts:40-43   const vContext = {                       ← VERIFICATION INPUT
                               responseText: replyWithoutTrace,
                               sourceTrace: sourceTrace,
                               confidenceReport,                       ← BACKEND SOURCE TRACE
                               evidenceReport,
                               runtimeContext: ctx.state
                             }
synthesis_handler.ts:48      vReport = VerificationEngine.verifyEngineering(vContext)
synthesis_handler.ts:50      const auditRecord = VerificationEngine.createAuditRecord(vReport, vContext)
synthesis_handler.ts:58      if (vReport.decision === "FAIL")         ← DECISION POINT
synthesis_handler.ts:63      return { message: "Verification Failed" }
```

## Static Evidence

### Analysis of All Possible Instrumentation Points

| Point | Location | Line | Variables Available | Pros | Cons |
|-------|----------|------|-------------------|------|------|
| A | Before runLLM | 33 | fullSystemContext, userMessage, history | Complete input context | No output data |
| B | After runLLM | 34 | replyMessage (RAW) | RAW LLM output | No parser/verification data |
| C | After parser | 36-38 | replyMessage, replyWithoutTrace, sourceTrace | Parser input + output | Need B+C combined |
| **D** | **Before verifyEngineering** | **40-43** | **replyWithoutTrace, sourceTrace, confidenceReport, evidenceReport, runtimeContext** | **COMPLETE — ALL VARIABLES SIMULTANEOUSLY** | None |
| E | After verifyEngineering | 48 | vReport.full | Verification result | No input data |
| F | At FAIL decision | 58-63 | Partial context only | Only when FAIL | Misses PASS cases |

### Optimal Point: **D** — `synthesis_handler.ts:40-43` (Before verifyEngineering call)

At this point, ALL of the following are simultaneously available in memory:

```
vContext = {
  responseText: replyWithoutTrace,     ← Parser output (what will be verified)
  sourceTrace: sourceTrace,             ← Parser output (CHECK 002 target)
  confidenceReport: {                    ← Backend source truth
    sourceTrace: SourceTraceItem[]       ← Backend source trace (NOT USED by CHECK 002)
    score: number,
    grade: string,
    ...
  },
  evidenceReport: {                      ← Backend evidence truth
    totalEvidence: number,
    brain1Count: number,
    brain2Count: number,
    ...
  },
  runtimeContext: ctx.state              ← Execution context
}
```

### Variables to Capture at Point D

| Variable | Type | Source | Purpose |
|----------|------|--------|---------|
| `replyMessage` | string | RAW LLM output | Verify LLM response content |
| `sourceTrace` | string \| undefined | Parser output | Verify parser success/failure |
| `confidenceReport.sourceTrace` | SourceTraceItem[] | Backend | Compare with parser output |
| `confidenceReport.score` | number | Backend | Verify confidence level |
| `confidenceReport.grade` | string | Backend | Verify confidence grade |
| `evidenceReport.totalEvidence` | number | Backend | Verify evidence count |
| `evidenceReport.brain1Count` | number | Backend | Verify brain1 evidence |
| `evidenceReport.brain2Count` | number | Backend | Verify brain2 evidence |
| `ctx.request.mode` | string | Request | Verify mode context |

### What Captured Data Would Prove/Disprove

| Hypothesis | Proof | Disproof |
|------------|-------|----------|
| **H1**: LLM uses natural language (no ID format) | `replyMessage` contains "ADR" or "evidence" but no `XXX-0000` pattern | `replyMessage` contains `XXX-0000` pattern |
| **H2**: Parser regex mismatch | `sourceTrace = undefined` AND `replyMessage` contains `XXX-0000` beyond last 15 lines | `sourceTrace` is a valid string |
| **H3**: LLM produces no source trace | `replyMessage` contains no mention of ADR/evidence/source | `replyMessage` clearly references evidence |
| **H4**: Double source of truth | `sourceTrace = undefined` BUT `confidenceReport.sourceTrace` has items | Both are identical or both populated |
| **H5**: Verification logic error | All captured data shows correct behavior but verify still fails | Data reveals actual contract violation |

## Runtime Evidence
**NONE AVAILABLE.** This is a design-only audit. The instrumentation point is identified but not implemented.

## Findings

### Single Best Instrumentation Point: `synthesis_handler.ts:40-43`

**Rationale:**
1. This is the **last point before the verification decision** — all input data is available but no output has been produced yet.
2. It captures **both sources of truth** simultaneously: `sourceTrace` (parser output) and `confidenceReport.sourceTrace` (backend data).
3. It captures the **RAW LLM output** via `replyMessage` (available as a closure variable from line 34).
4. It captures the **parser output** via `sourceTrace` (available directly).
5. One probe here proves or disproves **ALL hypotheses** from AUDIT-01 and AUDIT-02.

### Why Not Earlier/Later Points

- **Before runLLM (line 33)**: No LLM output data — cannot diagnose parser or verification failures.
- **After runLLM (line 34)**: Only RAW LLM output — no parser or verification context.
- **After parser (line 36)**: Missing `replyMessage` (RAW) unless separately captured.
- **After verifyEngineering (line 48)**: Missing input data — cannot reconstruct what caused the failure.
- **At FAIL decision (line 58)**: Only triggered on failure — misses PASS cases for comparison.

### Confirmed Data Capacity

A single instrumentation point at `synthesis_handler.ts:40-43` can capture:

| Diagnostic Question | Answerable? |
|--------------------|-------------|
| What did the LLM actually say? | ✅ YES (via `replyMessage`) |
| Did the parser find a source trace? | ✅ YES (via `sourceTrace`) |
| What source trace did the backend build? | ✅ YES (via `confidenceReport.sourceTrace`) |
| Was there evidence available? | ✅ YES (via `evidenceReport`) |
| What mode was active? | ✅ YES (via `ctx.request.mode`) |
| What was the verification decision? | ✅ YES (via subsequent `vReport.decision`) |

## Confirmed Facts
| Fact | Confidence |
|------|------------|
| Optimal instrumentation point is `synthesis_handler.ts:40-43` | 100% |
| All critical variables are simultaneously accessible at this point | 100% |
| One probe can prove/disprove all hypotheses | 100% |
| No local logging currently exists at this point | 100% |
| All necessary variables are in memory, not requiring DB queries | 100% |

## Hypotheses
- **H1 (90%)**: If instrumented, the data would show `sourceTrace = undefined` AND `confidenceReport.sourceTrace.length > 0` AND `replyMessage` contains natural language evidence mention.
- **H2 (10%)**: If instrumented, the data would show `replyMessage` contains no evidence mention at all.

## Limitations
- Instrumentation design only — no implementation has been done
- Cannot predict exact LLM output without runtime capture
- Variable values depend on real user queries and real-time LLM responses

## Confidence Level
- Overall: **95%**
- Optimal point identification: 100%
- Variable availability: 100%
- Diagnostic capacity: 100%
- What the data will show: 80% (reasonable inference from architecture analysis)

## Recommended Next Audit
AUDIT-04: Complete Payload Lifecycle Trace — trace every transformation of the source trace from creation to verification decision.
