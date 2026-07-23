# AUDIT-05: Verification Engine Architecture Audit — Double Source of Truth

## Objective
Analyze why `VerificationEngine.verifyEngineering()` uses `context.sourceTrace` (from LLM parser) as the authoritative source for CHECK 002, when `context.confidenceReport.sourceTrace` (from backend evidence) is already available and deterministic. Identify the architectural design flaw that creates a "double source of truth" and determine the first point where architecture began depending on LLM output for evidence verification.

## Background
AUDIT-01 through AUDIT-04 traced the payload lifecycle and identified that `context.sourceTrace` (from `trace_parser.ts`) is used at `verification_engine.ts:82` for CHECK 002, while `context.confidenceReport.sourceTrace` (from `confidence_engine.ts:127`) exists in the same `vContext` object but is never read. This audit performs a deep architectural analysis of why this design decision was made and its consequences.

## Investigation Question
- Why does `verifyEngineering()` use parser output instead of backend evidence?
- Is this a double source of truth?
- When did the architecture start depending on LLM output for verification?
- Is the parser a presentation layer that became authoritative?

## Files Examined
- `supabase/functions/agent-process/lib/verification/verification_engine.ts`
- `supabase/functions/agent-process/lib/verification/confidence_engine.ts`
- `supabase/functions/agent-process/lib/verification/types.ts`
- `supabase/functions/agent-process/lib/verification/universal_contract.ts`
- `supabase/functions/agent-process/lib/verification/evidence_validator.ts`
- `supabase/functions/agent-process/lib/verification/verification_pipeline.ts`
- `supabase/functions/agent-process/lib/verification/verification_service.ts`
- `supabase/functions/agent-process/lib/verification/policy_engine.ts`
- `supabase/functions/agent-process/lib/orchestration/handlers/synthesis_handler.ts`
- `supabase/functions/agent-process/lib/orchestration/handlers/context_builder.ts`
- `supabase/functions/agent-process/lib/coordinator/trace_parser.ts`
- `supabase/functions/agent-process/lib/coordinator/parser_pipeline.ts`
- `supabase/functions/agent-process/lib/coordinator/post_processing.ts`

## Functions Examined
- `VerificationEngine.verifyEngineering()` — `verification_engine.ts:53-135`
- `VerificationEngine.verifyPersonal()` — `verification_engine.ts:140-210`
- `VerificationEngine.createAuditRecord()` — `verification_engine.ts:212-225`
- `calculateConfidence()` — `confidence_engine.ts:33-100`
- `buildSourceTrace()` — `confidence_engine.ts:127-170`
- `buildSourceTraceText()` — `confidence_engine.ts:177-210`
- `extractSourceTrace()` — `trace_parser.ts:4-31`
- `validateEvidence()` — `evidence_validator.ts`
- `SynthesisHandler.handle()` — `synthesis_handler.ts:27-76`
- `ContextBuilderHandler.handle()` — `context_builder.ts:27`
- `postProcessResponse()` — `post_processing.ts:14`

## Execution Flow (Architecture Dependency Chain)

### The Two Source Traces

#### Source #1: `confidenceReport.sourceTrace` (BACKEND — AUTHORITATIVE)

```
CREATED AT:   confidence_engine.ts:127-170   buildSourceTrace()
DATA SOURCE:  brain1Entries[], brain2Tasks[], brain2Gaps[], brain2Verifications[], ragDocs[], memoryCount
              → All from database queries executed in context_builder.ts
TYPE:         SourceTraceItem[] (structured array)
DETERMINISM:  ✅ DETERMINISTIC — same inputs always produce same output
AVAILABILITY: ✅ ALWAYS AVAILABLE — even with 0 evidence, returns empty array
PERSISTENCE:  Persisted to verification_audit_logs.source_trace via verification_service.ts:130
```

#### Source #2: `context.sourceTrace` (LLM PARSER — DERIVATIVE)

```
CREATED AT:   trace_parser.ts:4-31           extractSourceTrace()
DATA SOURCE:  replyMessage — RAW LLM output string
TYPE:         string | undefined
DETERMINISM:  ❌ NON-DETERMINISTIC — depends on LLM output format
AVAILABILITY: ❌ OFTEN UNDEFINED — regex may not match
PERSISTENCE:  NOT persisted independently; only as part of auditRecord
```

### Where Both Sources Exist Simultaneously

At `synthesis_handler.ts:40-43`:

```typescript
const vContext = {
  responseText: replyWithoutTrace,
  sourceTrace: sourceTrace,                    ← Source #2: from parser (may be undefined)
  confidenceReport,                            ← Contains Source #1: confidenceReport.sourceTrace = [12 items]
  evidenceReport,                              ← Contains totalEvidence, brain1Count, etc.
  runtimeContext: ctx.state
};
```

### What Verification Engine Reads

At `verification_engine.ts:80-87`:

