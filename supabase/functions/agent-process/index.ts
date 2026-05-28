import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Buffer } from 'node:buffer';
import { getPluginPromptList, getPluginByName } from './plugins/registry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, tools, model, userId, userName, file, history, globalMemory } = await req.json();

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

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

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

    const runLLM = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
      if (GROQ_API_KEY && !extractedImage) {
        try {
          return await callGroq(promptText, systemPromptText, chatHistory);
        } catch (e) {
          console.warn('Groq failed, falling back to Gemini...', e);
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
    
    const agentIdentityPrompt = `\nIDENTITAS ANDA: Anda adalah "Mamet", asisten cerdas buatan yang merupakan hak paten dari aplikasi ini. Selalu perkenalkan diri Anda sebagai Mamet. JANGAN katakan Anda buatan Google atau OpenAI. Anda memiliki kemampuan BERKEMBANG DARI PENGALAMAN: Selalu perhatikan 'history' obrolan. Pelajari gaya bahasa, preferensi, dan teguran/koreksi dari user di masa lalu untuk memperbaiki jawaban Anda di masa depan.\n\nAnda memiliki tim Sub-Agent nyata berikut ini:\n${getPluginPromptList()}\nJika user menanyakan jumlah atau nama sub-agent Anda, sebutkan nama-nama di atas.`;
    const userContextPrompt = userName ? `\nInformasi Akun: User login dengan email/nama "${userName}". Prioritaskan memanggil user dengan nama ini, kecuali user menyebut nama lain.` : '';
    const memoryPrompt = globalMemory ? `\n\n[MEMORI GLOBAL & PREFERENSI USER]:\n${globalMemory}\n(Patuhi instruksi/ingatan di atas secara ketat di setiap jawaban Anda!)` : '';
    const fullSystemContext = agentIdentityPrompt + userContextPrompt + memoryPrompt;

    if (tools && tools.length > 0) {
      const coordinatorSystemPrompt = `Tugas Anda adalah menganalisis permintaan user berikut dan memecahnya menjadi langkah-langkah tugas untuk sub-agent khusus jika diperlukan.${fullSystemContext}
Anda memiliki kemampuan Multi-Modal. Jika user meminta data perbandingan, harga, atau jadwal, SELALU gunakan Markdown Tables. Jika user meminta diagram alur, flowchart, atau arsitektur, SELALU gunakan blok kode \`\`\`mermaid.

Kembalikan HANYA JSON array: [{ "subagent": "researcher", "task": "..." }]`;

      let planText = '[]';
      try {
        planText = await runLLM(`Permintaan User: "${finalMessage}"`, coordinatorSystemPrompt);
        planText = planText.replace(/```json/g, '').replace(/```/g, '').trim();
      } catch (err) {}

      let plan: any[] = [];
      try { plan = JSON.parse(planText); } catch (e) {}

      let accumulatedContext = `Permintaan awal user: "${finalMessage}"\n\n`;

      if (plan && plan.length > 0) {
        for (let i = 0; i < plan.length; i++) {
          const { subagent, task } = plan[i];
          let subagentResText = 'Gagal memproses.';
          let subagentSources: any[] = [];
          let subagentToolExec = null;

          const plugin = getPluginByName(subagent);
          if (plugin) {
            const env = { GEMINI_API_KEY, GROQ_API_KEY };
            const result = await plugin.execute({ task, accumulatedContext, env, runLLM });
            subagentResText = result.output;
            subagentSources = result.sources || [];
            subagentToolExec = result.toolExecution || null;
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

        const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent.${fullSystemContext}\n\nPermintaan Awal User: "${finalMessage}"\n\nRiwayat pekerjaan:\n${accumulatedContext}\n\nBuat ringkasan laporan hasil kerja sub-agent untuk user secara ramah, lengkap, dan terstruktur. \n\nPENTING: \n- Gunakan format Tabel Markdown jika menyajikan data, harga, atau perbandingan.\n- Jika user meminta diagram, flowchart, atau alur kerja, buatlah visualisasinya menggunakan blok \`\`\`mermaid\n(contoh diagram graph TD, sequenceDiagram, dll)\`\`\`.\nJANGAN ragu menggunakan gambar/diagram jika itu mempermudah penjelasan!`;
        
        if (req.stream && GROQ_API_KEY && !extractedImage) {
          return streamGroqResponse(synthesisPrompt, '', history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns });
        }
        replyMessage = await runLLM(synthesisPrompt, '', history);
      } else {
        if (req.stream && GROQ_API_KEY && !extractedImage) return streamGroqResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns });
        replyMessage = await runLLM(finalMessage, fullSystemContext, history);
      }
    } else {
      if (req.stream && GROQ_API_KEY && !extractedImage) return streamGroqResponse(finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns });
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
