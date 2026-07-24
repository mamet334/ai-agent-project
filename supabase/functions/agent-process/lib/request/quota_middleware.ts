import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export async function checkQuota(userId: string, supabaseUrl: string, supabaseServiceKey: string, stream: boolean, corsHeaders: HeadersInit): Promise<Response | null> {
  try {
    const supClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: currentCost, error: quotaError } = await supClient.rpc('check_daily_quota', { target_user_id: userId });
    
    if (!quotaError && currentCost !== null) {
      const DAILY_LIMIT = 1; // $1 per hari (setara ~Rp16.000)
      if (Number(currentCost) >= DAILY_LIMIT) {
         console.warn(`[CIRCUIT BREAKER] User ${userId} exceeded daily quota: $${currentCost}`);
         
         if (!stream) {
           return new Response(JSON.stringify({ 
              message: `[CIRCUIT BREAKER AKTIF] Limit harian AI Anda telah habis ($${Number(currentCost).toFixed(2)} / $${DAILY_LIMIT}). Arus API telah diputus otomatis untuk mencegah tagihan bengkak. Silakan coba lagi besok hari!` 
           }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
         } else {
           const streamRes = new ReadableStream({
             start(controller) {
               const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**[CIRCUIT BREAKER AKTIF]** Limit harian AI Anda telah habis ($${Number(currentCost).toFixed(2)} / $${DAILY_LIMIT}). Arus API telah diputus otomatis untuk mencegah tagihan bengkak. Silakan coba lagi besok hari!` } }] });
               controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
               controller.close();
             }
           });
           return new Response(streamRes, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
         }
      }
    }
  } catch (quotaCheckError) {
    console.error("Quota check failed, bypassing...", quotaCheckError);
  }
  return null;
}