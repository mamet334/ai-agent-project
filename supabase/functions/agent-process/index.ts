import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { executeRequestPipeline } from './lib/request/request_pipeline.ts';
import { coreEngine } from './lib/orchestration/core_engine.ts';
import { streamController } from './lib/streaming/stream_controller.ts';
import { corsHeaders } from './lib/stream_handler.ts';
import { pingHeartbeat } from './lib/adapters/heartbeat.ts';

// PRIORITY 2: ENVIRONMENT VALIDATION (STARTUP)
const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY'
];

let envValidationStatus = 'OK';
let missingEnvs: string[] = [];

try {
  missingEnvs = REQUIRED_ENV_VARS.filter(key => !Deno.env.get(key));
  if (missingEnvs.length > 0) {
    envValidationStatus = 'DEGRADED';
    console.error(`[ENV_VALIDATOR] Missing critical environment variables: ${missingEnvs.join(', ')}`);
  }
} catch(e) {
  envValidationStatus = 'ERROR';
}

serve(async (req) => {
  try {
    // PRIORITY 2: DEEP HEALTH CHECK SYSTEM
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/health')) {
      const healthReport = {
         status: envValidationStatus === 'OK' ? 'HEALTHY' : envValidationStatus,
         timestamp: new Date().toISOString(),
         missing_env: missingEnvs,
         services: {
            backend: 'UP',
            edge_function: 'UP',
            database: Deno.env.get('SUPABASE_URL') ? 'CONFIGURED' : 'MISSING_URL',
            llm_provider: (Deno.env.get('GEMINI_API_KEY') || Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('GROQ_API_KEY')) ? 'CONFIGURED' : 'MISSING',
         }
      };

      if (healthReport.status === 'HEALTHY') {
        await pingHeartbeat('agent-process', 'HEALTHY');
      }

      return new Response(JSON.stringify(healthReport), {
        status: envValidationStatus === 'OK' ? 200 : 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle CORS for OPTIONS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    const pipelineResult = await executeRequestPipeline({ request: req, corsHeaders });
    if (pipelineResult.response) return pipelineResult.response;

    const { ctx, rctx } = pipelineResult;

    // --- EXECUTE ORCHESTRATION ---
    const engineResult = await coreEngine.execute(ctx, rctx);
    
    // --- POST EXECUTION GUARANTEES ---
    await rctx.tasks.awaitAll();

    // === TAMBAHAN: Update heartbeat HEALTHY setiap kali request sukses ===
    await pingHeartbeat('agent-process', 'HEALTHY');

    // --- STREAMING OR RESPONSE LAYER ---
    return streamController.pipe(engineResult, rctx);

  } catch (error: any) {
    console.error('Edge Function Error:', error);
    await pingHeartbeat('agent-process', 'DOWN');
    
    // Determine appropriate status code
    const errorMessage = String(error.message || '');
    let statusCode = 500;
    
    // Provider/LLM errors should return 400 (client error) rather than 500 (server error)
    if (errorMessage.includes('Provider') || errorMessage.includes('failed') || errorMessage.includes('not available')) {
      statusCode = 400;
    }
    
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
