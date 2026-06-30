import { getPluginByName } from '../../../plugins/registry.ts';
import { runLLM } from '../../llm_orchestrator.ts';

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

          const tierPromises = tierTasks.map(async (taskDef) => {
             const { subagent, task } = taskDef;
             let subagentResText = 'Gagal memproses.';
             let subagentSources: any[] = [];
             let subagentToolExec = null;
             
             const plugin = getPluginByName(subagent);
             if (!plugin) {
                 ctx.state.processingSteps.push(`⚠️ Sub-Agent "${subagent}" tidak ditemukan`);
                 return { subagent, task, subagentResText: `Sub-agent '${subagent}' tidak ditemukan di sistem plugin.`, subagentSources, subagentToolExec };
             }
             
             ctx.state.processingSteps.push(`🚀 Eksekusi [Tier ${tierIdx+1}]: Sub-Agent "${subagent}"`);
             
             const env = { 
                GEMINI_API_KEY: rctx.keys.gemini, 
                GROQ_API_KEY: rctx.keys.groq, 
                OPENAI_API_KEY: rctx.keys.openAI, 
                OPENROUTER_API_KEY: rctx.keys.openRouter, 
                APIFY_API_TOKEN: rctx.env.apifyApiToken, 
                allGeminiKeys: rctx.keys.allGemini 
             };
             const fullTask = `Tugas Spesifik Anda: ${task}\n\nPermintaan Asli User: "${ctx.request.finalMessage}"\n\nKonteks Tambahan (Hasil Tier Sebelumnya):\n${accumulatedContext}`;
             
             const customRunLLM = async (prompt: string, sys: string, hist: any[]) => {
                const originalModel = model;
                try {
                  if (subagent === 'coder' || subagent === 'debate') {
                     model = 'openrouter-google-gemini-2.0-flash-exp';
                  } else if (subagent === 'scraper' || subagent === 'communicator' || subagent === 'youtube_analyst' || subagent === 'file_analyzer') {
                     model = 'groq-llama-3.1';
                  } else {
                     model = 'gemini-2.0-flash';
                  }
                  return await runLLM(prompt, sys, hist, rctx);
                } finally { model = originalModel; }
             };

             const customRunResearch = async (prompt: string, context: string): Promise<{ text: string, sources: any[] }> => {
                 const { callLLMWithMetadata } = await import('../../llm_orchestrator.ts');
                 const res = await callLLMWithMetadata(
                     `Cari informasi mengenai: ${prompt}\n\nKonteks:\n${context}`, 
                     'Anda adalah asisten peneliti yang objektif.', 
                     [], 'gemini', null, rctx, ['web_search']
                 );
                 return { text: res.result, sources: res.metadata?.sources || [] };
             };

             const startTime = Date.now();
             let lifecycleState = 'CREATED';
             const abortController = new AbortController();
             const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;

             try {
                lifecycleState = 'RUNNING';
                const controlledFetch = (input: RequestInfo | URL, init?: RequestInit) => {
                    return fetch(input, { ...init, signal: init?.signal || abortController.signal });
                };
                
                const executeContext = { 
                    task: fullTask, cleanTask: task, accumulatedContext, 
                    env: { ...env, signal: abortController.signal, fetch: controlledFetch }, 
                    runLLM: customRunLLM, runResearch: customRunResearch, userId: ctx.auth.userId, signal: abortController.signal 
                };

                const isolatedExecutionPromise = (async () => {
                   try {
                       const rawResult = await plugin.execute(executeContext);
                       if (lifecycleState !== 'RUNNING') {
                           console.warn(`[GATING_LAYER] Execution ${executionId} (${subagent}) late. Result DISCARDED.`);
                           return null; 
                       }
                       lifecycleState = 'COMPLETED';
                       return rawResult;
                   } catch (err) {
                       if (lifecycleState !== 'RUNNING') return null;
                       throw err;
                   }
                })();

                const timeoutPromise = new Promise((_, reject) => {
                  setTimeout(() => {
                      if (lifecycleState === 'RUNNING') {
                          lifecycleState = 'ORPHANED';
                          abortController.abort(new Error('TIMEOUT_ABORT'));
                          reject(new Error('HARD_TIMEOUT_REACHED'));
                      }
                  }, PER_PLUGIN_TIMEOUT_MS);
                });
                
                const result = await Promise.race([isolatedExecutionPromise, timeoutPromise]) as any;
                
                if (lifecycleState !== 'COMPLETED') throw new Error('GATING_VALIDATION_FAILED');
                
                subagentResText = result?.output || '';
                subagentSources = result?.sources || [];
                subagentToolExec = result?.toolExecution || null;
                
                const durationMs = Date.now() - startTime;
                const outputPreview = (subagentResText || '').substring(0, 80).replace(/\n/g, ' ');
                ctx.state.processingSteps.push(`✅ [Tier ${tierIdx+1}] "${subagent}" selesai (${durationMs}ms)${subagentSources.length > 0 ? ` → ${subagentSources.length} sumber referensi` : ''} → "${outputPreview}..."`);
             } catch (err: any) {
                const durationMs = Date.now() - startTime;
                const status = err.message === 'HARD_TIMEOUT_REACHED' ? 'timeout' : 'fail';
                
                subagentToolExec = { status: lifecycleState, safe_fallback: true, error_classification: status === 'timeout' ? "TIMEOUT_GATED" : "EXECUTION_ERROR" };
                
                if (status === 'timeout') {
                  subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent "${subagent}" dibatalkan permanen (Hard Timeout ${PER_PLUGIN_TIMEOUT_MS/1000}s).`;
                  ctx.state.processingSteps.push(`⏳ [Tier ${tierIdx+1}] "${subagent}" tereliminasi (Hard Timeout Gated)`);
                } else {
                  subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent gagal pada mode terisolasi (${err.message || 'Unknown'}).`;
                  ctx.state.processingSteps.push(`❌ [Tier ${tierIdx+1}] "${subagent}" gagal terisolasi: ${err.message || 'Unknown'}`);
                }
             }
             return { subagent, task, subagentResText, subagentSources, subagentToolExec };
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
