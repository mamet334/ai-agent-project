const fetch = require('node-fetch');

async function testCronManager() {
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';
  const realUserId = '3841e124-15c1-44bb-9034-bde61410882d'; // andreanastasya798@gmail.com

  console.log("=== TEST: Buat jadwal via agent-process (simulasi browser) ===");
  const res = await fetch('https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({
      message: 'buat jadwal untuk mencari peluang bisnis AI terbaru setiap 12 jam',
      tools: ['web_search', 'deep_research', 'youtube_analyst', 'code_executor', 'api_caller', 'logika', 'bahasa', 'debate', 'cron_manager'],
      model: 'coordinator-agent',
      stream: false,
      userId: realUserId,
      userName: 'andreanastasya798',
      history: []
    })
  });

  const text = await res.text();
  console.log("Status:", res.status);
  
  try {
    const json = JSON.parse(text);
    console.log("\nMessage:", json.message);
    console.log("\nSubagent Runs:", JSON.stringify(json.subagentRuns, null, 2));
  } catch (e) {
    console.log("Raw:", text.substring(0, 500));
  }
}

testCronManager().catch(console.error);
