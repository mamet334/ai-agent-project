import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRAG() {
  const userId = '1a61e7a5-c8ea-4811-9a3b-2877a16f2c68'; // I don't know the exact user ID, I need to find it.
  
  // Wait, I can just query without user id? No, match_documents requires p_user_id.
  
  const { data: users } = await supabase.from('user_memories').select('user_id').limit(1);
  const p_user_id = users && users.length > 0 ? users[0].user_id : 'unknown';
  
  console.log("Using user_id:", p_user_id);
  
  const { data, error } = await supabase.rpc('match_documents', {
    query_text: "berapa pejabat dan siapa saja yang menjabat di kel air gading?",
    match_count: 5,
    p_user_id: p_user_id
  });
  
  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log("Match Results:", JSON.stringify(data, null, 2));
  }
}

testRAG();
