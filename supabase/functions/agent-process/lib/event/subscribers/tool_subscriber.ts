import { eventBus, MAEFEvent } from '../event_bus.ts';
import { getPluginByName } from '../../../plugins/registry.ts';
import { CapabilityRegistry } from '../../adapters/adapter_registry.ts';
import { ToolDispatcher } from '../../orchestration/dispatcher/tool_dispatcher.ts';

const PER_PLUGIN_TIMEOUT_MS = 12000;

export const initializeToolSubscriber = () => {
  eventBus.subscribe('Tool.Requested', async (event: MAEFEvent) => {
    const { subagent, task, fullTask, executionId, env, rctx, userId, accumulatedContext } = event.payload;

    const plugin = getPluginByName(subagent);
    if (!plugin) {
       eventBus.emit({
           type: 'Tool.Completed',
           source: 'ToolSubscriber',
           trace_id: event.trace_id,
           payload: { 
               executionId, 
               subagent, 
               task, 
               status: 'FAIL_NOT_FOUND',
               subagentResText: `Sub-agent '${subagent}' tidak ditemukan di sistem plugin.`,
               subagentSources: [],
               subagentToolExec: null
           }
       });
       return;
    }

    eventBus.emit({
        type: 'Tool.Invoked',
        source: 'ToolSubscriber',
        trace_id: event.trace_id,
        payload: { subagent, task, executionId }
    });

    const customRunLLM = async (prompt: string, sys: string, hist: any[]) => {
        await CapabilityRegistry.initializeAdapters(rctx);
        let preferredOrder = ['gemini', 'groq', 'openrouter'];
        if (subagent === 'coder' || subagent === 'debate') {
            preferredOrder = ['openrouter', 'gemini', 'groq'];
        } else if (subagent === 'scraper' || subagent === 'communicator' || subagent === 'youtube_analyst' || subagent === 'file_analyzer') {
            preferredOrder = ['groq', 'gemini', 'openrouter'];
        }
        
        const adapters = CapabilityRegistry.getAvailableAIAdapters(preferredOrder);
        const adapterPayload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: sys }] }
        };
        
        if (hist && hist.length > 0) {
            const histContents = hist.map(m => ({
                role: m.role === 'model' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));
            adapterPayload.contents = [...histContents, ...adapterPayload.contents] as any;
        }
        
        for (const adapter of adapters) {
            try {
                const adapterInput = {
                    promptText: prompt,
                    systemPromptText: sys,
                    chatHistory: hist,
                    payload: adapterPayload,
                    forceDefaultModel: false,
                    model: adapter.name === 'GroqAdapter' ? 'llama-3.1-8b-instant' : 
                           adapter.name === 'OpenRouterAdapter' ? 'google/gemini-2.0-flash-exp:free' : 
                           'gemini-2.5-flash'
                };
                const result = await adapter.execute(adapterInput, { trace_id: event.trace_id });
                if (result && result.result) return result.result;
            } catch(e) { console.warn(`Subagent ${subagent} Adapter ${adapter.name} failed:`, e); }
        }
        throw new Error("Semua AI Adapter gagal (limit/gangguan) untuk subagent " + subagent);
    };

    const customRunResearch = async (prompt: string, context: string): Promise<{ text: string, sources: any[] }> => {
        await CapabilityRegistry.initializeAdapters(rctx);
        const adapters = CapabilityRegistry.getAvailableAIAdapters(['gemini', 'groq', 'openrouter']);
        const sys = 'Anda adalah asisten peneliti yang objektif.';
        const fullPrompt = `Cari informasi mengenai: ${prompt}\n\nKonteks:\n${context}`;
        const adapterPayload = {
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            systemInstruction: { parts: [{ text: sys }] },
            tools: [{ googleSearch: {} }]
        };
        
        for (const adapter of adapters) {
            try {
                const result = await adapter.execute({
                    promptText: fullPrompt,
                    systemPromptText: sys,
                    chatHistory: [],
                    payload: adapterPayload,
                    forceDefaultModel: false,
                    model: adapter.name === 'GroqAdapter' ? 'llama-3.1-8b-instant' : 'gemini-2.5-flash'
                }, { trace_id: event.trace_id });
                if (result && result.result) return { text: result.result, sources: result.metadata?.sources || [] };
            } catch(e) { console.warn(`Research Adapter ${adapter.name} failed:`, e); }
        }
        throw new Error("Research gagal: Semua AI Adapter limit/gangguan");
    };

    const startTime = Date.now();
    let lifecycleState = 'CREATED';
    const abortController = new AbortController();

    try {
        lifecycleState = 'RUNNING';
        const controlledFetch = (input: RequestInfo | URL, init?: RequestInit) => {
            return fetch(input, { ...init, signal: init?.signal || abortController.signal });
        };
        
        const executeContext = { 
            task: fullTask, cleanTask: task, accumulatedContext, 
            env: { ...env, signal: abortController.signal, fetch: controlledFetch }, 
            runLLM: customRunLLM, runResearch: customRunResearch, userId, signal: abortController.signal, rctx
        };

        const isolatedExecutionPromise = (async () => {
            try {
                const rawResult = await ToolDispatcher.execute(subagent, { task: fullTask }, rctx, async () => {
                    return await plugin.execute(executeContext);
                });
                
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
        
        const durationMs = Date.now() - startTime;
        eventBus.emit({
            type: 'Tool.Completed',
            source: 'ToolSubscriber',
            trace_id: event.trace_id,
            payload: {
                executionId, subagent, task,
                status: 'COMPLETED',
                durationMs,
                subagentResText: result?.output || '',
                subagentSources: result?.sources || [],
                subagentToolExec: result?.toolExecution || null
            }
        });

    } catch (err: any) {
        const durationMs = Date.now() - startTime;
        const status = err.message === 'HARD_TIMEOUT_REACHED' ? 'timeout' : 'fail';
        
        let subagentResText = '';
        if (status === 'timeout') {
            subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent "${subagent}" dibatalkan permanen (Hard Timeout ${PER_PLUGIN_TIMEOUT_MS/1000}s).`;
        } else {
            subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent gagal pada mode terisolasi (${err.message || 'Unknown'}).`;
        }

        eventBus.emit({
            type: 'Tool.Completed',
            source: 'ToolSubscriber',
            trace_id: event.trace_id,
            payload: {
                executionId, subagent, task,
                status,
                durationMs,
                error_message: err.message,
                subagentResText,
                subagentSources: [],
                subagentToolExec: { status: lifecycleState, safe_fallback: true, error_classification: status === 'timeout' ? "TIMEOUT_GATED" : "EXECUTION_ERROR" }
            }
        });
    }
  });
};
