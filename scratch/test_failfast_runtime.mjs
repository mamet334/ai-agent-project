import fs from 'fs';

const SUPABASE_URL = "https://uuyzdjifhdfyyvpxsofu.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/agent-process`;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest(testName, payload, expectedBehavior, validateFn) {
  console.log(`\n========================================`);
  console.log(`🧪 TEST: ${testName}`);
  console.log(`========================================`);
  console.log(`[Payload]: ${JSON.stringify(payload)}`);
  
  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let bodyText = "";
    if (payload.stream) {
        const textDecoder = new TextDecoder();
        const reader = res.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bodyText += textDecoder.decode(value, { stream: true });
        }
    } else {
        bodyText = await res.text();
    }
    
    console.log(`[HTTP Status]: ${res.status}`);
    console.log(`[Response Output Preview]: ${bodyText.substring(0, 300)}...`);

    const passed = validateFn(res.status, bodyText);
    
    if (passed) {
        console.log(`✅ RESULT: PASS (${expectedBehavior} verified)`);
    } else {
        console.log(`❌ RESULT: FAIL (Did not match expected behavior)`);
    }
  } catch (error) {
    console.error(`❌ TEST ERROR: ${error.message}`);
  }
}

async function main() {
    // TEST 1: UUID GATE
    await runTest(
        "UUID ENFORCEMENT",
        {
            message: "testing UUID failure",
            userId: "slametbro798@gmail.com",
            stream: false,
            tools: []
        },
        "HTTP 400 Bad Request with FATAL_ERROR",
        (status, text) => status === 400 && text.includes("FATAL_ERROR")
    );

    await delay(1000);

    // TEST 2: INVALID MODEL (Should fail fast without fallback)
    await runTest(
        "INVALID MODEL (gemini-2.5-flash)",
        {
            message: "testing model 404 guard",
            userId: "52e37376-94fd-41dd-a679-810020ad0b70",
            model: "gemini-9.9-invalid",
            stream: true,
            ragEnabled: false,
            tools: []
        },
        "Stream emits SYSTEM HALTED Client Error",
        (status, text) => status === 200 && text.includes("SYSTEM HALTED") && text.includes("Client Error")
    );

    await delay(1000);

    // TEST 3: RAG FAILURE (Via Embedding Overload)
    const giantString = "test ".repeat(10000); // 50,000 chars, exceeds 8192 tokens
    await runTest(
        "RAG FAILURE SIMULATION",
        {
            message: giantString,
            userId: "52e37376-94fd-41dd-a679-810020ad0b70",
            stream: false,
            ragEnabled: true,
            tools: []
        },
        "HTTP 500 with RAG_DB_FAIL",
        (status, text) => status === 500 && text.includes("RAG_DB_FAIL")
    );
}

main();
