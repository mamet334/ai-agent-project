import { corsHeaders } from '../agent-process/lib/stream_handler.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Return health check response with CORS headers
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ping'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

