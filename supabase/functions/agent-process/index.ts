import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Buffer } from 'node:buffer';
import { getPluginPromptList, getPluginByName } from './plugins/registry.ts';

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

    const GEMINI_API_KEY = byokGemini || getActiveKey('GEMINI_API_KEY', geminiKeyIndex, (idx) => { geminiKeyIndex = idx; });
    const GROQ_API_KEY = byokGroq || getActiveKey('GROQ_API_KEY', groqKeyIndex, (idx) => { groqKeyIndex = idx; });
    const OPENAI_API_KEY = byokOpenAI || getActiveKey('OPENAI_API_KEY', openaiKeyIndex, (idx) => { openaiKeyIndex = idx; });
    const OPENROUTER_API_KEY = byokOpenRouter || getActiveKey('OPENROUTER_API_KEY', openrouterKeyIndex, (idx) => { openrouterKeyIndex = idx; });

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const streamGroqResponse = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], metaData: any = {}) => {
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
        const stream = new ReadableStream({
          start(controller) {
            const data = JSON.stringify({ choices: [{ delta: { content: `\n\n**Groq API Error**: ${errText}` } }] });
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
          return streamGroqResponse(promptText, systemPromptText + "\n\n(Catatan: Anda sedang menggunakan otak cadangan Groq karena OpenAI mengalami gangguan/limit)", chatHistory, metaData);
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

      return new Response(res.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'X-Agent-Metadata': JSON.stringify(metaData)
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
          return streamGroqResponse(promptText, systemPromptText + "\n\n(Catatan: Anda sedang menggunakan otak cadangan Groq karena OpenRouter mengalami gangguan/limit)", chatHistory, metaData);
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
      
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
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

    let replyMessage = 'Gagal memproses jawaban dari AI.';
    let groundingSources: any[] = [];
    let toolExecution = null;
    let subagentRuns: any[] = [];

    const getStreamResponse = (prompt: string, sysPrompt: string, hist: any[], meta: any) => {
      if (model && model.includes('gpt') && OPENAI_API_KEY) {
        return streamOpenAIResponse(prompt, sysPrompt, hist, meta);
      } else if (model && model.includes('openrouter') && OPENROUTER_API_KEY) {
        return streamOpenRouterResponse(prompt, sysPrompt, hist, meta);
      } else if (GROQ_API_KEY) {
        return streamGroqResponse(prompt, sysPrompt, hist, meta);
      }
      return null;
    };
    
    const agentIdentityPrompt = `\nIDENTITAS ANDA: Anda adalah "Mamet", asisten cerdas buatan yang merupakan hak paten dari aplikasi ini. Selalu perkenalkan diri Anda sebagai Mamet. JANGAN katakan Anda buatan Google atau OpenAI. Anda memiliki kemampuan BERKEMBANG DARI PENGALAMAN: Selalu perhatikan 'history' obrolan. Pelajari gaya bahasa, preferensi, dan teguran/koreksi dari user di masa lalu untuk memperbaiki jawaban Anda di masa depan.\n\nAnda memiliki tim Sub-Agent nyata berikut ini:\n${getPluginPromptList()}\nJika user menanyakan jumlah atau nama sub-agent Anda, sebutkan nama-nama di atas.`;
    const userContextPrompt = userName ? `\nInformasi Akun: User login dengan email/nama "${userName}". Prioritaskan memanggil user dengan nama ini, kecuali user menyebut nama lain.` : '';
    const memoryPrompt = globalMemory ? `\n\n[MEMORI GLOBAL & PREFERENSI USER]:\n${globalMemory}\n(Patuhi instruksi/ingatan di atas secara ketat di setiap jawaban Anda!)` : '';
    const fullSystemContext = agentIdentityPrompt + userContextPrompt + memoryPrompt;

    if (tools && tools.length > 0) {
      const coordinatorSystemPrompt = `Tugas Anda adalah menganalisis permintaan user dan memilih sub-agent yang tepat.${fullSystemContext}
PENTING: Anda adalah mesin parsing JSON. Anda DILARANG KERAS merespons dengan kalimat atau teks biasa. 
Anda WAJIB mengembalikan HANYA sebuah Array JSON murni. Jika tidak butuh sub-agent, kembalikan [].
Contoh Output Wajib: [{"subagent": "youtube_analyst", "task": "Ekstrak teks dari link youtube ini"}]`;

      let planText = '[]';
      let plan: any[] = [];
      try {
        planText = await runLLM(`Permintaan User: "${finalMessage}"`, coordinatorSystemPrompt);
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
              const result = await plugin.execute({ task: fullTask, accumulatedContext, env, runLLM });
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
          
          // Penundaan 2 detik untuk menghindari API Rate Limit (Error 429) pada akun gratis
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent.${fullSystemContext}\n\nPermintaan Awal User: "${finalMessage}"\n\nRiwayat pekerjaan sub-agent:\n${accumulatedContext}\n\nJAWABLAH pesan/pertanyaan user dengan ramah dan natural berdasarkan informasi dari sub-agent di atas. \n\nPENTING: \n- JANGAN gunakan format kaku seperti "Laporan Hasil Kerja". Bersikaplah seperti manusia biasa (asisten yang ramah bernama Mamet).\n- Langsung berikan jawaban, sapaan balik, atau solusi tanpa perlu panjang lebar menjelaskan proses sub-agent (kecuali user secara spesifik bertanya tentang prosesnya).\n- Jika Sub-Agent mengembalikan pesan ERROR atau GAGAL, sampaikan kepada user dengan sopan bahwa tugas tersebut gagal. Jangan pernah mengarang data palsu!\n- Gunakan format Tabel Markdown HANYA jika menyajikan data terstruktur, statistik, harga, atau perbandingan.\n- Jika user meminta diagram, flowchart, atau alur kerja, buatlah visualisasinya menggunakan blok \`\`\`mermaid\n(contoh diagram graph TD, sequenceDiagram, dll)\`\`\`.\nJANGAN ragu menggunakan gambar/diagram jika itu mempermudah penjelasan!`;
        
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
