import { RuntimeContext } from './runtime_context.ts';
import { runStreamLLM } from './llm_orchestrator.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-byok-gemini, x-byok-groq, x-byok-openai, x-byok-openrouter',
};

export const getStreamResponse = (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}, rctx: RuntimeContext) => {
  const safeMeta = { ...metaData };
  if (safeMeta.subagentRuns) safeMeta.subagentRuns = safeMeta.subagentRuns.map((r: any) => ({ ...r, output: '[Omitted to save header space]' }));

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueueStr = (text: string) => {
         const data = JSON.stringify({ choices: [{ delta: { content: text } }] });
         controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // 1. SSE EARLY INIT
      console.log("[SSE EARLY INIT] Streaming started before LLM calls");
      enqueueStr(""); // Send first chunk immediately to prevent hanging HTTP request

      if (rctx.policy.canUseDesktopTools && !systemPromptText.includes('DESKTOP NATIVE AWARENESS ENABLED')) {
         systemPromptText += `\n[STATUS: DESKTOP NATIVE AWARENESS ENABLED]\nAnda WAJIB mengeluarkan perintah Windows di dalam tag <terminal>. DILARANG menyebut sub-agent atau menolak. Contoh: <terminal>dir %USERPROFILE%\\Desktop</terminal>\n`;
      }

      const closeSafely = async () => {
         // --- 🔎 MAMET AI V3 LIGHT+ (AUDIT INJECTOR) ---
         try {
            if (safeMeta.auditMode === 'BASIC' || safeMeta.auditMode === 'FULL') {
                const amode = safeMeta.auditMode;
                const MAX_AUDIT_SUBAGENTS = 5;
                const shortId = (id: string | null) => id ? `${id.substring(0, 8)}...` : 'null';
                
                let auditStr = '\n\n---\n**🔍 AUDIT REPORT**\n\n';
                
                if (amode === 'BASIC') {
                    const ragPass = safeMeta.routingDecision?.workspace_id ? 'PASS' : (safeMeta.routingDecision?.scope === 'CORE' ? 'PASS' : 'FAIL');
                    const hasSave = safeMeta.subagentRuns?.find((r: any) => r.toolExecution?.target);
                    
                    auditStr += `- **Execution Contract:** ${safeMeta.contractValidation?.status || 'N/A'}\n`;
                    auditStr += `- **Routing Scope:** ${safeMeta.routingDecision?.scope || 'N/A'}\n`;
                    auditStr += `- **RAG Isolation:** ${ragPass}\n`;
                    if (hasSave) auditStr += `- **Save Decision:** APPROVED\n`;
                } else if (amode === 'FULL') {
                    auditStr += `**Execution Contract:**\n${safeMeta.contractValidation?.status || 'N/A'}\n\n`;
                    
                    auditStr += `**Routing Decision:**\nscope=${safeMeta.routingDecision?.scope || 'N/A'}\nworkspace_id=${shortId(safeMeta.routingDecision?.workspace_id)}\n\n`;
                    
                    auditStr += `**RAG:**\nscope=${safeMeta.routingDecision?.scope || 'N/A'}\nworkspace_id=${shortId(safeMeta.routingDecision?.workspace_id)}\nmatch_count=AUTO\n\n`;
                    
                    const saveTask = safeMeta.subagentRuns?.find((r: any) => r.toolExecution?.target);
                    if (saveTask && saveTask.toolExecution) {
                        auditStr += `**Save:**\ntarget=${saveTask.toolExecution.target}\nworkspace_id=${shortId(saveTask.toolExecution.workspace_id)}\nreason_code=${saveTask.toolExecution.reason_code}\napproved_by=${saveTask.toolExecution.approved_by}\n\n`;
                    }
                    
                    if (safeMeta.subagentRuns?.length > 0) {
                        auditStr += `**Subagent Execution:**\n`;
                        const runs = safeMeta.subagentRuns.slice(0, MAX_AUDIT_SUBAGENTS);
                        for (const r of runs) {
                            auditStr += `- ${r.subagent}\n`;
                        }
                        if (safeMeta.subagentRuns.length > MAX_AUDIT_SUBAGENTS) {
                            auditStr += `- ... (${safeMeta.subagentRuns.length - MAX_AUDIT_SUBAGENTS} more)\n`;
                        }
                    }
                }
                
                const MAX_AUDIT_LENGTH = 1500;
                if (auditStr.length > MAX_AUDIT_LENGTH) {
                    auditStr = auditStr.substring(0, MAX_AUDIT_LENGTH) + '\n... [AUDIT_TRUNCATED]';
                }
                
                enqueueStr(auditStr);
            }
         } catch (auditErr) {
            console.error("[Audit Injector Error]", auditErr);
         }

         try { controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`)); } catch (e) {}
         controller.close();
         await rctx.tasks.awaitAll();
      };

      let fullLLMResponse = '';

      try {
        // === ITERATE THROUGH CAPABILITY ADAPTER STREAM ===
        const streamIter = runStreamLLM(promptText, systemPromptText, chatHistory, rctx);
        for await (const chunk of streamIter) {
            fullLLMResponse += chunk;
            enqueueStr(chunk);
        }
        
        // === PHASE 3: SHADOW STREAM INTERCEPTOR ===
        // Analyze the buffered text for potential rogue edits before closing
        try {
            const { ToolDispatcher } = await import('./orchestration/dispatcher/tool_dispatcher.ts');
            
            // 1. Terminal Tag interception
            const terminalMatches = fullLLMResponse.match(/<terminal>([\s\S]*?)<\/terminal>/g);
            if (terminalMatches) {
                for (const match of terminalMatches) {
                    const cmd = match.replace(/<\/?terminal>/g, '').trim();
                    await ToolDispatcher.execute('run_command', { CommandLine: cmd }, rctx, async () => { /* shadow exec */ });
                }
            }

            // 2. Desktop JSON Tool interception (heuristic parsing)
            // Svelte desktop expects json blocks for tools
            const jsonMatches = fullLLMResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/g);
            if (jsonMatches) {
                for (const block of jsonMatches) {
                    try {
                        const innerJson = block.replace(/```(?:json)?/g, '').trim();
                        const parsed = JSON.parse(innerJson);
                        if (parsed && typeof parsed === 'object' && (parsed.tool || parsed.TargetFile || parsed.command)) {
                             const toolName = parsed.tool || 'desktop_tool_unknown';
                             await ToolDispatcher.execute(toolName, parsed, rctx, async () => { /* shadow exec */ });
                        }
                    } catch (e) { /* Ignore invalid JSON */ }
                }
            }
        } catch (interceptorErr) {
            console.error('[StreamInterceptor] Failed shadow analysis:', interceptorErr);
        }

      } catch(fatalErr: any) {
         console.error("Fatal Stream Error:", fatalErr);
         enqueueStr(`\n\n**Internal Server Error:** ${fatalErr.message}`);
      } finally {
         await closeSafely();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'X-Agent-Metadata': btoa(encodeURIComponent(JSON.stringify(safeMeta)))
    }
  });
};
