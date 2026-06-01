import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Buffer } from 'node:buffer';
import { getPluginPromptList, getPluginByName } from './plugins/registry.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

async function getGeminiEmbedding(text: string, geminiKey: string): Promise<number[]> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/gemini-embedding-2', content: { parts: [{ text }] } })
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.embedding?.values || [];
  } catch (e) {
    console.error("Embedding API failed", e);
    return [];
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-byok-gemini, x-byok-groq, x-byok-openai, x-byok-openrouter',
};

// Global state for Round-Robin API Keys (persists across warm invocations)
let geminiKeyIndex = 0;
let groqKeyIndex = 0;
let openaiKeyIndex = 0;
let openrouterKeyIndex = 0;

const getActiveKey = (envVarName: string, currentIndex: number, setIndex: (idx: number) => void): string => {
  const keysString = Deno.env.get(envVarName) || '';
  if (!keysString) return '';
  const keys = keysString.split(',').map(k => k.trim()).filter(k => k);
  if (keys.length === 0) return '';
  
  const key = keys[currentIndex % keys.length];
  setIndex((currentIndex + 1) % keys.length);
  return key;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let { message, tools, model, userId, userName, file, history, globalMemory, stream } = await req.json();

    const logAgentEvent = async (eventType: string, provider: string, logMessage: string) => {
      try {
        const supClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        await supClient.from('agent_logs').insert([{ user_id: userId || null, event_type: eventType, provider, message: logMessage }]);
      } catch (e) { console.error("Log error failed:", e); }
    };


    // --- MAMET HEALER (TERAPIS PIKIRAN) ---
    if (history && history.length > 15) {
      console.log("Mamet Healer: Melakukan Memory Sweeping...");
      history = [
        history[0], 
        { role: 'model', content: '[MAMET HEALER: Memori obrolan lama telah diringkas untuk mencegah kepenuhan memori dan menjaga kestabilan.]' }, 
        ...history.slice(-10)
      ];
    }

    let extractedImage = null;
    let finalMessage = message;

    if (file && file.data) {
      const filename = file.name.toLowerCase();
      const buffer = Buffer.from(file.data, 'base64');
      
      if (file.mimeType.startsWith('image/')) {
        extractedImage = { mimeType: file.mimeType, data: file.data };
      } else if (filename.endsWith('.txt') || filename.endsWith('.csv') || filename.endsWith('.md')) {
        finalMessage = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\nIsi Dokumen:\n${new TextDecoder().decode(buffer).substring(0, 50000)}`;
      } else {
        // Fallback PDF/DOCX yang kompleks dialihkan
        finalMessage = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\n(Catatan: Edge Function saat ini memprioritaskan teks/gambar. PDF akan dibaca secara ringkas jika memungkinkan)`;
      }
    }

    if (!finalMessage || !Array.isArray(tools)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // BYOK (Bring Your Own Key) Support
    const byokGemini = req.headers.get('x-byok-gemini');
    const byokGroq = req.headers.get('x-byok-groq');
    const byokOpenAI = req.headers.get('x-byok-openai');
    const byokOpenRouter = req.headers.get('x-byok-openrouter');

    const GEMINI_API_KEY = (byokGemini || getActiveKey('GEMINI_API_KEY', geminiKeyIndex, (idx) => { geminiKeyIndex = idx; }) || '').trim();
    const GROQ_API_KEY = (byokGroq || getActiveKey('GROQ_API_KEY', groqKeyIndex, (idx) => { groqKeyIndex = idx; }) || '').trim();
    const OPENAI_API_KEY = (byokOpenAI || getActiveKey('OPENAI_API_KEY', openaiKeyIndex, (idx) => { openaiKeyIndex = idx; }) || '').trim();
    const OPENROUTER_API_KEY = (byokOpenRouter || getActiveKey('OPENROUTER_API_KEY', openrouterKeyIndex, (idx) => { openrouterKeyIndex = idx; }) || '').trim();

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const streamGroqResponse = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}, fallbackSource = '') => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: messages,
          temperature: 0.1,
          stream: true
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Groq Stream Error:", errText);
        const fallbackNote = fallbackSource ? `\n\n*(Catatan Mamet Healer: Groq ikut meledak saat mencoba menjadi otak cadangan untuk ${fallbackSource} yang sebelumnya gagal.)*` : '';
        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**Groq API Error**: ${errText}${fallbackNote}` } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            controller.close();
          }
        });
        return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }

      return new Response(res.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'X-Agent-Metadata': JSON.stringify(metaData)
        }
      });
    };

    const callGroq = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.content
          });
        }
      }
      
      messages.push({ role: 'user', content: promptText });
      
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: messages,
          temperature: 0.1
        })
      });
      if (!res.ok) {
        throw new Error(`Groq API Error: ${res.status}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    };

    const streamOpenAIResponse = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: messages,
          temperature: 0.1,
          stream: true
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("OpenAI Stream Error:", errText);
        
        // --- MAMET HEALER (PENYEMBUH KOMA / AUTO-FALLBACK) ---
        if (GROQ_API_KEY) {
          console.log("Mamet Healer: Memutar rute ke Groq (Fallback)...");
          await logAgentEvent('FALLBACK_TRIGGERED', 'OpenAI', `Stream Error: ${errText.substring(0, 200)}`);
          return streamGroqResponse(promptText, systemPromptText + "\n\n(Catatan: Anda sedang menggunakan otak cadangan Groq karena OpenAI mengalami gangguan/limit)", chatHistory, metaData, 'OpenAI');
        }

        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**OpenAI API Error**: ${errText}` } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            controller.close();
          }
        });
        return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }

      const safeMeta = { ...metaData };
      if (safeMeta.subagentRuns) safeMeta.subagentRuns = safeMeta.subagentRuns.map((r: any) => ({ ...r, output: '[Omitted]' }));
      
      return new Response(res.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'X-Agent-Metadata': btoa(encodeURIComponent(JSON.stringify(safeMeta)))
        }
      });
    };

    const callOpenAI = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: messages,
          temperature: 0.1
        })
      });
      if (!res.ok) throw new Error(`OpenAI API Error: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    };

    const streamOpenRouterResponse = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      let openRouterModel = 'deepseek/deepseek-r1:free';
      if (model === 'openrouter-llama-3') openRouterModel = 'meta-llama/llama-3.1-8b-instruct:free';
      else if (model === 'openrouter-deepseek-r1') openRouterModel = 'deepseek/deepseek-r1:free';
      
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://ai-agent-project.vercel.app',
          'X-Title': 'Mamet AI Agent',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: messages,
          temperature: 0.1,
          stream: true
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("OpenRouter Stream Error:", errText);
        
        // --- MAMET HEALER (PENYEMBUH KOMA / AUTO-FALLBACK) ---
        if (GROQ_API_KEY) {
          console.log("Mamet Healer: Memutar rute ke Groq (Fallback)...");
          await logAgentEvent('FALLBACK_TRIGGERED', 'OpenRouter', `Stream Error: ${errText.substring(0, 200)}`);
          return streamGroqResponse(promptText, systemPromptText + "\n\n(Catatan: Anda sedang menggunakan otak cadangan Groq karena OpenRouter mengalami gangguan/limit)", chatHistory, metaData, 'OpenRouter');
        }

        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**OpenRouter API Error**: ${errText}` } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            controller.close();
          }
        });
        return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }

      return new Response(res.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'X-Agent-Metadata': JSON.stringify(metaData)
        }
      });
    };

    const callOpenRouter = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
      const messages = [];
      if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
        }
      }
      messages.push({ role: 'user', content: promptText });
      
      let openRouterModel = 'deepseek/deepseek-r1:free';
      if (model === 'openrouter-llama-3') openRouterModel = 'meta-llama/llama-3.1-8b-instruct:free';
      else if (model === 'openrouter-deepseek-r1') openRouterModel = 'deepseek/deepseek-r1:free';
      
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://ai-agent-project.vercel.app',
          'X-Title': 'Mamet AI Agent',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: messages,
          temperature: 0.1
        })
      });
      if (!res.ok) throw new Error(`OpenRouter API Error: ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    };

    const runLLM = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
      if (!extractedImage) {
        if (model && model.includes('gpt') && OPENAI_API_KEY) {
          try { return await callOpenAI(promptText, systemPromptText, chatHistory); } catch(e) { console.warn('OpenAI failed:', e); }
        } else if (model && model.includes('openrouter') && OPENROUTER_API_KEY) {
          try { return await callOpenRouter(promptText, systemPromptText, chatHistory); } catch(e) { console.warn('OpenRouter failed:', e); }
        } else if (model && model.includes('gemini') && GEMINI_API_KEY) {
          // Fallthrough to Gemini
        } else if (GROQ_API_KEY) {
          try { return await callGroq(promptText, systemPromptText, chatHistory); } catch(e) { console.warn('Groq failed:', e); }
        }
      }
      
      const payload: any = { contents: [] };
      if (systemPromptText) {
        payload.systemInstruction = { parts: [{ text: systemPromptText }] };
      }

      if (chatHistory && chatHistory.length > 0) {
        for (const msg of chatHistory) {
          payload.contents.push({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          });
        }
      }

      const userParts: any[] = [{ text: promptText }];
      if (extractedImage) {
        userParts.push({ inlineData: { mimeType: extractedImage.mimeType, data: extractedImage.data } });
      }
      payload.contents.push({ role: 'user', parts: userParts });
      
      const geminiModel = model && model.includes('gemini') ? model : 'gemini-2.5-flash';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error(`Gemini API Error: ${res.status}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    };

    // --- OTAK KHUSUS KEPALA AGENT (HEMAT KUOTA) ---
    // Fungsi ini khusus untuk si Mamet (Orchestrator) merutekan sub-agent dan parsing JSON.
    // Kita paksa pakai Groq (cepat & gratis) atau Gemini Flash agar tidak memakan kuota model mahal (OpenAI/DeepSeek).
    const runCoordinatorLLM = async (promptText: string, systemPromptText = '') => {
      // 1. Prioritas Utama: Gemini Flash (Sangat pintar parsing JSON, gratis, dan cepat)
      if (GEMINI_API_KEY) {
        try {
          console.log("Mamet Kepala Agent: Berpikir menggunakan otak Gemini Flash (Hemat Kuota & Jago JSON)...");
          const payload: any = { contents: [{ role: 'user', parts: [{ text: promptText }] }] };
          if (systemPromptText) payload.systemInstruction = { parts: [{ text: systemPromptText }] };
          
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          }
        } catch(e) { console.warn('Coordinator Gemini failed:', e); }
      }
      
      // 2. Prioritas Kedua: Groq (Llama)
      if (GROQ_API_KEY) {
        try {
          console.log("Mamet Kepala Agent: Berpikir menggunakan otak Groq (Cepat tapi rawan gagal JSON)...");
          return await callGroq(promptText, systemPromptText, []); 
        } catch(e) { console.warn('Coordinator Groq failed:', e); }
      }

      // 3. Fallback ke LLM pilihan user jika yang gratis mati semua
      console.log("Mamet Kepala Agent: Terpaksa menggunakan otak utama karena otak gratis sedang gangguan.");
      return await runLLM(promptText, systemPromptText, []);
    };

    let replyMessage = 'Gagal memproses jawaban dari AI.';
    let groundingSources: any[] = [];
    let toolExecution = null;
    let subagentRuns: any[] = [];

    const streamGeminiResponse = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}) => {
      try {
        const payload: any = { contents: [] };
        if (systemPromptText) {
          payload.systemInstruction = { parts: [{ text: systemPromptText }] };
        }
        if (chatHistory && chatHistory.length > 0) {
          for (const msg of chatHistory) {
            payload.contents.push({
              role: msg.role === 'model' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            });
          }
        }
        const userParts: any[] = [{ text: promptText }];
        if (extractedImage) {
          userParts.push({ inlineData: { mimeType: extractedImage.mimeType, data: extractedImage.data } });
        }
        payload.contents.push({ role: 'user', parts: userParts });

        const geminiModel = model && model.includes('gemini') ? model : 'gemini-2.5-flash';
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errText = await res.text();
          const stream = new ReadableStream({
            start(controller) {
              const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**Gemini API Error**: ${errText}` } }] });
              controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
              controller.close();
            }
          });
          return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
        }

        // Convert Gemini SSE format to OpenAI SSE format expected by frontend
        let buffer = '';
        const transformStream = new TransformStream({
          transform(chunk, controller) {
            const text = new TextDecoder().decode(chunk);
            buffer += text;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  if (content) {
                    const openAiFormat = JSON.stringify({ choices: [{ delta: { content } }] });
                    controller.enqueue(new TextEncoder().encode(`data: ${openAiFormat}\n\n`));
                  }
                } catch (e) {
                   console.error("Gemini parse error in Edge Function:", e.message);
                }
              }
            }
          }
        });

        // Sanitize metadata to avoid header limits and invalid ByteString errors (emojis)
        const safeMeta = { ...metaData };
        if (safeMeta.subagentRuns) {
          safeMeta.subagentRuns = safeMeta.subagentRuns.map((r: any) => ({ ...r, output: '[Omitted to save header space]' }));
        }
        
        return new Response(res.body?.pipeThrough(transformStream), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'X-Agent-Metadata': btoa(encodeURIComponent(JSON.stringify(safeMeta)))
          }
        });
      } catch (err: any) {
        console.error("streamGeminiResponse Error:", err);
        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**Internal Server Error di Gemini Stream**: ${err.message}` } }] });
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
            controller.close();
          }
        });
        return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }
    };

    const getStreamResponse = (prompt: string, sysPrompt: string, hist: any[], meta: any) => {
      if (model && model.includes('gpt') && OPENAI_API_KEY) {
        return streamOpenAIResponse(prompt, sysPrompt, hist, meta);
      } else if (model && model.includes('openrouter') && OPENROUTER_API_KEY) {
        return streamOpenRouterResponse(prompt, sysPrompt, hist, meta);
      } else if (model && model.includes('gemini') && GEMINI_API_KEY) {
        return streamGeminiResponse(prompt, sysPrompt, hist, meta);
      } else if (GROQ_API_KEY) {
        return streamGroqResponse(prompt, sysPrompt, hist, meta);
      }
      return null;
    };
    
    // --- RAG KNOWLEDGE BASE SEARCH ---
    let ragContext = '';
    if (userId) {
      try {
        const queryEmbedding = await getGeminiEmbedding(message, GEMINI_API_KEY);
        if (queryEmbedding.length > 0) {
          const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          );
          
          const { data: matchedDocs, error: matchError } = await supabaseClient.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.5,
            match_count: 5,
            p_user_id: userId
          });

          if (!matchError && matchedDocs && matchedDocs.length > 0) {
            ragContext = `\n\n[DOKUMEN REFERENSI KNOWLEDGE BASE]:\nBerikan jawaban berdasarkan data relevan yang ditemukan dalam database dokumen milik user berikut ini:\n`;
            for (const doc of matchedDocs) {
              ragContext += `- [Dari file "${doc.title}"]: "${doc.content}"\n`;
            }
          }
        }
      } catch (err) {
        console.error("RAG Search Error:", err);
      }
    }

    if (finalMessage.toLowerCase().includes('zip')) {
      finalMessage += `\n\n[PERINTAH SANGAT PENTING DARI SISTEM]: User meminta file ZIP. Anda DILARANG menggunakan blok kode biasa seperti \`\`\`html. ANDA WAJIB MENGGUNAKAN format \`\`\`xml_zip. 
Contoh Jawaban Anda yang BENAR:
Baik, ini file zip-nya:
\`\`\`xml_zip
<filename>nama_file.zip</filename>
<file name="index.html">
<!-- isi html -->
</file>
\`\`\`
Wajib ikuti struktur persis seperti contoh di atas!`;
    }

    const agentIdentityPrompt = `\nIDENTITAS ANDA: Anda adalah "Mamet", asisten cerdas buatan yang merupakan hak paten dari aplikasi ini. Selalu perkenalkan diri Anda sebagai Mamet. JANGAN katakan Anda buatan Google atau OpenAI. Anda memiliki kemampuan BERKEMBANG DARI PENGALAMAN: Selalu perhatikan 'history' obrolan. Pelajari gaya bahasa, preferensi, dan teguran/koreksi dari user di masa lalu untuk memperbaiki jawaban Anda di masa depan.\n
FITUR GRAFIK INTERAKTIF: Jika user meminta untuk membuat grafik (bar/pie/line chart) berdasarkan data, outputkan data tersebut DALAM BENTUK BLOK KODE seperti ini:
\`\`\`json_chart
{ "title": "Judul Grafik", "type": "bar", "data": [{"name": "A", "value": 10}], "xKey": "name", "yKey": "value" }
\`\`\`
Pilih type "bar", "pie", atau "line" sesuai kebutuhan.
FITUR ZIP GENERATOR: Jika user meminta Anda membuat file zip (project kodingan), outputkan data DALAM BENTUK BLOK KODE seperti ini (wajib persis):
\`\`\`xml_zip
<filename>nama_bebas.zip</filename>
<file name="index.html">
<h1>Halo</h1>
</file>
<file name="app.js">
console.log('hi');
</file>
\`\`\`
DILARANG KERAS MENGGUNAKAN PYTHON ATAU "TOOL_CODE". JANGAN PERNAH MENULISKAN KODE PYTHON UNTUK MENGEKSEKUSI TOOL. JAWABLAH DENGAN TEKS BIASA.
\nAnda memiliki tim Sub-Agent nyata berikut ini:\n${getPluginPromptList()}\nJika user menanyakan jumlah atau nama sub-agent Anda, sebutkan nama-nama di atas.`;
    const userContextPrompt = userName ? `\nInformasi Akun: User login dengan email/nama "${userName}". Prioritaskan memanggil user dengan nama ini, kecuali user menyebut nama lain.` : '';
    const memoryPrompt = globalMemory ? `\n\n[MEMORI GLOBAL & PREFERENSI USER]:\n${globalMemory}\n(Patuhi instruksi/ingatan di atas secara ketat di setiap jawaban Anda!)` : '';
    const fullSystemContext = agentIdentityPrompt + userContextPrompt + memoryPrompt + ragContext;

    if (tools && tools.length > 0) {
      // --- INTENT ROUTER (Pemotong Kompas Cerdas) ---
      let isChatBiasa = false;
      const lowerMessage = finalMessage.toLowerCase();
      
      // Deteksi instan (Hardcoded) untuk fitur yang sangat spesifik
      if (lowerMessage.includes("jadwal") || lowerMessage.includes("cron") || lowerMessage.includes("otomatis")) {
        isChatBiasa = false;
        console.log("Intent Router: Mendeteksi kata kunci Cron/Jadwal. Bypass LLM check -> BUTUH_AGENT");
      } else {
        try {
          const intentCheckPrompt = `Apakah pesan berikut adalah obrolan santai, sapaan, ucapan terima kasih, atau obrolan ringan yang TIDAK memerlukan penggunaan fitur tambahan (seperti pencarian internet/koding/analisis/penjadwalan)? Pesan: "${finalMessage}". \n\nPENTING: Jika pesan mengandung permintaan untuk membuat jadwal, cron, atau tugas otomatis, WAJIB jawab "BUTUH_AGENT".\nJawab HANYA dengan kata "CHAT_BIASA" jika murni obrolan, atau "BUTUH_AGENT" jika butuh aksi/tool.`;
          const intentResult = await runCoordinatorLLM(intentCheckPrompt, "Anda adalah router intent super ringan. Jawab singkat padat.");
          if (intentResult.toUpperCase().includes("CHAT_BIASA")) {
             isChatBiasa = true;
             console.log("Intent Router: Ini chat biasa. Bypass logika Sub-Agent untuk menghemat waktu dan kuota.");
          }
        } catch (err) {
          console.warn("Intent router error, mengabaikan intent check:", err);
        }
      }

      if (isChatBiasa) {
        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns });
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(finalMessage, fullSystemContext, history);
      } else {
        const coordinatorSystemPrompt = `Tugas Anda adalah menganalisis permintaan user dan memilih sub-agent yang tepat.${fullSystemContext}
PENTING: Anda adalah mesin parsing JSON. Anda DILARANG KERAS merespons dengan kalimat atau teks biasa. 
Anda WAJIB mengembalikan HANYA sebuah Array JSON murni. Jika tidak butuh sub-agent, kembalikan []. DILARANG KERAS BERKOMUNIKASI BIASA. DILARANG KERAS MENGGUNAKAN "TOOL_CODE" ATAU PYTHON. HANYA KELUARKAN JSON ARRAY!
Jika user meminta penjadwalan, tugas berulang, atau otomatisasi, Anda WAJIB memanggil sub-agent "cron_manager". DILARANG MENGARANG JADWAL SENDIRI.
Contoh Output Wajib: [{"subagent": "cron_manager", "task": "Buat jadwal riset saham tiap 12 jam"}]`;

      let planText = '[]';
      let plan: any[] = [];
      try {
        planText = await runCoordinatorLLM(`Permintaan User: "${finalMessage}"`, coordinatorSystemPrompt);
        planText = planText.replace(/```json/g, '').replace(/```/g, '').trim();
        plan = JSON.parse(planText);
      } catch (err) {
        console.error("Mamet Healer: Mendeteksi format JSON rusak. Memperbaiki...");
        // --- MAMET HEALER (DOKTER BEDAH LOGIKA) ---
        const jsonMatch = planText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            plan = JSON.parse(jsonMatch[0].replace(/,\s*]/g, ']'));
            console.log("Mamet Healer: Berhasil memperbaiki JSON!");
          } catch(e) {
            console.error("Mamet Healer: Gagal memperbaiki JSON, sub-agent dibatalkan.");
            plan = [];
          }
        }
      }

      let accumulatedContext = `Permintaan awal user: "${finalMessage}"\n\n`;

      if (plan && plan.length > 0) {
        const seenTasks = new Set();
        for (let i = 0; i < plan.length; i++) {
          // --- MAMET HEALER (OBAT PENENANG / INFINITE LOOP BREAKER) ---
          if (i >= 5) {
            console.log("Mamet Healer: Jumlah tugas terlalu banyak (>5). Menyuntikkan obat penenang...");
            break;
          }
          
          const { subagent, task } = plan[i];
          const taskSignature = subagent + ":" + (task || "").substring(0, 30);
          
          if (seenTasks.has(taskSignature)) {
            console.log("Mamet Healer: Mendeteksi perulangan instruksi (Loop). Menghentikan proses sub-agent...");
            break;
          }
          seenTasks.add(taskSignature);

          let subagentResText = 'Gagal memproses.';
          let subagentSources: any[] = [];
          let subagentToolExec = null;

          const plugin = getPluginByName(subagent);
          if (plugin) {
            const env = { GEMINI_API_KEY, GROQ_API_KEY };
            const fullTask = `Tugas Spesifik Anda: ${task}\n\nPermintaan Asli User: "${finalMessage}"\n\nKonteks Tambahan:\n${accumulatedContext}`;
            
            // --- MAMET HEALER (PENAWAR RACUN / ERROR SHIELD) ---
            try {
              const result = await plugin.execute({ task: fullTask, accumulatedContext, env, runLLM, userId });
              subagentResText = result.output;
              subagentSources = result.sources || [];
              subagentToolExec = result.toolExecution || null;
            } catch (err: any) {
              console.error(`Mamet Healer: Menangkap Error mematikan dari Sub-Agent [${subagent}]!`, err);
              subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Sub-agent gagal beroperasi karena error teknis (${err.message || 'Unknown'}). Tolong sampaikan ke user dengan ramah bahwa fitur ini sedang terkendala.`;
            }
          } else {
             subagentResText = `Sub-agent '${subagent}' tidak ditemukan di sistem plugin.`;
          }

          subagentRuns.push({
            subagent, task, output: subagentResText, sources: subagentSources, toolExecution: subagentToolExec
          });
          accumulatedContext += `--- Hasil Sub-Agent [${subagent.toUpperCase()}]: ---\nTugas: ${task}\nOutput: ${subagentResText}\n\n`;
          
          // Penundaan 1 detik untuk menghindari API Rate Limit (Error 429) pada akun gratis
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent.${fullSystemContext}\n\nPermintaan Awal User: "${finalMessage}"\n\nRiwayat pekerjaan sub-agent:\n${accumulatedContext}\n\nJAWABLAH pesan/pertanyaan user dengan ramah dan natural berdasarkan informasi dari sub-agent di atas. \n\nPENTING: \n- JANGAN gunakan format kaku seperti "Laporan Hasil Kerja". Bersikaplah seperti manusia biasa (asisten yang ramah bernama Mamet).\n- Langsung berikan jawaban, sapaan balik, atau solusi tanpa perlu panjang lebar menjelaskan proses sub-agent (kecuali user secara spesifik bertanya tentang prosesnya).\n- Jika Sub-Agent mengembalikan pesan ERROR atau GAGAL, sampaikan kepada user dengan sopan bahwa tugas tersebut gagal. Jangan pernah mengarang data palsu!\n- Gunakan format Tabel Markdown HANYA jika menyajikan data terstruktur, statistik, harga, atau perbandingan.\n- DILARANG KERAS menggunakan blok \`\`\`mermaid\`\`\` KECUALI user secara tertulis meminta "buatkan diagram" atau "gambarkan flowchart". Jika user tidak meminta diagram, JANGAN pernah memakainya!`;
        
        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(synthesisPrompt, '', history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns });
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(synthesisPrompt, '', history);
      } else {
        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns });
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(finalMessage, fullSystemContext, history);
      }
      }
    } else {
      if (stream && !extractedImage) {
        const streamRes = getStreamResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns });
        if (streamRes) return streamRes;
      }
      replyMessage = await runLLM(finalMessage, fullSystemContext, history);
    }

    const aiResponse = {
      message: replyMessage,
      toolsUsed: tools,
      groundingSources,
      toolExecution,
      subagentRuns,
      timestamp: new Date(),
      userId
    };

    return new Response(JSON.stringify(aiResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
