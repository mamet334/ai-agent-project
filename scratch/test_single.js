const edgeFunctionUrl = "https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ";
const userId = "3841e124-15c1-44bb-9034-bde61410882d";

async function run() {
  const payload = {
    message: "Tolong ingat nama panggilan saya Pak Slamet",
    history: [],
    userId: userId,
    isRagEnabled: true,
    stream: false,
    tools: [],
    model: "openrouter/anthropic/claude-sonnet-4.6"
  };

  try {
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
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text);
  } catch (e) {
    console.error("Error:", e.message);
  }
}
run();
