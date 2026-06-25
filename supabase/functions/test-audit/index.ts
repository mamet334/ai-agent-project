import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: spaces } = await supabase.from('knowledge_spaces').select('*');
    
    const targetSpace = spaces?.find(s => s.name.toLowerCase() === 'observasi pasar freelance');
    
    let docs = [];
    let chunkCount = 0;
    let otherDocs = [];

    if (targetSpace) {
      const { data: d } = await supabase.from('documents').select('*').eq('space_id', targetSpace.id);
      docs = d || [];
      if (docs.length > 0) {
        const docIds = docs.map(doc => doc.id);
        const { count } = await supabase.from('document_chunks').select('id', { count: 'exact' }).in('document_id', docIds);
        chunkCount = count || 0;
      }
      
      const { data: allUserDocs } = await supabase.from('documents').select('id, title, space_id').eq('user_id', targetSpace.user_id);
      otherDocs = allUserDocs || [];
    } else {
      const { data: od } = await supabase.from('documents').select('title, space_id').ilike('title', '%observasi%');
      otherDocs = od || [];
    }

    return new Response(JSON.stringify({ spaces, targetSpace, docs, chunkCount, otherDocs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