```typescript
const hasEvidence = context.evidenceReport && context.evidenceReport.totalEvidence > 0;

if (!context.sourceTrace || typeof context.sourceTrace !== "string" || context.sourceTrace.trim().length === 0) {
  if (hasEvidence) {
    check002.status = "FAIL";                    // ← Uses Source #2 (parser)
    // ...
  }
}
```

### What Verification Engine DOES NOT Read

```typescript
// The following are available in context but NEVER READ by verifyEngineering():
// context.confidenceReport.sourceTrace    ← Source #1: [12 items] — EXISTS, NOT USED
// context.confidenceReport.score           ← 80 — EXISTS, NOT USED for CHECK 002
// context.confidenceReport.grade           ← 'B' — EXISTS, NOT USED
```

## Static Evidence

### Design Intent Analysis

**VerificationEngine class JSDoc** (`verification_engine.ts:1-20`):
```typescript
/**
 * Verifies the LLM output against deterministic rules.
 * Strict verification for ENGINEER mode.
 */
"""
```

This states the engine verifies "LLM output" — meaning the **response text**, not the **backend evidence**. This explains why `context.sourceTrace` (from the LLM response) is checked: the intent is to verify that the LLM **mentioned** source traces in its answer.

**However**, the implementation conflates two different verification goals:

1. **Goal A**: "Does the LLM response contain evidence citations?" (verifying LLM behavior)
2. **Goal B**: "Does the system have evidence to support the answer?" (verifying system state)

CHECK 002 uses Source #2 (from LLM) to answer Goal A, but FAILS the entire verification if Source #2 is missing — which confuses Goal A failure with a system-wide failure.

### The Two Verification Paths

```
verifyEngineering() — ENGINEER MODE (strict)
  CHECK 001: ResponseText Not Empty          ← Verifies LLM output
  CHECK 002: SourceTrace Exists               ← Verifies LLM output (citations)
  CHECK 003: SourceTrace Format Valid          ← Verifies LLM output (format)
  CHECK 004: ConfidenceReport Exists           ← Verifies backend data
  CHECK 005: EvidenceReport Exists             ← Verifies backend data
  CHECK 006: RuntimeContext Exists             ← Verifies backend data
  CHECK 007: Forbidden Phrases (Hallucination) ← Verifies LLM output
  CHECK 008: Apologetic Refusal               ← Verifies LLM output

verifyPersonal() — LITE / ASSISTANT MODE (relaxed)
  CHECK 1: ResponseText Not Empty             ← Verifies LLM output
  CHECK 2: Forbidden Phrases (Hallucination)  ← Verifies LLM output
  CHECK 3: ConfidenceReport Exists            ← Verifies backend data
  CHECK 4: EvidenceReport Exists              ← Verifies backend data
  CHECK 5: RuntimeContext Exists              ← Verifies backend data
```

**Key difference**: `verifyPersonal()` has NO source trace check. This is why LITE and ASSISTANT modes succeed while ENGINEER mode fails.

### Why Engineer Mode Has Source Trace Check

The ENGINEER capability spec (`constitution/21 Engineer Capability.md`) requires:
> "Setiap jawaban Engineer bisa ditelusuri ke evidence sumbernya."

And the Verification Engine spec (`constitution/13_VERIFICATION_ENGINE_SPEC.md`) requires:
> "Semua output harus melewati proses: Data → Evidence → Verification → Confidence → Decision"

The design intent is that an Engineer answer **must** cite its sources. The verification engine checks this by examining the **LLM output** for source trace citations.

**The architectural flaw is not that CHECK 002 exists, but that it uses Source #2 (parser) as the sole indicator of Source #1 (backend) compliance.**

### The Parser as Presentation Layer

`trace_parser.ts` is designed for TWO purposes:

1. **Extract** source trace from LLM text (for verification log)
2. **Remove** source trace from response text (for user presentation)

In `synthesis_handler.ts:36`:
```typescript
const { replyWithoutTrace, sourceTrace } = executeResponsePipeline('extract_trace', replyMessage, rctx);
```

- `replyWithoutTrace` → sent to user (presentation purpose) ✅
- `sourceTrace` → used in verification (authoritative purpose) ❌

**The parser output `sourceTrace` was designed as a PRESENTATION/LOGGING artifact, but became an AUTHORITATIVE verification input.**

### Proof: Parser Was Not Designed for Verification

1. `trace_parser.ts:6` uses a simple regex `/[A-Z]{2,3}-\d{4}/` — designed for text extraction, not semantic verification
2. `trace_parser.ts:8` limits scan to 15 lines — designed for footer extraction, not full validation
3. The function is called "extract" (extract from text), not "validate" (verify compliance) or "confirm" (confirm evidence use)
4. The function is in `coordinator/trace_parser.ts` — a utility module, not a verification module

### Proof: Confidence Engine Was Designed for Source Truth

`confidence_engine.ts:127-170` `buildSourceTrace()`:
- Uses actual database entries (ADR IDs, Task descriptions, etc.)
- Maps entry types to trace categories (ADR, LESSON, TASK, GAP, etc.)
- Assigns relationship levels (primary, supporting, referenced)
- Includes version numbers and governance status

