import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import google from 'npm:googlethis';
import * as cheerio from 'npm:cheerio';
import { Buffer } from 'node:buffer';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, tools, model, userId, userName, file, history } = await req.json();

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
          model: 'llama-3.3-70b-versatile',
          messages: messages,
          temperature: 0.1
        })
      });
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
        payload.contents.push({ role: 'user', parts: [{ text: `System Instruction: ${systemPromptText}` }] });
        payload.contents.push({ role: 'model', parts: [{ text: 'Dimengerti.' }] });
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
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    };

    let replyMessage = 'Gagal memproses jawaban dari AI.';
    let groundingSources: any[] = [];
    let toolExecution = null;
    let subagentRuns: any[] = [];
    
    const userContextPrompt = userName ? `\nInformasi Akun: User login dengan identitas/email "${userName}". Namun, jika di dalam chat user memperkenalkan nama aslinya (misalnya "namaku Slamet"), SELALU prioritaskan dan gunakan nama asli yang diberikan user tersebut untuk memanggilnya.` : '';

    if (model === 'coordinator-agent') {
      const coordinatorSystemPrompt = `Anda adalah Kepala Agent (Coordinator). Tugas Anda adalah menganalisis permintaan user berikut dan memecahnya menjadi langkah-langkah tugas untuk sub-agent khusus jika diperlukan.${userContextPrompt}
Sub-agent yang tersedia:
1. "researcher": Menggunakan penelusuran web (web_search) untuk mencari info.
2. "scraper": Mengekstrak teks langsung dari sebuah URL spesifik.
3. "coder": Eksekusi kode JS (code_executor) untuk perhitungan/logika.
4. "communicator": Kirim pesan Slack atau API eksternal.

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

          if (subagent === 'researcher') {
            try {
              const subPayload = {
                contents: [{ role: 'user', parts: [{ text: `Cari informasi web mengenai: ${task}\n\nKonteks:\n${accumulatedContext}` }] }],
                tools: [{ googleSearch: {} }]
              };
              const subRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(subPayload)
              });
              const subData = await subRes.json();
              const candidate = subData.candidates?.[0];
              subagentResText = candidate?.content?.parts?.[0]?.text || '';
              if (candidate?.groundingMetadata?.groundingChunks) {
                subagentSources = candidate.groundingMetadata.groundingChunks
                  .map((chunk: any) => ({ title: chunk.web?.title || 'Sumber Web', uri: chunk.web?.uri }))
                  .filter((s: any) => s.uri);
              }
            } catch (err) {
              subagentResText = `Riset gagal: ${err}`;
            }
          } else if (subagent === 'scraper') {
            try {
              const urlMatch = task.match(/(https?:\/\/[^\s]+)/g) || accumulatedContext.match(/(https?:\/\/[^\s]+)/g);
              const urlToScrape = urlMatch ? urlMatch[0] : null;
              if (urlToScrape) {
                const scrapeRes = await fetch(urlToScrape);
                const html = await scrapeRes.text();
                const $ = cheerio.load(html);
                $('script, style, nav, footer, header').remove();
                const text = $('body').text().replace(/\s+/g, ' ').trim();
                subagentResText = `Isi konten dari ${urlToScrape}:\n\n${text.substring(0, 10000)}`;
                subagentSources = [{ title: $('title').text() || 'Scraped Page', uri: urlToScrape }];
                subagentToolExec = { name: 'web_scraper', args: { url: urlToScrape } };
              } else {
                 subagentResText = "Gagal memproses URL: URL tidak ditemukan.";
              }
            } catch (err) {
              subagentResText = `Scraping gagal: ${err}`;
            }
          } else if (subagent === 'coder') {
            try {
              const coderPrompt = `Anda adalah CODER. Tugas: ${task}\nKembalikan HANYA kode JavaScript murni tanpa penjelasan. Agar tidak terjadi error syntax, gunakan 'console.log()' untuk mencetak hasil akhir, dan JANGAN gunakan return statement di luar function.`;
              let codeOutput = await runLLM(`Konteks:\n${accumulatedContext}\nSelesaikan.`, coderPrompt);
              const match = codeOutput.match(/```(?:javascript|js)([\s\S]*?)```/) || [null, codeOutput];
              const cleanCode = (match[1] || codeOutput).trim();

              let executionResult = '';
              try {
                // Menangkap output console.log
                const logs: string[] = [];
                const fakeConsole = {
                  log: (...args: any[]) => logs.push(args.join(' ')),
                  error: (...args: any[]) => logs.push('ERROR: ' + args.join(' '))
                };
                
                const fn = new Function('console', `
                  try {
                    ${cleanCode}
                  } catch(e) {
                    console.error(e.message);
                  }
                `);
                
                fn(fakeConsole);
                executionResult = logs.length > 0 ? logs.join('\\n') : 'Tidak ada output. Pastikan menggunakan console.log()';
              } catch(e) {
                executionResult = 'Error eksekusi syntax: ' + e;
              }
              subagentResText = `Menjalankan Kode:\n\`\`\`javascript\n${cleanCode}\n\`\`\`\n\nOutput:\n${executionResult}`;
              subagentToolExec = { name: 'execute_javascript', args: { code: cleanCode } };
            } catch (err) {
              subagentResText = `Eksekusi coder gagal: ${err}`;
            }
          } else if (subagent === 'communicator') {
             subagentResText = `[Simulasi Edge Function] Aksi Komunikasi diselesaikan untuk tugas: ${task}`;
          }

          subagentRuns.push({
            subagent, task, output: subagentResText, sources: subagentSources, toolExecution: subagentToolExec
          });
          accumulatedContext += `--- Hasil Sub-Agent [${subagent.toUpperCase()}]: ---\nTugas: ${task}\nOutput: ${subagentResText}\n\n`;
        }

        const synthesisPrompt = `Anda adalah Kepala Agent (Coordinator). Anda telah menugaskan beberapa sub-agent.${userContextPrompt}\n\nPermintaan Awal User: "${finalMessage}"\n\nRiwayat pekerjaan:\n${accumulatedContext}\n\nBuat ringkasan laporan hasil kerja sub-agent untuk user secara ramah, lengkap, dan terstruktur.`;
        replyMessage = await runLLM(synthesisPrompt, '', history);
      } else {
        replyMessage = await runLLM(finalMessage, userContextPrompt, history);
      }
    } else {
      replyMessage = await runLLM(finalMessage, userContextPrompt, history);
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
