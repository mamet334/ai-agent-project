import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { executeRequestPipeline } from './lib/request/request_pipeline.ts';
import { coreEngine } from './lib/orchestration/core_engine.ts';
import { streamController } from './lib/streaming/stream_controller.ts';
import { corsHeaders } from './lib/stream_handler.ts';

serve(async (req) => {
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
