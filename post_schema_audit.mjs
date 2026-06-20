import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const USER_ID = '3841e124-15c1-44bb-9034-bde61410882d';

(async () => {
  console.log('--- STEP 1 & 2: RLS TRUTH CHECK (AUTH CONTEXT REQUIRED) ---');
  console.log('As an external script, I only have the ANON_KEY and no active JWT session.');
  console.log('Therefore, direct Frontend INSERT/SELECT should correctly be blocked by RLS.');
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  
  const { error: insErr } = await anonClient.from('user_memories').insert({ user_id: USER_ID, summary: 'Fail Test', memory_type: 'LOCATION' });
  console.log('Anon Insert Result:', insErr ? 'BLOCKED (Expected)' : 'FAILED - It worked without auth?!');
  
  console.log('\n--- STEP 3: EDGE FUNCTION TEST (CRITICAL END-TO-END) ---');
  console.log('Mengirim memori "Sistem sudah beres hari ini" ke Production API...');
  
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/agent-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Sistem sudah beres hari ini',
        userId: USER_ID,
        tools: [],
        history: []
      })
    });
    console.log('API Response Status:', res.status);
    
    console.log('Menarik data riil dari database (via GET Service Role Endpoint)...');
    const getRes = await fetch(SUPABASE_URL + '/functions/v1/agent-process');
    const dbData = await getRes.json();
    
    if (dbData.memories) {
      const targetMemory = dbData.memories.find(m => m.summary.toLowerCase().includes('beres hari ini'));
      console.log('\n--- 4. FINAL VERDICT VERIFICATION ---');
      console.log('Data Benar-benar Masuk DB?:', targetMemory ? 'YES' : 'NO');
      if (targetMemory) console.log('Raw Data Record:', JSON.stringify(targetMemory));
    }
  } catch (err) {
    console.error('Edge Function Error:', err);
  }

})();
