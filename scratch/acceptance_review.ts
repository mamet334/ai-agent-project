import { VerificationEngine, VerificationContext } from "../supabase/functions/agent-process/lib/verification_engine.ts";

console.log("==========================================");
console.log("ACCEPTANCE REVIEW: VERIFICATION ENGINE");
console.log("==========================================");

// SCENARIO 1: ALL PASS
const passContext: VerificationContext = {
    responseText: "Ini adalah jawaban valid.",
    sourceTrace: "ADR-0005, MEM-0012",
    confidenceReport: { score: 90 },
    evidenceReport: { valid: true },
    runtimeContext: { mode: "ENGINEER" }
};

console.log("\n>>> TEST SCENARIO 1: ALL VALID INPUTS");
const report1 = VerificationEngine.verify(passContext);
console.log("STATUS:", report1.status);
console.log("SCORE:", report1.score);
console.log("FAILURES:", report1.failures.length);

// SCENARIO 2: RESPONSE EMPTY (CHECK 1 FAIL)
const fail1Context: VerificationContext = {
    ...passContext,
    responseText: "   "
};
console.log("\n>>> TEST SCENARIO 2: EMPTY RESPONSE (CHECK_001)");
const report2 = VerificationEngine.verify(fail1Context);
console.log("STATUS:", report2.status);
console.log("FAILURES:", report2.failures.map(f => f.id).join(", "));

// SCENARIO 3: SOURCE TRACE MISSING (CHECK 2 FAIL)
const fail2Context: VerificationContext = {
    ...passContext,
    sourceTrace: ""
};
console.log("\n>>> TEST SCENARIO 3: SOURCE TRACE MISSING (CHECK_002)");
const report3 = VerificationEngine.verify(fail2Context);
console.log("STATUS:", report3.status);
console.log("FAILURES:", report3.failures.map(f => f.id).join(", "));

// SCENARIO 4: SOURCE TRACE INVALID FORMAT (CHECK 3 FAIL)
const fail3Context: VerificationContext = {
    ...passContext,
    sourceTrace: "abc-1234"
};
console.log("\n>>> TEST SCENARIO 4: SOURCE TRACE INVALID FORMAT (CHECK_003)");
const report4 = VerificationEngine.verify(fail3Context);
console.log("STATUS:", report4.status);
console.log("FAILURES:", report4.failures.map(f => f.id).join(", "));

// SCENARIO 5: CONFIDENCE REPORT MISSING (CHECK 4 FAIL)
const fail4Context: VerificationContext = {
    ...passContext,
    confidenceReport: undefined
};
console.log("\n>>> TEST SCENARIO 5: CONFIDENCE REPORT MISSING (CHECK_004)");
const report5 = VerificationEngine.verify(fail4Context);
console.log("STATUS:", report5.status);
console.log("FAILURES:", report5.failures.map(f => f.id).join(", "));

// SCENARIO 6: EVIDENCE REPORT MISSING (CHECK 5 FAIL)
const fail5Context: VerificationContext = {
    ...passContext,
    evidenceReport: null
};
console.log("\n>>> TEST SCENARIO 6: EVIDENCE REPORT MISSING (CHECK_005)");
const report6 = VerificationEngine.verify(fail5Context);
console.log("STATUS:", report6.status);
console.log("FAILURES:", report6.failures.map(f => f.id).join(", "));

// SCENARIO 7: RUNTIME CONTEXT MISSING (CHECK 6 FAIL)
const fail6Context: VerificationContext = {
    ...passContext,
    runtimeContext: undefined
};
console.log("\n>>> TEST SCENARIO 7: RUNTIME CONTEXT MISSING (CHECK_006)");
const report7 = VerificationEngine.verify(fail6Context);
console.log("STATUS:", report7.status);
console.log("FAILURES:", report7.failures.map(f => f.id).join(", "));
