const edgeFunctionUrl = "https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ";
const userId = "3841e124-15c1-44bb-9034-bde61410882d";

const queries = [
  "siapa nama panggilan saya?",
  "saya dipanggil siapa?",
  "nama saya siapa?",
  "panggil saya bagaimana?",
  "apakah kamu ingat nama saya?"
];

async function sendQuery(message) {
  const payload = {
    message,
    history: [],
    userId,
    isRagEnabled: true,
    stream: false,
    tools: [],
    model: "openrouter/anthropic/claude-sonnet-4.6"
  };

  const res = await fetch(edgeFunctionUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
      "x-bypass-cooldown": "true"
    },
    body: JSON.stringify(payload)
  });

  const status = res.status;
  const data = await res.json();
  return { status, message: data.message?.substring(0, 200), processingSteps: data.processingSteps };
}

async function run() {
  console.log("=== MEMORY RETRIEVAL VERIFICATION TEST ===\n");
  for (const q of queries) {
    console.log(`\n--- Query: "${q}" ---`);
    try {
      const result = await sendQuery(q);
      console.log("Status:", result.status);
      console.log("Response:", result.message);
      const memStep = result.processingSteps?.find(s => s.includes('MEMORY PROMPT'));
      console.log("Memory Step:", memStep || "(not found)");
    } catch (e) {
      console.error("Error:", e.message);
    }
    // wait 2s between queries to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));
  }
}
run();
