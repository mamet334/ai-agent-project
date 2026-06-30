import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { executeRequestPipeline } from './lib/request/request_pipeline.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { coreEngine } from './lib/orchestration/core_engine.ts';
import { streamController } from './lib/streaming/stream_controller.ts';
import { corsHeaders } from './lib/stream_handler.ts';

serve(async (req) => {
  if (req.method === 'GET') {
    const runtimeEnv = {
      supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
      supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
      apifyApiToken: Deno.env.get('APIFY_API_TOKEN') || '',
      enableAsyncMemoryWrite: Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false'
    };
    try {
      const supClient = createClient(runtimeEnv.supabaseUrl, runtimeEnv.supabaseServiceKey);
      const { data: logsData, error: logsError } = await supClient.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(50);
      const { data: memData, error: memError } = await supClient.from('user_memories').select('*').order('created_at', { ascending: false }).limit(50);
      return new Response(JSON.stringify({ logs: logsData, logsError, memories: memData, memError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }

  try {
    const pipelineResult = await executeRequestPipeline({ request: req, corsHeaders });
    if (pipelineResult.response) return pipelineResult.response;

    const { ctx, rctx } = pipelineResult;

    // --- EXECUTE ORCHESTRATION ---
    const engineResult = await coreEngine.execute(ctx, rctx);
    
    // --- POST EXECUTION GUARANTEES ---
    await rctx.tasks.awaitAll();

    // --- STREAMING OR RESPONSE LAYER ---
    return streamController.pipe(engineResult, rctx);

  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
