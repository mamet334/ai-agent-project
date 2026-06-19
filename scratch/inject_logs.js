const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '../supabase/functions/agent-process/index.ts');
let code = fs.readFileSync(indexPath, 'utf8');

const targetPoint = `// Kita hanya mengambil 'message' murni (tanpa embel-embel dokumen 50rb karakter) agar token Groq tidak meledak
        const memoryPromise1 = processAndSaveMemory(message, "[Chat Biasa - AI Respons Streamed]", userId, Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', GEMINI_API_KEY, GROQ_API_KEY).catch(e => console.error(e));
        // @ts-ignore
        if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
          // @ts-ignore
          EdgeRuntime.waitUntil(memoryPromise1);
        }

        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps });
          if (streamRes) return streamRes;
        }`;

const replacementPoint = `// Kita hanya mengambil 'message' murni (tanpa embel-embel dokumen 50rb karakter) agar token Groq tidak meledak
        console.log('[AGENT_PROCESS] Memanggil processAndSaveMemory secara fire-and-forget...');
        const memoryPromise1 = processAndSaveMemory(message, "[Chat Biasa - AI Respons Streamed]", userId, Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', GEMINI_API_KEY, GROQ_API_KEY).catch(e => console.error(e));
        console.log('[AGENT_PROCESS] Pemanggilan processAndSaveMemory dilepas (promise belum selesai).');
        
        // @ts-ignore
        if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
          // @ts-ignore
          EdgeRuntime.waitUntil(memoryPromise1);
        }

        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps });
          console.log('[AGENT_PROCESS] MENGEMBALIKAN STREAMRES. KONEKSI HTTP AKAN DITUTUP SEKARANG!');
          if (streamRes) return streamRes;
        }`;

code = code.replace(targetPoint, replacementPoint);
fs.writeFileSync(indexPath, code);
console.log('Index.ts debug logs injected successfully!');
