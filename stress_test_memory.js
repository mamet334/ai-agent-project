const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/agent-process`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const STRESS_TEST_USER_ID = '99999999-9999-9999-9999-999999999999';
const TEST_MESSAGE = "Catatan riset: Binance memiliki volume derivatif terbesar di industri kripto";

async function runTest() {
  console.log("🚀 START STRESS TEST...");
  
  await supabase.from('user_memories').delete().eq('user_id', STRESS_TEST_USER_ID);

  const payload = {
    message: TEST_MESSAGE,
    userId: STRESS_TEST_USER_ID,
    userName: "StressTestUser",
    model: "gemini-2.5-flash",
    tools: [],
    stream: false,
    history: []
  };

  const headers = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY
  };

  const fire = async (id, delayMs) => {
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    const start = Date.now();
    try {
      const res = await fetch(FUNCTION_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      return { id, status: res.status, latency: Date.now() - start, ok: res.ok, data };
    } catch (e) {
      return { id, status: 'ERROR', ok: false, error: e.message };
    }
  };

  const requests = [];
  for (let i = 1; i <= 5; i++) requests.push(fire(`FC-${i}`, i * 20));
  for (let i = 1; i <= 10; i++) requests.push(fire(`RC-${i}`, 150));

  const results = await Promise.all(requests);
  
  let successCount = results.filter(r => r.ok).length;
  console.log(`📡 Sent 15 requests, Success: ${successCount}`);
  
  results.forEach(r => {
    console.log(`[REQ ${r.id}] Status: ${r.status} | Latency: ${r.latency}ms | OK: ${r.ok}`);
    if (!r.ok) console.log(`   Error data: ${JSON.stringify(r.data)}`);
  });

  await new Promise(r => setTimeout(r, 2000));
  const { data: memories } = await supabase.from('user_memories').select('user_id, message_hash').eq('user_id', STRESS_TEST_USER_ID);
  
  console.log(`\n💾 Data in Database: ${memories ? memories.length : 0} (Expected: 1)`);
  if (memories && memories.length === 1) {
    console.log("🎉 [PASS] Sistem Anti-Duplicate bekerja Sempurna!");
    console.log("Row Data: " + JSON.stringify(memories));
  }
  else console.log(`❌ [FAIL] Insert count is ${memories ? memories.length : 0}`);
}
runTest();
