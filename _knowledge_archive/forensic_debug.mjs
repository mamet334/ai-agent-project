import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

(async () => {
  console.log('--- 1. FRONTEND TRACE (SENDING PAYLOAD) ---');
  const payload = {
    message: 'saya tinggal di surabaya timur',
    userId: '3841e124-15c1-44bb-9034-bde61410882d',
    tools: [],
    history: []
  };
  console.log('Raw Payload:', JSON.stringify(payload));
  
  try {
    const res = await fetch('https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Headers:', JSON.stringify(Object.fromEntries(res.headers.entries())));
    console.log('Response JSON:', JSON.stringify(result).substring(0, 500) + '...');
  } catch (err) {
    console.error('Fetch Error:', err);
  }
  
  console.log('\n--- 2. DATABASE REALITY CHECK & RLS CHECK ---');
  try {
    const getRes = await fetch('https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process');
    const dbData = await getRes.json();
    
    // RLS Check using Anon Key directly
    const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: anonData, error: anonErr } = await anonClient.from('user_memories').select('id').limit(1);
    
    console.log('RLS Check (Anon Key):', anonErr ? anonErr.message : (anonData.length === 0 ? '0 ROWS RETURNED (BLOCKED/EMPTY)' : 'DATA VISIBLE'));
    
    console.log('Database reality (Service Role via Edge Function):');
    if (dbData.memories) {
      const targetMemory = dbData.memories.find(m => m.summary.toLowerCase().includes('surabaya timur'));
      console.log('Found "surabaya timur":', targetMemory ? 'YES' : 'NO');
      if (targetMemory) console.log('Memory Object:', JSON.stringify(targetMemory));
      console.log('Latest Memory in DB:', dbData.memories[0] ? JSON.stringify(dbData.memories[0]) : 'NONE');
    }
  } catch (err) {
    console.error('DB Check Error:', err);
  }
})();
