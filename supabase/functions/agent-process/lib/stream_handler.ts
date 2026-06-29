import { RuntimeContext } from './runtime_context.ts';
import { geminiKeyIndex, setGeminiKeyIndex } from './llm_orchestrator.ts';

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

      // 2. TIMEOUT SAFETY FETCH
      const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 15000) => {
        const aborter = new AbortController();
        const id = setTimeout(() => aborter.abort(), timeout);
        try {
          const res = await fetch(url, { ...options, signal: aborter.signal });
          clearTimeout(id);
          return res;
        } catch (err) {
          clearTimeout(id);
          throw err;
        }
      };

      const processOpenAIStream = async (res: Response) => {
         const reader = res.body?.getReader();
         if (!reader) throw new Error("No body");
         let buffer = '';
         while (true) {
           const { done, value } = await reader.read();
           if (done) break;
           buffer += new TextDecoder().decode(value);
           const lines = buffer.split('\n');
           buffer = lines.pop() || '';
           for (const line of lines) {
             if (line.startsWith('data: ') && !line.includes('[DONE]')) {
               try {
                 const data = JSON.parse(line.substring(6));
                 const content = data.choices?.[0]?.delta?.content || '';
                 if (content) enqueueStr(content);
               } catch(e) {}
             }
           }
         }
      };

      const processGeminiStream = async (res: Response) => {
         const reader = res.body?.getReader();
         if (!reader) throw new Error("No body");
         let buffer = '';
         let isThinking = false;
         while (true) {
           const { done, value } = await reader.read();
           if (done) break;
           buffer += new TextDecoder().decode(value);
           const lines = buffer.split('\n');
           buffer = lines.pop() || '';
           for (const line of lines) {
             if (line.startsWith('data: ')) {
               try {
                 const data = JSON.parse(line.substring(6));
                 const part = data.candidates?.[0]?.content?.parts?.[0];
                 let content = part?.text || '';
                 const partIsThought = !!part?.thought;
                 if (content) {
                   if (partIsThought && !isThinking) { content = '<think>\n' + content; isThinking = true; }
                   else if (!partIsThought && isThinking) { content = '\n</think>\n\n' + content; isThinking = false; }
                   enqueueStr(content);
                 }
               } catch(e) {}
             }
           }
         }
         if (isThinking) enqueueStr('\n</think>\n\n');
      };

      // Format messages
      const oaiMessages: any[] = [];
      const geminiContents = [];
      if (systemPromptText) {
         oaiMessages.push({ role: 'system', content: systemPromptText });
      }
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          oaiMessages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
          geminiContents.push({ role: msg.role === 'model' ? 'model' : 'user', parts: [{ text: msg.content }] });
        }
      }
      oaiMessages.push({ role: 'user', content: promptText });
      
      const userParts: any[] = [{ text: promptText }];
      if (rctx.stream.extractedImage) userParts.push({ inlineData: { mimeType: rctx.stream.extractedImage.mimeType, data: rctx.stream.extractedImage.data } });
      geminiContents.push({ role: 'user', parts: userParts });

      const geminiPayload: any = { contents: geminiContents };
      if (systemPromptText) geminiPayload.systemInstruction = { parts: [{ text: systemPromptText }] };

      // === STREAMING CASCADE EXECUTION ===
      let currentError = '';

      const tryGroq = async (fallbackNote = '') => {
        if (!rctx.keys.groq) throw new Error("No Groq Key");
        let groqModel = 'llama-3.1-8b-instant';
        if (rctx.model.model && rctx.model.model.startsWith('groq/')) groqModel = rctx.model.model.replace('groq/', '');
        console.log("[Stream] Trying Groq:", groqModel);
        const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${rctx.keys.groq}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: groqModel, messages: oaiMessages, temperature: 0.1, stream: true })
        });
        if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
        if (fallbackNote) enqueueStr(`\n\n*(Fallback Note: ${fallbackNote})*\n\n`);
        await processOpenAIStream(res);
      };

      const tryOpenRouter = async (fallbackNote = '') => {
        if (!rctx.keys.openRouter) throw new Error("No OpenRouter Key");
        let orModel = 'meta-llama/llama-3.1-8b-instruct:free';
        if (rctx.model.model && rctx.model.model.startsWith('openrouter/')) orModel = rctx.model.model.replace('openrouter/', '');
        console.log("[Stream] Trying OpenRouter:", orModel);
        const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${rctx.keys.openRouter}`, 'HTTP-Referer': 'https://ai-agent-project.vercel.app', 'X-Title': 'Mamet AI Agent', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: orModel, messages: oaiMessages, temperature: 0.1, stream: true })
        });
        if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
        if (fallbackNote) enqueueStr(`\n\n*(Fallback Note: ${fallbackNote})*\n\n`);
        await processOpenAIStream(res);
      };

      const tryGemini = async (fallbackNote = '') => {
         if (rctx.keys.allGemini.length === 0) throw new Error("No Gemini Keys");
         const geminiModel = rctx.model.model && rctx.model.model.includes('gemini') ? rctx.model.model : 'gemini-2.0-flash';
         console.log("[Stream] Trying Gemini:", geminiModel);
         
         let res: Response | null = null;
         let lastErr = '';
         for (let ki = 0; ki < rctx.keys.allGemini.length; ki++) {
           const key = rctx.keys.allGemini[(geminiKeyIndex + ki) % rctx.keys.allGemini.length];
           try {
             const attempt = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${key}`, {
               method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiPayload)
             }, 15000);
             if (attempt.ok) {
               setGeminiKeyIndex((geminiKeyIndex + ki + 1) % rctx.keys.allGemini.length);
               res = attempt;
               break;
             }
             lastErr = `HTTP ${attempt.status}`;
             if (attempt.status === 404 || attempt.status === 400) {
                 throw new Error(`FATAL_CLIENT_ERROR: Gemini Model Not Found or Bad Request. ${lastErr}`);
             }
           } catch(e: any) { 
             lastErr = e.message; 
             if (lastErr.includes('FATAL_CLIENT_ERROR')) throw e;
           }
         }
         if (!res) throw new Error(`Gemini exhausted. Last error: ${lastErr}`);
         if (fallbackNote) enqueueStr(`\n\n*(Fallback Note: ${fallbackNote})*\n\n`);
         await processGeminiStream(res);
      };

      const tryOpenAI = async () => {
         if (!rctx.keys.openAI) throw new Error("No OpenAI Key");
         console.log("[Stream] Trying OpenAI:", rctx.model.model);
         const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
           method: 'POST', headers: { 'Authorization': `Bearer ${rctx.keys.openAI}`, 'Content-Type': 'application/json' },
           body: JSON.stringify({ model: rctx.model.model || 'gpt-4o-mini', messages: oaiMessages, temperature: 0.1, stream: true })
         });
         if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
         await processOpenAIStream(res);
      };

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

      try {
        // EXPLICIT MODELS
        if (rctx.model.model && rctx.model.model.includes('gpt') && !rctx.model.model.includes('openrouter') && rctx.keys.openAI) {
          try { await tryOpenAI(); await closeSafely(); return; } catch(e: any) { currentError += e.message; console.warn("OpenAI fail, cascading...", e); }
        }
        if (rctx.model.model && (rctx.model.model.includes('openrouter') || rctx.model.model.startsWith('openrouter/')) && rctx.keys.openRouter) {
          try { await tryOpenRouter(); await closeSafely(); return; } catch(e: any) { currentError += e.message; console.warn("OR fail, cascading...", e); }
        }
        if (rctx.model.model && rctx.model.model.startsWith('groq/') && rctx.keys.groq) {
          try { await tryGroq(); await closeSafely(); return; } catch(e: any) { currentError += e.message; console.warn("Groq fail, cascading...", e); }
        }

        // CASCADE: Gemini -> Groq -> OpenRouter
        try {
           await tryGemini(); await closeSafely(); return;
        } catch(e1: any) {
           if (e1.message.includes('FATAL_CLIENT_ERROR')) {
               enqueueStr(`\n\n**[SYSTEM HALTED] Client Error:** ${e1.message}\n\n`);
               await closeSafely(); return;
           }
           console.warn("Cascade: Gemini failed:", e1.message);
           try {
              await tryGroq("Gemini sedang limit, ini otak cadangan Groq"); await closeSafely(); return;
           } catch(e2: any) {
              console.warn("Cascade: Groq failed:", e2.message);
              try {
                 await tryOpenRouter("Groq dan Gemini limit, ini otak cadangan OpenRouter"); await closeSafely(); return;
              } catch(e3: any) {
                 console.error("Cascade: OpenRouter failed:", e3.message);
                 enqueueStr(`\n\n**Semua AI Provider (Gemini, Groq, OpenRouter) sedang limit atau gangguan.**\nDetail: ${e1.message} | ${e2.message} | ${e3.message}`);
                 await closeSafely(); return;
              }
           }
        }
      } catch(fatalErr: any) {
         console.error("Fatal Stream Error:", fatalErr);
         enqueueStr(`\n\n**Internal Server Error:** ${fatalErr.message}`);
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
