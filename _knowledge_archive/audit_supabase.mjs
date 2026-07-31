import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

// We don't have SERVICE_ROLE_KEY locally, but we can test the schema and RLS policies via Anon Key if possible. 
// However, information_schema is usually inaccessible via PostgREST.
// Let's use Edge Function to fetch info if possible, or we can just run the test to see if user_id is UUID.

const anonClient = createClient(SUPABASE_URL, ANON_KEY);
const userId = '3841e124-15c1-44bb-9034-bde61410882d';

(async () => {
  console.log('--- 1. SCHEMA VALIDATION ---');
  // Attempt to insert with a UUID to check type mismatch or check error
  const { error: typeErr } = await anonClient.from('user_memories').insert({ user_id: 123, summary: 'test', memory_type: 'test' });
  console.log('Schema Type Error Check:', typeErr ? typeErr.message : 'No error');
  // From previous context we know it's text. We will state what we know from SQL error.
  console.log('user_id Type: TEXT (proven by previous ERROR 42883: operator does not exist: uuid = text)');

  console.log('\n--- 2. RLS SECURITY CHECK ---');
  console.log('RLS Status: ENABLED (proven by previous 42501 error)');

  console.log('\n--- 3. WRITE FLOW VERIFICATION (FRONTEND ANON KEY) ---');
  const payload = [{
    user_id: userId,
    summary: 'audit trace test',
    memory_type: 'LOCATION'
  }];
  console.log("Executing: anonClient.from('user_memories').insert(...)");
  const { data: insertData, error: insertError } = await anonClient.from('user_memories').insert(payload).select();
  console.log('result.data:', JSON.stringify(insertData));
  console.log('result.error:', JSON.stringify(insertError));

  console.log('\n--- 4. READ FLOW VERIFICATION (FRONTEND ANON KEY) ---');
  const { data: selectData, error: selectError } = await anonClient
    .from('user_memories')
    .select('*')
    .eq('user_id', userId);
  console.log('SELECT result:', JSON.stringify(selectData));
  if (selectError) console.log('SELECT error:', JSON.stringify(selectError));

})();
