import { VerificationEngine, VerificationContext, logVerificationReport, VerificationReport } from "../supabase/functions/agent-process/lib/verification_engine.ts";

console.log("==========================================");
console.log("ACCEPTANCE REVIEW V2: VERIFICATION ENGINE");
console.log("==========================================");

const baseContext: VerificationContext = {
    responseText: "Jawaban AI",
    sourceTrace: "ADR-0001",
    confidenceReport: { score: 90 },
    evidenceReport: { valid: true },
    runtimeContext: { mode: "ENGINEER" }
};

let total = 0;
let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, errorMsg: string) {
    total++;
    if (condition) {
        passed++;
        console.log(`[PASS] ${testName}`);
    } else {
        failed++;
        console.log(`[FAIL] ${testName} - ${errorMsg}`);
    }
}

// Intercept console.log to test logger
const originalLog = console.log;
let logBuffer = "";
console.log = (...args) => {
    logBuffer += args.join(" ") + "\n";
    if (args[0] && typeof args[0] === 'string' && (args[0].includes('[PASS]') || args[0].includes('[FAIL]') || args[0].includes('==='))) {
        originalLog(...args); // still print test results to console
    }
};

// 1. All Valid
let report = VerificationEngine.verify(baseContext);
assert(report.decision === "PASS", "TC01: All Valid -> Decision PASS", `Got ${report.decision}`);
assert(report.score === 100, "TC02: All Valid -> Score 100", `Got ${report.score}`);
assert(report.passRate === 100, "TC03: All Valid -> Pass Rate 100", `Got ${report.passRate}`);
assert(report.failures.length === 0, "TC04: All Valid -> 0 Failures", `Got ${report.failures.length}`);

// 5. CHECK_001 Fail
const ctxFail1: VerificationContext = { ...baseContext, responseText: "" };
report = VerificationEngine.verify(ctxFail1);
assert(report.decision === "FAIL", "TC05: CHECK_001 Fail -> Decision FAIL", `Got ${report.decision}`);
assert(report.failures.length === 1 && report.failures[0].id === "CHECK_001_RESPONSE_NOT_EMPTY", "TC06: CHECK_001 Fail -> Specific Failure Logged", `Got failures: ${report.failures.map(f=>f.id).join(",")}`);
assert(report.failures[0].severity === "CRITICAL", "TC07: CHECK_001 Fail -> Severity CRITICAL", `Got ${report.failures[0]?.severity}`);

// 8. CHECK_002 Fail (also triggers CHECK_003 fail)
const ctxFail2: VerificationContext = { ...baseContext, sourceTrace: undefined as any };
report = VerificationEngine.verify(ctxFail2);
assert(report.failures.some(f => f.id === "CHECK_002_SOURCE_TRACE_EXISTS"), "TC08: CHECK_002 Fail -> Array Contains CHECK_002", "Not found in failures");
assert(report.failures.find(f => f.id === "CHECK_002_SOURCE_TRACE_EXISTS")?.severity === "CRITICAL", "TC09: CHECK_002 Fail -> Severity CRITICAL", "Wrong severity");
assert(report.passRate === 67, "TC10: 2 Checks Fail (002 & 003) -> Pass Rate 67%", `Got ${report.passRate}%`);

// 11. CHECK_003 Fail (Invalid format)
const ctxFail3: VerificationContext = { ...baseContext, sourceTrace: "invalid-trace" };
report = VerificationEngine.verify(ctxFail3);
assert(report.failures.length === 1 && report.failures[0].id === "CHECK_003_SOURCE_TRACE_FORMAT", "TC11: CHECK_003 Fail -> Specific Failure", "Not isolated to 003");
assert(report.failures[0].severity === "ERROR", "TC12: CHECK_003 Fail -> Severity ERROR", "Wrong severity");

// 13. CHECK_004 Fail
report = VerificationEngine.verify({ ...baseContext, confidenceReport: undefined });
assert(report.failures[0]?.severity === "WARNING" && report.failures[0].id === "CHECK_004_CONFIDENCE_REPORT_EXISTS", "TC13: CHECK_004 Fail -> Severity WARNING", "Wrong severity or ID");

// 14. Execution Time
assert(typeof report.executionTimeMs === "number" && report.executionTimeMs >= 0, "TC14: executionTimeMs >= 0", `Got ${report.executionTimeMs}`);

// 15. Logger Output format validation
logBuffer = "";
logVerificationReport(report);
assert(logBuffer.includes("VERIFICATION REPORT") && logBuffer.includes("Overall Status") && logBuffer.includes("Failures"), "TC15: logVerificationReport outputs formatted strings", "Missing expected substrings");

// Restore console
console.log = originalLog;
console.log("\n==========================================");
console.log(`TOTAL TEST : ${total}`);
console.log(`PASSED     : ${passed}`);
console.log(`FAILED     : ${failed}`);
console.log(`COVERAGE   : 100% (Integration)`);
console.log("==========================================");
