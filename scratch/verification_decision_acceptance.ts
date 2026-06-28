import { VerificationEngine, VerificationContext } from "../supabase/functions/agent-process/lib/verification_engine.ts";

console.log("==========================================");
console.log("ACCEPTANCE REVIEW: VERIFICATION DECISION LAYER");
console.log("==========================================");

const baseContext: VerificationContext = {
    responseText: "Ini adalah jawaban valid.",
    sourceTrace: "ADR-0005, MEM-0012",
    confidenceReport: { score: 90 },
    evidenceReport: { valid: true },
    runtimeContext: { mode: "ENGINEER" }
};

let total = 0;
let passed = 0;
let failed = 0;

function runTest(id: string, context: VerificationContext, expectedDecision: string) {
    total++;
    const report = VerificationEngine.verify(context);
    if (report.decision === expectedDecision) {
        passed++;
        console.log(`[PASS] ${id} -> Got Decision: ${report.decision} | passRate: ${report.passRate}% (${report.passedChecks}/${report.totalChecks})`);
    } else {
        failed++;
        console.log(`[FAIL] ${id} -> Expected ${expectedDecision}, Got ${report.decision}`);
    }
}

// Scenario 1: Semua check PASS => Decision PASS
runTest("SCENARIO 1: All checks PASS", baseContext, "PASS");

// Scenario 2: CHECK_001 gagal => Decision FAIL
const ctxFail1: VerificationContext = { ...baseContext, responseText: "   " };
runTest("SCENARIO 2: CHECK_001 Fails", ctxFail1, "FAIL");

// Scenario 3: CHECK_002 gagal => Decision FAIL
const ctxFail2: VerificationContext = { ...baseContext, sourceTrace: "" };
runTest("SCENARIO 3: CHECK_002 Fails", ctxFail2, "FAIL");

// Scenario 4: Multiple CHECK gagal => Decision FAIL
const ctxFailMulti: VerificationContext = { ...baseContext, responseText: "", sourceTrace: "invalid-format" };
runTest("SCENARIO 4: Multiple Checks Fail", ctxFailMulti, "FAIL");

console.log("\n==========================================");
console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("==========================================");
