// scratch/source_trace_extractor_acceptance.ts

const extractSourceTrace = (msg: string): { replyWithoutTrace: string; sourceTrace?: string } => {
    const lines = msg.split('\n');
    const formatRegex = /[A-Z]{2,3}-\d{4}/;
    const keywordRegex = /^(?:\W|_)*(?:source\s*trace|sources?|referensi)\b/i;
    
    const scanLimit = Math.max(0, lines.length - 15);
    let headerIndex = -1;
    let firstIdIndex = -1;
    
    for (let i = scanLimit; i < lines.length; i++) {
       const line = lines[i].trim();
       if (headerIndex === -1 && keywordRegex.test(line)) headerIndex = i;
       if (firstIdIndex === -1 && formatRegex.test(line)) firstIdIndex = i;
    }
    
    let startIndex = -1;
    if (headerIndex !== -1) {
       let hasId = false;
       for (let i = headerIndex; i < lines.length; i++) {
          if (formatRegex.test(lines[i])) { hasId = true; break; }
       }
       if (hasId) startIndex = headerIndex;
       else if (firstIdIndex !== -1) startIndex = firstIdIndex;
    } else if (firstIdIndex !== -1) {
       startIndex = firstIdIndex;
    }
    
    if (startIndex !== -1) {
       return {
          replyWithoutTrace: lines.slice(0, startIndex).join('\n').trim(),
          sourceTrace: lines.slice(startIndex).join('\n').trim()
       };
    }
    
    return { replyWithoutTrace: msg, sourceTrace: undefined };
};

// ==========================================
// ACCEPTANCE TESTS
// ==========================================
let total = 0;
let passed = 0;
let failed = 0;

function runTest(id: string, input: string, validate: (res: any) => boolean, expectedDesc: string) {
    total++;
    const res = extractSourceTrace(input);
    const isPass = validate(res);
    if (isPass) {
        passed++;
        console.log(`[PASS] ${id} - ${expectedDesc}`);
    } else {
        failed++;
        console.log(`[FAIL] ${id} - ${expectedDesc}`);
        console.log(`       EXPECTED: ${expectedDesc}`);
        console.log(`       GOT: replyWithoutTrace="${res.replyWithoutTrace}", sourceTrace="${res.sourceTrace}"`);
    }
}

console.log("Starting Source Trace Extractor Acceptance Tests...\n");

// TEST 001
runTest("TEST_001", "Jawaban biasa tanpa Source Trace.", (res) => {
    return res.replyWithoutTrace === "Jawaban biasa tanpa Source Trace." && res.sourceTrace === undefined;
}, "sourceTrace undefined and reply identical");

// TEST 002
runTest("TEST_002", "Jawaban\n\nSource Trace\n\nADR-0001", (res) => {
    return res.sourceTrace?.includes("ADR-0001") && !res.replyWithoutTrace.includes("Source Trace");
}, "sourceTrace contains ADR-0001, replyWithoutTrace does not contain 'Source Trace'");

// TEST 003
runTest("TEST_003", "Jawaban\n\nSource Trace\n\nADR-0001\nADR-0002", (res) => {
    return res.sourceTrace?.includes("ADR-0001") && res.sourceTrace?.includes("ADR-0002");
}, "sourceTrace contains both ADR-0001 and ADR-0002");

// TEST 004
runTest("TEST_004", "Jawaban\n\nKB-0001\nADR-0002\nDOC-0003", (res) => {
    return res.sourceTrace?.includes("KB-0001") && res.sourceTrace?.includes("ADR-0002") && res.sourceTrace?.includes("DOC-0003");
}, "All identifiers are in sourceTrace");

// TEST 005
runTest("TEST_005", "Jawaban ini bla bla\nSource Trace: ADR-0001", (res) => {
    return res.sourceTrace === "Source Trace: ADR-0001";
}, "Trace at exact last line");

// TEST 006
runTest("TEST_006", "Jawaban ini\nSource Trace: ADR-0001\nBaris tambahan\nBaris penutup", (res) => {
    return res.sourceTrace?.includes("ADR-0001");
}, "Trace at 3rd line from bottom is found");

// TEST 007
runTest("TEST_007", "Jawaban\nADR0001\nADR-ABC\nABCDE\n12345", (res) => {
    return res.sourceTrace === undefined;
}, "Similar but invalid identifiers are ignored (undefined)");

// TEST 008
runTest("TEST_008", "A".repeat(1000) + "\n" + "B".repeat(100), (res) => {
    return res.sourceTrace === undefined && res.replyWithoutTrace.includes("A") && res.replyWithoutTrace.includes("B");
}, "Long text without trace remains unchanged");

// TEST 009
runTest("TEST_009", "Jawaban\n\nADR-0003\n\nKB-0015\n\nMEM-0007", (res) => {
    return res.sourceTrace?.includes("ADR-0003") && res.sourceTrace?.includes("MEM-0007");
}, "Multiple identifiers with spacing retained in order");

// TEST 010
runTest("TEST_010", "Jawaban LLM yang komprehensif.\n\nSource Trace: ADR-0001, MEM-0005", (res) => {
    return res.sourceTrace === "Source Trace: ADR-0001, MEM-0005";
}, "Matches Universal Evidence Contract output format");

console.log("\n==========================================");
console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("==========================================");
