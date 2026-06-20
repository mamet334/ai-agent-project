import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const userId = '3841e124-15c1-44bb-9034-bde61410882d';

(async () => {
  console.log('--- 1. FRONTEND TRACE (SENDING PAYLOAD) ---');
  const payload = {
    message: 'saya tinggal di surabaya timur',
    userId: userId,
    tools: [],
    history: []
  };
  console.log('Raw Payload:', JSON.stringify(payload));
  
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/agent-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('API Response Status:', res.status);
  } catch (err) {
    console.error('API Fetch Error:', err);
  }

  console.log('\n--- 2. BACKEND EXECUTION TRACE ---');
  console.log('LOG: UNKNOWN (No direct access to backend raw logs without Service Key/Dashboard)');

  console.log('\n--- 3. SUPABASE INSERT VERIFICATION (REAL TRACE) ---');
  console.log("Executing: supabase.from('user_memories').insert(...)");
  const { data: insertData, error: insertError } = await supabase.from('user_memories').insert([{
    user_id: userId,
    summary: 'saya tinggal di surabaya timur',
    memory_type: 'LOCATION'
  }]).select();
  
  console.log('result.data:', JSON.stringify(insertData));
  console.log('result.error:', JSON.stringify(insertError));

  console.log('\n--- 4. DATABASE TRUTH CHECK (SQL LEVEL) ---');
  const { data: selectData, error: selectError } = await supabase
    .from('user_memories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
    
  console.log('SELECT result:', JSON.stringify(selectData));
  if (selectError) console.log('SELECT error:', JSON.stringify(selectError));

  console.log('\n--- 5. RLS VERIFICATION ---');
  if (selectError) {
    console.log('Query Error:', selectError.message);
  } else if (!selectData || selectData.length === 0) {
    console.log('Query returned 0 rows via Anon Key. Checking Service Role (Unavailable -> UNKNOWN)');
  }
})();
