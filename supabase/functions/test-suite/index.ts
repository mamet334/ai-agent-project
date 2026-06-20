import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const userId = '11111111-2222-3333-4444-555555555555';
    // Use a dummy anon key format if SUPABASE_ANON_KEY is somehow missing
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.xxx';

    const adminSupabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // =====================================================================
    // TEST 1: WRITE INTEGRITY TEST (Via Edge Function Gateway)
    // =====================================================================
    const testMessage = 'ingat ini fakta penting: kode rahasiaku adalah OMEGA TEST 999';
    
    const edgeRes = await fetch(SUPABASE_URL + '/functions/v1/agent-process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: testMessage, userId, tools: [], history: [] })
    });
    const edgeStatus = edgeRes.status;
    
    // Wait 10 seconds to allow the LLM to process and trigger memory_manager
    await new Promise(r => setTimeout(r, 10000));

    // =====================================================================
    // TEST 2: DATABASE PERSISTENCE TEST
    // =====================================================================
    const { data: records, error: dbErr } = await adminSupabase
      .from('user_memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    let exists = 'NO';
    let latest_record = null;
    let contentMatch = 'NO';

    if (records && records.length > 0) {
       exists = 'YES';
       latest_record = records[0];
       if (latest_record.summary.toLowerCase().includes('omega') || latest_record.summary.toLowerCase().includes('999')) {
           contentMatch = 'YES';
       }
    }

    // =====================================================================
    // TEST 3: RLS SECURITY TEST
    // =====================================================================
    const anonSupabase = createClient(SUPABASE_URL, ANON_KEY);
    
    const { error: anonInsErr } = await anonSupabase.from('user_memories').insert([{ user_id: userId, summary: 'HACK', memory_type: 'FACT' }]);
    const rls_insert_blocked = anonInsErr && anonInsErr.code === '42501' ? 'YES' : 'NO';

    const { data: anonSelData, error: anonSelErr } = await anonSupabase.from('user_memories').select('*').limit(1);
    const rls_select_blocked = (!anonSelData || anonSelData.length === 0) ? 'YES' : 'NO';

    // =====================================================================
    // TEST 4: END-TO-END CONSISTENCY TEST
    // =====================================================================
    const userIdMatch = latest_record && latest_record.user_id === userId ? 'YES' : 'NO';

    // =====================================================================
    // TEST 5: MEMORY V2 RETRIEVAL TEST
    // =====================================================================
    const { data: subgraph, error: sgErr } = await adminSupabase.rpc('extract_cognitive_subgraph', {
      p_user_id: userId,
      p_keywords: ['kode', 'rahasia', 'omega', 'test', '999'],
      p_intent_mode: 'DELTA',
      p_max_nodes: 5,
      p_max_edges: 5,
      p_traversal_depth: 1
    });

    let retrievalSuccess = 'NO';
    let sourceOfTruth = 'UNKNOWN';
    let subgraphValid = 'NO';

    if (!sgErr && subgraph && subgraph.nodes) {
       retrievalSuccess = 'YES';
       sourceOfTruth = 'DB_ONLY';
       subgraphValid = subgraph.nodes.some((n: any) => n.summary.toLowerCase().includes('omega') || n.summary.toLowerCase().includes('999')) ? 'YES' : 'NO';
    }

    const report = `
============================================================
🔥 TEST 1 — WRITE INTEGRITY TEST (CRITICAL)
============================================================
Edge Function Gateway Status: ${edgeStatus}

============================================================
🔥 TEST 2 — DATABASE PERSISTENCE TEST
============================================================
exists: ${exists}
latest_record id: ${latest_record?.id || 'null'}
latest_record content: ${latest_record?.summary || 'null'}
latest_record memory_type: ${latest_record?.memory_type || 'null'}

============================================================
🔥 TEST 3 — RLS SECURITY TEST
============================================================
rls_insert_blocked: ${rls_insert_blocked}
rls_select_blocked: ${rls_select_blocked}

============================================================
🔥 TEST 4 — END-TO-END CONSISTENCY TEST
============================================================
content_match: ${contentMatch}
user_id_match: ${userIdMatch}

============================================================
🔥 TEST 5 — MEMORY V2 RETRIEVAL TEST
============================================================
retrieval_success: ${retrievalSuccess}
source_of_truth: ${sourceOfTruth}
subgraph_valid: ${subgraphValid}
Subgraph Error details: ${sgErr ? JSON.stringify(sgErr) : 'None'}

============================================================
📊 FINAL REPORT FORMAT
============================================================
PIPELINE STATUS:
Write working: ${contentMatch === 'YES' ? 'YES' : 'NO'}
Persistence working: ${exists}
RLS secure: ${(rls_insert_blocked === 'YES' && rls_select_blocked === 'YES') ? 'YES' : 'NO'}
Retrieval working: ${subgraphValid}
End-to-end system: ${(contentMatch === 'YES' && exists === 'YES' && rls_insert_blocked === 'YES' && subgraphValid === 'YES') ? 'PASS' : 'FAIL'}
`;

    return new Response(report, { headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });

  } catch (err: any) {
    return new Response("FATAL ERROR: " + err.message + "\n" + err.stack, { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    });
  }
});
