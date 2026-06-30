import { getPluginByName } from '../../../plugins/registry.ts';
import { eventBus } from '../../event/event_bus.ts';
import { CapabilityRegistry } from '../../adapters/adapter_registry.ts';

export const ExecutionPlannerHandler = {
  async execute(plan: any[], ctx: any, rctx: any, maef: any, initialAccumulatedContext: string, initialModel: string): Promise<{ accumulatedContext: string, subagentRuns: any[] }> {
    let accumulatedContext = initialAccumulatedContext;
    let subagentRuns: any[] = [];
    let model = initialModel;

    if (!plan || plan.length === 0) {
        return { accumulatedContext, subagentRuns };
    }

    const INDEPENDENT_PLUGINS = new Set(['scraper', 'researcher', 'deep_research', 'youtube_analyst', 'file_analyzer', 'shopee_ninja', 'memory_manager', 'cron_manager']);
    const executionTiers: any[][] = [];
    let currentTier: any[] = [];
    const seenTasks = new Set();
    
    for (let i = 0; i < plan.length; i++) {
      if (i >= 5) {
        console.log("Mamet Healer: Membatasi maksimal 5 tugas (Budget Limit).");
        break;
      }
      
      const p = plan[i];
      const taskSignature = p.subagent + ":" + (p.task || "").substring(0, 30);
      
      if (seenTasks.has(taskSignature)) continue;
      seenTasks.add(taskSignature);
      
      if (INDEPENDENT_PLUGINS.has(p.subagent)) {
          currentTier.push(p);
      } else {
          if (currentTier.length > 0) {
              executionTiers.push([...currentTier]);
              currentTier = [];
          }
          executionTiers.push([p]);
      }
    }
    if (currentTier.length > 0) executionTiers.push(currentTier);

    if (maef.shouldExecutePhase('TOOL_EXECUTION')) {
      maef.requestTransition('TOOL_EXECUTION', 'Starting Sub-agent Execution Graph');
      const GLOBAL_TIMEOUT_MS = 24000;
      const PER_PLUGIN_TIMEOUT_MS = 12000;
      const orchestrationStartTime = Date.now();

      ctx.state.processingSteps.push(`🧠 Orchestrator: Membangun graph dengan ${executionTiers.length} tier eksekusi.`);

      for (let tierIdx = 0; tierIdx < executionTiers.length; tierIdx++) {
          const tierTasks = executionTiers[tierIdx];
          
          if (Date.now() - orchestrationStartTime > GLOBAL_TIMEOUT_MS) {
              console.warn(`[BUDGET_ENFORCER] Global Orchestration Budget Exceeded! Sisa tugas dibatalkan.`);
              ctx.state.processingSteps.push(`⚠️ Eksekusi dibatalkan karena melebihi total waktu budget (24s).`);
              break;
          }

          const tierPromises = tierTasks.map((taskDef) => {
             return new Promise<any>((resolve) => {
               const { subagent, task } = taskDef;
               const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
               const fullTask = `Tugas Spesifik Anda: ${task}\n\nPermintaan Asli User: "${ctx.request.finalMessage}"\n\nKonteks Tambahan (Hasil Tier Sebelumnya):\n${accumulatedContext}`;
               
               ctx.state.processingSteps.push(`🚀 Eksekusi [Tier ${tierIdx+1}]: Sub-Agent "${subagent}"`);
               
               const env = { 
                  GEMINI_API_KEY: rctx.keys.gemini, 
                  GROQ_API_KEY: rctx.keys.groq, 
                  OPENAI_API_KEY: rctx.keys.openAI, 
                  OPENROUTER_API_KEY: rctx.keys.openRouter, 
                  APIFY_API_TOKEN: rctx.env.apifyApiToken, 
                  allGeminiKeys: rctx.keys.allGemini 
               };

               const handler = (event: any) => {
                   if (event.payload.executionId === executionId) {
                       eventBus.unsubscribe?.('Tool.Completed', handler);
                       
                       const res = event.payload;
                       if (res.status === 'COMPLETED') {
                           const outputPreview = (res.subagentResText || '').substring(0, 80).replace(/\n/g, ' ');
                           ctx.state.processingSteps.push(`✅ [Tier ${tierIdx+1}] "${subagent}" selesai (${res.durationMs}ms)${res.subagentSources?.length > 0 ? ` → ${res.subagentSources.length} sumber referensi` : ''} → "${outputPreview}..."`);
                       } else if (res.status === 'FAIL_NOT_FOUND') {
                           ctx.state.processingSteps.push(`⚠️ Sub-Agent "${subagent}" tidak ditemukan`);
                       } else if (res.status === 'timeout') {
                           ctx.state.processingSteps.push(`⏳ [Tier ${tierIdx+1}] "${subagent}" tereliminasi (Hard Timeout Gated)`);
                       } else {
                           ctx.state.processingSteps.push(`❌ [Tier ${tierIdx+1}] "${subagent}" gagal terisolasi: ${res.error_message || 'Unknown'}`);
                       }
                       resolve({ 
                           subagent, task, 
                           subagentResText: res.subagentResText, 
                           subagentSources: res.subagentSources, 
                           subagentToolExec: res.subagentToolExec 
                       });
                   }
               };

               // Subscribe using a standard subscription. Note that EventBus might not have `unsubscribe`.
               // We will filter it manually inside the handler.
               eventBus.subscribe('Tool.Completed', handler);

               eventBus.emit({
                   type: 'Tool.Requested',
                   source: 'Orchestrator',
                   trace_id: rctx?.tasks?.traceId || 'unknown',
                   payload: { subagent, task, fullTask, executionId, env, rctx, userId: ctx.auth.userId, accumulatedContext }
               });
             });
           });

          const tierResults = await Promise.allSettled(tierPromises);

          for (const outcome of tierResults) {
              if (outcome.status === 'fulfilled') {
                  const res = outcome.value;
                  const safeSubagent = String(res.subagent || "UNKNOWN");
                  subagentRuns.push({ subagent: safeSubagent, task: res.task, output: res.subagentResText, sources: res.subagentSources, toolExecution: res.subagentToolExec });
                  accumulatedContext += `--- Hasil Sub-Agent [${safeSubagent.toUpperCase()}]: ---\nTugas: ${res.task}\nOutput: ${res.subagentResText}\n\n`;
              }
          }
          
          if (tierIdx < executionTiers.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
          }
      }
    }

    return { accumulatedContext, subagentRuns };
  }
};
