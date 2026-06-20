import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const anonClient = createClient(SUPABASE_URL, ANON_KEY);

(async () => {
  console.log('--- 1. SCHEMA VALIDATION ---');
  console.log('Schema Type: UNKNOWN (Requires SQL inspection, but assuming UUID if migration ran)');

  console.log('\n--- 2. WRITE TEST (DIRECT SUPABASE INSERT) ---');
  const payload = [{
    user_id: '3841e124-15c1-44bb-9034-bde61410882d',
    summary: 'audit trace direct insert',
    memory_type: 'LOCATION'
  }];
  console.log("Executing: anonClient.from('user_memories').insert(...)");
  const { data: insertData, error: insertError } = await anonClient.from('user_memories').insert(payload).select();
  console.log('result.data:', JSON.stringify(insertData));
  console.log('result.error:', JSON.stringify(insertError));

  console.log('\n--- 3. EDGE FUNCTION WRITE TEST ---');
  const edgePayload = {
    message: 'saya suka minum kopi luwak asli',
    userId: '3841e124-15c1-44bb-9034-bde61410882d',
    tools: [],
    history: []
  };
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/agent-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edgePayload)
    });
    console.log('Edge Function Response Status:', res.status);
    
    console.log('\n--- 4. DATABASE TRUTH CHECK ---');
    const getRes = await fetch(SUPABASE_URL + '/functions/v1/agent-process');
    const dbData = await getRes.json();
    const coffeeMemory = dbData.memories.find(m => m.summary.toLowerCase().includes('kopi luwak'));
    console.log('EXISTS:', coffeeMemory ? 'YES' : 'NO');
    if (coffeeMemory) console.log('Memory Object:', JSON.stringify(coffeeMemory));
  } catch (e) {
    console.error(e);
  }

})();
