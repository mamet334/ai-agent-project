import { UnifiedExecutionContext } from './types.ts';

export function enforcePolicy(ctx: UnifiedExecutionContext, stream: boolean, corsHeaders: HeadersInit): Response | null {
  if (ctx.request.tools && Array.isArray(ctx.request.tools)) {
    ctx.request.tools = ctx.request.tools.filter(t => {
      if (t === 'cron_manager' && !ctx.policy.canUseAutomation) { console.warn(`[CAPABILITY_BLOCK] Tool '${t}' blocked: canUseAutomation=false (mode=${ctx.policy.mode})`); return false; }
      if (t === 'file_analyzer' && !ctx.policy.canUseDesktopTools) { console.warn(`[CAPABILITY_BLOCK] Tool '${t}' blocked: canUseDesktopTools=false (mode=${ctx.policy.mode})`); return false; }
      if (t === 'knowledge_manager' && !ctx.policy.canWriteKnowledge) { console.warn(`[CAPABILITY_BLOCK] Tool '${t}' blocked at orchestrator: canWriteKnowledge=false (mode=${ctx.policy.mode})`); return false; }
      return true;
    });
  }

  if (ctx.policy.decision === "BLOCK") {
    console.warn(`[EXECUTION POLICY] Blocked request from user ${ctx.auth.userId} due to HIGH risk. Trace:`, ctx.trace);
    const blockMsg = "Permintaan ditolak oleh Sistem Kebijakan Eksekusi. Deteksi injeksi atau pola berbahaya.";
    if (!stream) {
      return new Response(JSON.stringify({ message: blockMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      const streamRes = new ReadableStream({
        start(controller) {
          const data = JSON.stringify({ choices: [{ delta: { content: blockMsg } }] });
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
          controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
          controller.close();
        }
      });
      return new Response(streamRes, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
    }
  }
  
  if (ctx.policy.decision === "ALLOW_WITH_LIMIT") {
    console.warn(`[EXECUTION POLICY] Applied limits to user ${ctx.auth.userId} due to MEDIUM risk. Trace:`, ctx.trace);
  }

  if (!ctx.policy.toolsEnabled && ctx.request.tools && Array.isArray(ctx.request.tools)) {
      ctx.request.tools = []; 
  }
  return null;
}