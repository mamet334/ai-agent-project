import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const anonClient = createClient(SUPABASE_URL, ANON_KEY);

(async () => {
  console.log('--- 1. SCHEMA VALIDATION ---');
  // If user_id is UUID, sending a blatant non-UUID string should throw 22P02 "invalid input syntax for type uuid"
  const { error: typeErr } = await anonClient.from('user_memories').insert({ user_id: 'not-a-uuid', summary: 'test', memory_type: 'test' });
  console.log('Schema Type Error Check:', typeErr ? typeErr.message : 'No error');
  const isUUID = typeErr && typeErr.code === '22P02';
  console.log('user_id Type is UUID:', isUUID ? 'YES' : 'UNKNOWN');

  console.log('\n--- 2. WRITE TEST (ANON KEY) ---');
  const payload = [{
    user_id: '3841e124-15c1-44bb-9034-bde61410882d', // A valid UUID
    summary: 'audit trace test UUID',
    memory_type: 'LOCATION'
  }];
  console.log("Executing: anonClient.from('user_memories').insert(...)");
  const { data: insertData, error: insertError } = await anonClient.from('user_memories').insert(payload).select();
  console.log('result.data:', JSON.stringify(insertData));
  console.log('result.error:', JSON.stringify(insertError));
  
  console.log('\n--- 3. DATABASE TRUTH CHECK (VIA EDGE FUNCTION / SERVICE ROLE) ---');
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/agent-process');
    const dbData = await res.json();
    console.log('EXISTS (via Service Role bypassing RLS):', dbData.memories && dbData.memories.length > 0 ? 'YES' : 'NO');
    if (dbData.memories && dbData.memories.length > 0) {
      console.log('Latest Record user_id type:', typeof dbData.memories[0].user_id);
    }
  } catch (err) {
    console.error('Fetch Error:', err.message);
  }

})();
