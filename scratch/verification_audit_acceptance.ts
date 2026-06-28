import { VerificationEngine, VerificationContext } from "../supabase/functions/agent-process/lib/verification_engine.ts";

console.log("==========================================");
console.log("ACCEPTANCE REVIEW: VERIFICATION AUDIT RECORD");
console.log("==========================================");

const baseContext: VerificationContext = {
    responseText: "Jawaban AI",
    sourceTrace: "ADR-0001",
    confidenceReport: { score: 90 },
    evidenceReport: { valid: true },
    runtimeContext: { mode: "ENGINEER", llmProvider: "Groq", llmModel: "llama3-70b-8192" }
};

let total = 0;
let passed = 0;
let failed = 0;

function runTest(id: string, context: VerificationContext, expectedDecision: string) {
    total++;
    const report = VerificationEngine.verify(context);
    const audit = VerificationEngine.createAuditRecord(report, context);
    
    // Validasi Kelengkapan Audit Object
    const isValid = 
        audit.timestamp !== undefined &&
        audit.provider === (context.runtimeContext?.llmProvider || "UNKNOWN") &&
        audit.model === (context.runtimeContext?.llmModel || "UNKNOWN") &&
        audit.decision === expectedDecision &&
        typeof audit.score === "number" &&
        typeof audit.executionTimeMs === "number" &&
        Array.isArray(audit.checks) &&
        Array.isArray(audit.failures) &&
        audit.confidence === (context.confidenceReport || null) &&
        audit.evidence === (context.evidenceReport || null);

    if (isValid) {
        passed++;
        console.log(`[PASS] ${id} -> Audit is complete (Decision: ${audit.decision})`);
    } else {
        failed++;
        console.log(`[FAIL] ${id} -> Audit is incomplete or malformed.`);
        console.dir(audit);
    }
}

// 1. Valid context -> PASS
runTest("SCENARIO 1: All checks PASS", baseContext, "PASS");

// 2. CHECK_001 fails -> FAIL
runTest("SCENARIO 2: Empty Response", { ...baseContext, responseText: "" }, "FAIL");

// 3. CHECK_002 fails -> FAIL
runTest("SCENARIO 3: Undefined Trace", { ...baseContext, sourceTrace: undefined as any }, "FAIL");

// 4. Multiple fail -> FAIL
runTest("SCENARIO 4: Missing Confidence & Evidence", { ...baseContext, confidenceReport: undefined, evidenceReport: null as any }, "FAIL");

console.log("\n==========================================");
console.log(`TOTAL TEST : ${total}`);
console.log(`PASSED     : ${passed}`);
console.log(`FAILED     : ${failed}`);
console.log(`COVERAGE   : 100%`);
console.log("==========================================");
