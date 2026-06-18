const edgeFunctionUrl = "https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ";

async function run() {
  try {
    const res = await fetch(edgeFunctionUrl, {
      method: "GET",
      headers: { 
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`
      }
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Memories Count:", data.memories?.length);
    console.log("Memories:", JSON.stringify(data.memories, null, 2));
    console.log("Logs Count:", data.logs?.length);
    console.log("Latest Logs:", JSON.stringify(data.logs?.slice(0, 15), null, 2));
  } catch (e) {
    console.error("Error:", e.message);
  }
}
run();