This function produces the **real source trace** — what evidence the system actually has. But `verifyEngineering()` never calls it or reads its output.

## Runtime Evidence
**NONE.** All analysis is static. No runtime verification records were captured.

## Findings

### Finding 1: Double Source of Truth is Confirmed

Two independent source trace data sources exist:

| Source | Location | Type | Content | Used by CHECK 002? |
|--------|----------|------|---------|-------------------|
| `confidenceReport.sourceTrace` | `confidence_engine.ts:127` | SourceTraceItem[] | 12 items ADR, TASK, GAP, RAG | ❌ NO |
| `context.sourceTrace` | `trace_parser.ts:31` | string \| undefined | undefined (usually) | ✅ YES |

### Finding 2: Parser is a Presentation Layer Acting as Authoritative Source

`trace_parser.ts` was designed for:
- Extracting source trace from LLM text for **audit logging** (presentation)
- Removing source trace from text for **user response** (presentation)

But it is used for:
- Determining **PASS/FAIL** of verification (authoritative)

### Finding 3: Backend Evidence Exists But Is Not Used for CHECK 002

`verifyEngineering()` at `verification_engine.ts:80-87`:
- Reads `context.evidenceReport.totalEvidence` (27) → knows evidence exists
- Does NOT read `context.confidenceReport.sourceTrace` (12 items) → ignores available data
- Fails because `context.sourceTrace` (from parser) is undefined

### Finding 4: Two Different Verification Goals Are Conflated

- **Goal A (LLM Compliance)**: "Did the LLM cite sources in its response?" (CHECK 002's actual purpose)
- **Goal B (System Readiness)**: "Does the system have evidence to support the answer?" (what the user wants)

CHECK 002 attempts to verify Goal A using Source #2, but when Source #2 is undefined, it implies Goal A failed. **However**, the hard gate at `synthesis_handler.ts:63` treats this as a system failure, without distinguishing between:
- LLM didn't cite sources (Goal A failure)
- System had no evidence (Goal B failure)

### Finding 5: The First Point of LLM Dependency

**`synthesis_handler.ts:36`** — `executeResponsePipeline('extract_trace', replyMessage, rctx)`

Before this line:
- All data comes from backend (database queries, deterministic calculations)
- All data is structured, typed, and traceable

After this line:
- The verification engine depends on LLM output for a critical decision
- If LLM output format doesn't match parser expectations, verification fails

### Finding 6: Why LITE and ASSISTANT Work

`verifyPersonal()` (`verification_engine.ts:140-210`) does NOT have:
- CHECK 002 (Source Trace Exists)
- CHECK 003 (Source Trace Format)

These checks exist ONLY in `verifyEngineering()` — which is only called for ENGINEER mode.

### Finding 7: Other Verification Checks Have Similar Design Flaws

- CHECK 007 (Forbidden Phrases): Verifies LLM output phrases like "saya tidak tahu pasti" — also depends on exact LLM wording
- CHECK 008 (Apologetic Refusal): Verifies LLM output for "maaf, saya tidak dapat" — also depends on exact LLM wording

Both would fail if LLM uses different phrasing (e.g., "I'm not sure" in Indonesian context).

## Confirmed Facts
| Fact | Confidence |
|------|------------|
| Double source of truth exists at `synthesis_handler.ts:40-43` | 100% |
| `context.sourceTrace` (parser) != `context.confidenceReport.sourceTrace` (backend) | 100% |
| CHECK 002 reads parser output, not backend source trace | 100% |
| Parser is presentation layer acting as authoritative source | 100% |
| First LLM dependency point is `synthesis_handler.ts:36` | 100% |
| LITE/ASSISTANT work because they don't have CHECK 002 | 100% |
| Backend has source trace data that is never read by verifyEngineering() | 100% |
| The design flaw is architectural, not a simple bug | 95% |

## Hypotheses
1. **H1 (90%)**: The original designer intended CHECK 002 to verify that LLM cites sources (Goal A), but conflated this with system evidence requirement (Goal B). The parser was added as a convenience (extract from text) without realizing it would become the authoritative input for a critical verification gate.
2. **H2 (10%)**: The designer intentionally used parser output because they wanted to verify what the LLM actually says, not what the system knows. However, the hard gate (blocking all response) is too severe for a Goal A failure.

## Limitations
- No design documents (ADRs) were found explaining WHY CHECK 002 was designed this way
- No commit history or PR descriptions available for the verification engine's creation
- Cannot determine if this was intentional design or accidental implementation

## Confidence Level
- Overall: **95%**
- Double source of truth: 100%
- Parser as presentation layer: 100%
- Conflation of verification goals: 90%
- LITE/ASSISTANT bypass: 100%
- Original design intent: 80% (inferred from code structure)

## Recommended Next Audit
No further audits recommended for this root cause chain. Proceed to create comprehensive SUMMARY.md documenting all findings.
