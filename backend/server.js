const express = require('express');
const cors = require('cors');
const axios = require('axios');
const google = require('googlethis');
const cheerio = require('cheerio');
const PDFParser = require('pdf2json');
const mammoth = require('mammoth');
const {
  resolveTraceId,
  emitTelemetryEvent,
  persistAiSystemLog,
  persistVerificationLog
} = require('./telemetry');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

/**
 * /api/chat — Endpoint utama yang digunakan oleh AIAgent UI.
 * Menerima provider, model, dan apiKey langsung dari frontend (dari Settings/VaultService).
 * Ini memungkinkan pengguna menggunakan API key mereka sendiri tanpa perlu edit .env.
 * 
 * FIX: Sebelumnya AIAgent hanya melakukan simulasi, bukan memanggil backend nyata.
 * Sekarang koneksi AI berjalan end-to-end.
 */
app.post('/api/chat', async (req, res) => {
  const requestStartedAt = Date.now();
  const traceId = resolveTraceId({
    headers: req.headers,
    body: req.body
  });

  await emitTelemetryEvent({
    eventType: 'Pipeline.Start',
    traceId,
    provider: req.body?.provider || null,
    message: '/api/chat request started',
    metadata: {
      endpoint: '/api/chat',
      user_id: req.body?.userId || req.body?.user_id || null
    }
  });

  try {
    const { message, provider, model, apiKey, history = [], userId, userName, globalMemory } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Parameter "message" wajib diisi.' });
    }
    if (!provider || !model) {
      return res.status(400).json({ error: 'Parameter "provider" dan "model" wajib diisi.' });
    }

    // Gunakan apiKey dari request body (dari VaultService frontend), fallback ke ENV
    const resolvedKey = apiKey || (
      provider === 'openrouter' ? process.env.OPENROUTER_API_KEY :
      provider === 'openai'     ? process.env.OPENAI_API_KEY :
      provider === 'groq'       ? process.env.GROQ_API_KEY :
      provider === 'anthropic'  ? process.env.ANTHROPIC_API_KEY :
      provider === 'gemini'     ? process.env.GEMINI_API_KEY : null
    );

    console.log(`[/api/chat] provider=${provider}, model=${model}, userId=${userId}, traceId=${traceId}, key=${resolvedKey ? '***set***' : 'MISSING'}`);

    await emitTelemetryEvent({
      eventType: 'Provider.Request',
      traceId,
      provider: provider || null,
      message: 'Provider request started',
      metadata: {
        model,
        user_id: userId || null,
        status: 'start'
      }
    });

    const agentIdentity = `Anda adalah "Mamet", asisten cerdas Mamet Ecosystem. Jangan katakan Anda buatan Google atau OpenAI. Selalu perkenalkan diri sebagai Mamet.`;
    const userContext = userName ? `\nUser: ${userName}` : '';
    const memoryContext = globalMemory ? `\n\n[MEMORI]:\n${globalMemory}` : '';
    const systemPrompt = agentIdentity + userContext + memoryContext;

    // Bangun history messages (format OpenAI-compatible)
    const buildMessages = (sys, hist) => {
      const msgs = [{ role: 'system', content: sys }];
      if (hist && hist.length > 0) {
        for (const h of hist) {
          msgs.push({ role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user', content: h.content });
        }
      }
      msgs.push({ role: 'user', content: message });
      return msgs;
    };

    let replyText = '';

    // ── OPENROUTER ──────────────────────────────────────────────────────────
    if (provider === 'openrouter') {
      if (!resolvedKey) {
        return res.status(400).json({ error: 'OpenRouter API Key tidak ditemukan. Silakan masukkan API Key di Settings → API Key.' });
      }
      const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: model,
        messages: buildMessages(systemPrompt, history)
      }, {
        headers: {
          'Authorization': `Bearer ${resolvedKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mamet-os.app',
          'X-Title': 'Mamet OS'
        }
      });
      replyText = resp.data.choices?.[0]?.message?.content || 'Tidak ada respons dari model.';

    // ── OPENAI ───────────────────────────────────────────────────────────────
    } else if (provider === 'openai') {
      if (!resolvedKey) {
        return res.status(400).json({ error: 'OpenAI API Key tidak ditemukan. Silakan masukkan API Key di Settings.' });
      }
      const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: model,
        messages: buildMessages(systemPrompt, history)
      }, {
        headers: {
          'Authorization': `Bearer ${resolvedKey}`,
          'Content-Type': 'application/json'
        }
      });
      replyText = resp.data.choices?.[0]?.message?.content || 'Tidak ada respons dari model.';

    // ── GROQ ─────────────────────────────────────────────────────────────────
    } else if (provider === 'groq') {
      if (!resolvedKey) {
        return res.status(400).json({ error: 'Groq API Key tidak ditemukan. Silakan masukkan API Key di Settings.' });
      }
      const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: model,
        messages: buildMessages(systemPrompt, history)
      }, {
        headers: {
          'Authorization': `Bearer ${resolvedKey}`,
          'Content-Type': 'application/json'
        }
      });
      replyText = resp.data.choices?.[0]?.message?.content || 'Tidak ada respons dari model.';

    // ── ANTHROPIC ────────────────────────────────────────────────────────────
    } else if (provider === 'anthropic') {
      if (!resolvedKey) {
        return res.status(400).json({ error: 'Anthropic API Key tidak ditemukan. Silakan masukkan API Key di Settings.' });
      }
      const anthropicMessages = [];
      if (history && history.length > 0) {
        for (const h of history) {
          anthropicMessages.push({ role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user', content: h.content });
        }
      }
      anthropicMessages.push({ role: 'user', content: message });
      const resp = await axios.post('https://api.anthropic.com/v1/messages', {
        model: model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages
      }, {
        headers: {
          'x-api-key': resolvedKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });
      replyText = resp.data.content?.[0]?.text || 'Tidak ada respons dari model.';

    // ── GEMINI ───────────────────────────────────────────────────────────────
    } else if (provider === 'gemini') {
      if (!resolvedKey) {
        return res.status(400).json({ error: 'Gemini API Key tidak ditemukan. Silakan masukkan API Key di Settings.' });
      }
      const geminiModel = model || 'gemini-2.5-flash';
      const contents = [];
      if (history && history.length > 0) {
        for (const h of history) {
          contents.push({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.content }] });
        }
      }
      contents.push({ role: 'user', parts: [{ text: message }] });
      const resp = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${resolvedKey}`,
        { systemInstruction: { parts: [{ text: systemPrompt }] }, contents },
        { headers: { 'Content-Type': 'application/json' } }
      );
      replyText = resp.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Tidak ada respons dari model.';

    } else {
      return res.status(400).json({ error: `Provider "${provider}" tidak didukung. Pilih: openrouter, openai, groq, anthropic, atau gemini.` });
    }

    const latencyMs = Date.now() - requestStartedAt;

    await emitTelemetryEvent({
      eventType: 'Provider.Response',
      traceId,
      provider: provider || null,
      message: 'Provider response completed',
      metadata: {
        model,
        user_id: userId || null,
        latency_ms: latencyMs,
        status: 'success'
      }
    });

    await persistAiSystemLog({
      traceId,
      provider: provider || null,
      model: model || null,
      latencyMs,
      status: 'success',
      errorFlag: false,
      llmCallCount: 1,
      metadata: {
        endpoint: '/api/chat',
        user_id: userId || null
      }
    });

    await emitTelemetryEvent({
      eventType: 'Pipeline.Completed',
      traceId,
      provider: provider || null,
      message: '/api/chat request completed',
      metadata: {
        endpoint: '/api/chat',
        user_id: userId || null,
        latency_ms: latencyMs,
        status: 'success'
      }
    });

    return res.json({ message: replyText, timestamp: new Date(), userId, trace_id: traceId });

  } catch (error) {
    const errData = error.response?.data;
    const errMsg = errData?.error?.message || errData?.message || error.message;
    const latencyMs = Date.now() - requestStartedAt;

    console.error('[/api/chat] Error:', errMsg, errData);

    await emitTelemetryEvent({
      eventType: 'Provider.Error',
      traceId,
      provider: req.body?.provider || null,
      message: 'Provider request failed',
      metadata: {
        model: req.body?.model || null,
        user_id: req.body?.userId || null,
        latency_ms: latencyMs,
        status: 'failed',
        error: errMsg
      }
    });

    await persistAiSystemLog({
      traceId,
      provider: req.body?.provider || null,
      model: req.body?.model || null,
      latencyMs,
      status: 'failed',
      errorFlag: true,
      llmCallCount: 1,
      metadata: {
        endpoint: '/api/chat',
        user_id: req.body?.userId || null,
        error: errMsg
      }
    });

    await emitTelemetryEvent({
      eventType: 'Pipeline.Failed',
      traceId,
      provider: req.body?.provider || null,
      message: '/api/chat request failed',
      metadata: {
        endpoint: '/api/chat',
        user_id: req.body?.userId || null,
        latency_ms: latencyMs,
        status: 'failed',
        error: errMsg
      }
    });

    return res.status(500).json({
      error: `Koneksi ke AI gagal: ${errMsg}`,
      details: errData,
      trace_id: traceId
    });
  }
});


app.post('/api/agent/process', async (req, res) => {
  const requestStartedAt = Date.now();
  const traceId = resolveTraceId({
    headers: req.headers,
    body: req.body
  });

  await emitTelemetryEvent({
    eventType: 'Pipeline.Start',
    traceId,
    provider: 'agent-process',
    message: '/api/agent/process request started',
    metadata: {
      endpoint: '/api/agent/process',
      user_id: req.body?.userId || req.body?.user_id || null
    }
  });

  try {
    const { message, tools, model, userId, userName, history, file, globalMemory } = req.body;
    
    let finalMessage = message || '';
    let extractedImage = null;

    if (file && file.data) {
      try {
        const filename = file.name.toLowerCase();
        const buffer = Buffer.from(file.data, 'base64');
        
        if (file.mimeType.startsWith('image/')) {
          extractedImage = { mimeType: file.mimeType, data: file.data };
        } else if (filename.endsWith('.pdf')) {
          const pdfText = await new Promise((resolve, reject) => {
            const pdfParser = new PDFParser(this, 1);
            pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
            pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
            pdfParser.parseBuffer(buffer);
          });
          message = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\nIsi Dokumen:\n${pdfText.substring(0, 50000)}`;
        } else if (filename.endsWith('.docx')) {
          const result = await mammoth.extractRawText({ buffer: buffer });
          message = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\nIsi Dokumen:\n${result.value.substring(0, 50000)}`;
        } else if (filename.endsWith('.txt') || filename.endsWith('.csv') || filename.endsWith('.md')) {
          message = `Permintaan User: ${message}\n\n[DOKUMEN TERLAMPIR: ${file.name}]\nIsi Dokumen:\n${buffer.toString('utf-8').substring(0, 50000)}`;
        }
      } catch (err) {
        console.error('File extraction error:', err);
        return res.status(500).json({ error: 'Gagal mengekstrak teks dari file: ' + err.message });
      }
    }

    // Validate input
    if (!message || !Array.isArray(tools)) {
      return res.status(400).json({ 
        error: 'Invalid request. Need message and tools array.' 
      });
    }

    // Log request
    console.log(`[${new Date().toISOString()}] Processing message from user: ${userId}, traceId=${traceId}`);
    console.log(`Tools requested: ${tools.join(', ')}`);

    await emitTelemetryEvent({
      eventType: 'Provider.Request',
      traceId,
      provider: model || 'gemini-2.5-flash',
      message: 'Agent processing provider request started',
      metadata: {
        model,
        user_id: userId || null,
        status: 'start',
        endpoint: '/api/agent/process'
      }
    });

    // Check if Gemini API key exists
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuration error: GEMINI_API_KEY is not set in backend/.env'
      });
    }

    // Prepare Gemini request payload
    const geminiPayload = {
      contents: [
        {
          parts: [
            {
              text: message
            }
          ]
        }
      ]
    };

    if (extractedImage) {
      geminiPayload.contents[0].parts.push({
        inlineData: {
          mimeType: extractedImage.mimeType,
          data: extractedImage.data
        }
      });
    }

    const geminiTools = [];

    // If web_search is enabled, add google_search
    if (tools.includes('web_search')) {
      geminiTools.push({ google_search: {} });
    }

    // Add function declarations for other active tools
    const functionDeclarations = [];

    if (tools.includes('code_executor')) {
      functionDeclarations.push({
        name: 'execute_javascript',
        description: 'Execute JavaScript/Node.js code safely to perform mathematical calculations, data formatting, string manipulation, or array processing.',
        parameters: {
          type: 'OBJECT',
          properties: {
            code: {
              type: 'STRING',
              description: 'The JavaScript code to execute. It must return a value or log output using return statement or console.log.'
            }
          },
          required: ['code']
        }
      });
    }

    if (tools.includes('api_caller')) {
      functionDeclarations.push({
        name: 'make_api_call',
        description: 'Make an HTTP REST API request (GET, POST, etc.) to a given URL with optional headers and request body.',
        parameters: {
          type: 'OBJECT',
          properties: {
            url: {
              type: 'STRING',
              description: 'The URL of the API to call.'
            },
            method: {
              type: 'STRING',
              enum: ['GET', 'POST', 'PUT', 'DELETE'],
              description: 'The HTTP method to use.'
            },
            headers: {
              type: 'OBJECT',
              description: 'Optional HTTP headers to send as key-value pairs.'
            },
            body: {
              type: 'STRING',
              description: 'Optional request body string (JSON formatted).'
            }
          },
          required: ['url', 'method']
        }
      });
    }

    if (tools.includes('slack_integration')) {
      functionDeclarations.push({
        name: 'post_to_slack',
        description: 'Post a message to a Slack channel via Webhook.',
        parameters: {
          type: 'OBJECT',
          properties: {
            message: {
              type: 'STRING',
              description: 'The message text to send to Slack.'
            }
          },
          required: ['message']
        }
      });
    }

    if (functionDeclarations.length > 0) {
      geminiTools.push({ functionDeclarations });
    }

    if (geminiTools.length > 0) {
      geminiPayload.tools = geminiTools;
    }

    let replyMessage = 'Gagal memproses jawaban dari AI.';
    let groundingSources = [];
    let toolExecution = null;
    
    const agentIdentityPrompt = `\nIDENTITAS ANDA: Anda adalah "Mamet", asisten cerdas buatan yang merupakan hak paten dari aplikasi ini. Selalu perkenalkan diri Anda sebagai Mamet. JANGAN katakan Anda buatan Google atau OpenAI. Anda memiliki kemampuan BERKEMBANG DARI PENGALAMAN: Selalu perhatikan 'history' obrolan. Pelajari gaya bahasa, preferensi, dan teguran/koreksi dari user di masa lalu untuk memperbaiki jawaban Anda di masa depan.\n\nAnda memiliki tim Sub-Agent nyata berikut ini:\n1. "researcher": Sub-Agent Riset Internet\n2. "scraper": Sub-Agent Web Scraper (URL)\n3. "coder": Sub-Agent Penulis & Eksekutor Kode\n4. "communicator": Sub-Agent Integrasi API\n5. "logika": Sub-agent untuk menganalisis dan memproses informasi yang kompleks\n6. "bahasa": Sub-agent untuk memahami nuansa bahasa dan konteks\nJika user menanyakan jumlah atau nama sub-agent Anda, sebutkan nama-nama di atas.`;
    const userContextPrompt = userName ? `\nInformasi Akun: User login dengan email/nama "${userName}". Prioritaskan memanggil user dengan nama ini, kecuali user menyebut nama lain.` : '';
    const memoryPrompt = globalMemory ? `\n\n[MEMORI GLOBAL & PREFERENSI USER]:\n${globalMemory}\n(Patuhi instruksi/ingatan di atas secara ketat di setiap jawaban Anda!)` : '';
    const fullSystemContext = agentIdentityPrompt + userContextPrompt + memoryPrompt;

    if (model === 'coordinator-agent') {
      console.log('Running Coordinator Agent Orchestrator...');
      
      // Helper function to call Groq Llama 3.3
      const callGroq = async (promptText, systemPromptText = '', chatHistory = []) => {
        const messages = [];
        if (systemPromptText) {
          messages.push({ role: 'system', content: systemPromptText });
        }
        
        if (chatHistory && chatHistory.length > 0) {
          for (const msg of chatHistory) {
            messages.push({
              role: msg.role === 'model' ? 'assistant' : 'user',
              content: msg.content
            });
          }
        }
        
        messages.push({ role: 'user', content: promptText });
        
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: 'llama-3.3-70b-versatile',
          messages: messages,
          temperature: 0.1
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        return response.data.choices?.[0]?.message?.content || '';
      };

      // General function executor to choose Groq or Gemini fallback
      const runLLM = async (promptText, systemPromptText = '', chatHistory = []) => {
        if (process.env.GROQ_API_KEY && !extractedImage) {
          try {
            console.log('Running on Groq (Llama 3.3 70B)...');
            return await callGroq(promptText, systemPromptText, chatHistory);
          } catch (e) {
            console.warn('Groq failed, falling back to Gemini...', e.message);
          }
        }
        
        // Fallback to Gemini 2.5 Flash
        console.log('Running on Gemini 2.5 Flash...');
        const payload = {
          contents: []
        };
        
        payload.systemInstruction = { parts: [{ text: fullSystemContext + '\n' + systemPromptText }] };
        
        if (chatHistory && chatHistory.length > 0) {
          for (const msg of chatHistory) {
            payload.contents.push({
              role: msg.role === 'model' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            });
          }
        }

        const userParts = [{ text: promptText }];
        if (extractedImage) {
          userParts.push({
            inlineData: {
              mimeType: extractedImage.mimeType,
              data: extractedImage.data
            }
          });
        }
        payload.contents.push({ role: 'user', parts: userParts });
        
        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, payload, {
          headers: { 'content-type': 'application/json' }
        });
        return response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      };

      const coordinatorSystemPrompt = `Nama Anda adalah "Mamet". Anda adalah Kepala Agent (Coordinator). Tugas Anda adalah menganalisis permintaan user berikut dan memecahnya menjadi langkah-langkah tugas untuk sub-agent khusus jika diperlukan.${userContextPrompt}
Anda memiliki kemampuan Multi-Modal. Jika user meminta data perbandingan, harga, atau jadwal, SELALU gunakan Markdown Tables. Jika user meminta diagram alur, flowchart, atau arsitektur, SELALU gunakan blok kode \`\`\`mermaid.
              
Sub-agent yang tersedia:
1. "researcher": Menggunakan penelusuran web (web_search) untuk mencari info aktual, berita terkini, atau referensi online.
2. "scraper": Mengekstrak dan membaca teks langsung dari sebuah URL spesifik jika user memberikan link (http/https).
3. "coder": Menggunakan eksekusi kode JS (code_executor) untuk melakukan perhitungan matematika, manipulasi teks/array, atau pemrosesan logika data.
4. "communicator": Menggunakan kirim pesan Slack (post_to_slack) atau pemanggilan API eksternal (api_caller) untuk mengirimkan notifikasi atau integrasi data.

Jika permintaan membutuhkan eksekusi salah satu atau beberapa sub-agent di atas secara berurutan, Anda WAJIB merespon HANYA dengan JSON array dengan format berikut:
[
  { "subagent": "researcher", "task": "deskripsi tugas spesifik untuk sub-agent mencari informasi X" },
  { "subagent": "coder", "task": "deskripsi tugas spesifik untuk melakukan perhitungan Y menggunakan data dari langkah sebelumnya" },
  { "subagent": "communicator", "task": "deskripsi tugas spesifik untuk mengirimkan hasil akhir Z ke Slack" }
]

Jika permintaan user hanyalah obrolan biasa, pertanyaan umum, atau tidak memerlukan sub-agent sama sekali (misal hanya menyapa atau tanya hal teoritis sederhana), kembalikan array kosong saja: [].

PENTING: Jangan berikan teks penjelasan lain, jangan gunakan markdown code block (\`\`\`json), berikan HANYA JSON array murni.`;

      let planText = '[]';
      const plannerStartedAt = Date.now();

      await emitTelemetryEvent({
        eventType: 'Planner.Start',
        traceId,
        provider: provider || 'coordinator-agent',
        message: 'Planner started',
        metadata: {
          model,
          status: 'start',
          user_id: userId || null
        }
      });

      try {
        planText = await runLLM(`Permintaan User: "${message}"`, coordinatorSystemPrompt);
        planText = planText.replace(/```json/g, '').replace(/```/g, '').trim();

        await emitTelemetryEvent({
          eventType: 'Planner.End',
          traceId,
          provider: provider || 'coordinator-agent',
          message: 'Planner completed',
          metadata: {
            model,
            status: 'success',
            user_id: userId || null,
            latency_ms: Date.now() - plannerStartedAt
          }
        });
      } catch (err) {
        console.error('Planner LLM call failed:', err.message);

        await emitTelemetryEvent({
          eventType: 'Planner.Failed',
          traceId,
          provider: provider || 'coordinator-agent',
          message: 'Planner failed',
          metadata: {
            model,
            status: 'failed',
            user_id: userId || null,
            latency_ms: Date.now() - plannerStartedAt,
            error: err.message
          }
        });
      }

      let plan = [];
      try {
        plan = JSON.parse(planText);
      } catch (e) {
        console.error('Failed to parse coordinator plan:', planText, e);
        plan = [];

        await persistVerificationLog({
          traceId,
          decision: 'FAIL',
          status: 'FAIL',
          failures: ['Planner output is not valid JSON array'],
          metadata: {
            model,
            provider: provider || 'coordinator-agent',
            stage: 'planner_parse'
          }
        });

        await emitTelemetryEvent({
          eventType: 'Verification.Fail',
          traceId,
          provider: provider || 'coordinator-agent',
          message: 'Planner output failed verification',
          metadata: {
            status: 'failed',
            stage: 'planner_parse'
          }
        });
      }

      let subagentRuns = [];
      let accumulatedContext = `Permintaan awal user: "${message}"\n\n`;

      if (plan && plan.length > 0) {
        for (let i = 0; i < plan.length; i++) {
          const step = plan[i];
          const { subagent, task } = step;
          console.log(`Executing subagent: ${subagent} for task: ${task}`);

          let subagentResText = 'Gagal memproses.';
          let subagentSources = [];
          let subagentToolExec = null;

          if (subagent === 'researcher') {
            const ragStartedAt = Date.now();
            await emitTelemetryEvent({
              eventType: 'RAG.Start',
              traceId,
              provider: model || 'coordinator-agent',
              message: 'RAG step started (researcher)',
              metadata: { subagent, task, status: 'start' }
            });

            try {
              const subagentPayload = {
                contents: [{ role: 'user', parts: [{ text: `Cari informasi web mengenai: ${task}\n\nKonteks:\n${accumulatedContext}` }] }],
                tools: [{ googleSearch: {} }]
              };
              
              await emitTelemetryEvent({
                eventType: 'RAG.Retrieval.Start',
                traceId,
                provider: 'gemini-2.5-flash',
                message: 'RAG retrieval started',
                metadata: {
                  subagent,
                  status: 'running'
                }
              });

              let geminiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, subagentPayload, {
                headers: { 'content-type': 'application/json' }
              });
              await emitTelemetryEvent({
                eventType: 'RAG.Retrieval.End',
                traceId,
                provider: 'gemini-2.5-flash',
                message: 'RAG retrieval completed',
                metadata: {
                  subagent,
                  status: 'success',
                  latency_ms: Date.now() - ragStartedAt
                }
              });

              let candidate = geminiRes.data.candidates?.[0];
              subagentResText = candidate?.content?.parts?.[0]?.text || '';
              if (candidate?.groundingMetadata?.groundingChunks) {
                subagentSources = candidate.groundingMetadata.groundingChunks
                  .map(chunk => ({ title: chunk.web?.title || 'Sumber Web', uri: chunk.web?.uri }))
                  .filter(s => s.uri);
              }
            } catch (err) {
              console.warn('Gemini researcher failed, falling back to googlethis + Llama 3.3...', err.message);
              try {
                const searchResults = await google.search(task, {
                  page: 0, 
                  safe: false,
                  parse_ads: false,
                  additional_params: { hl: 'id' }
                });
                
                let searchContext = '';
                let sources = [];
                if (searchResults.results && searchResults.results.length > 0) {
                  const topResults = searchResults.results.slice(0, 5);
                  searchContext = topResults.map((r, idx) => `[${idx+1}] ${r.title}\n${r.description}`).join('\n\n');
                  sources = topResults.map(r => ({ title: r.title, uri: r.url }));
                } else if (searchResults.knowledge_panel && searchResults.knowledge_panel.title) {
                  searchContext = `Knowledge Panel:\nTitle: ${searchResults.knowledge_panel.title}\nDescription: ${searchResults.knowledge_panel.description}`;
                  sources = [{ title: searchResults.knowledge_panel.title, uri: searchResults.knowledge_panel.url }];
                } else {
                  searchContext = "Tidak ditemukan hasil spesifik di web.";
                }

                subagentResText = await runLLM(
                  `Anda adalah Sub-Agent RESEARCHER. Jawab tugas berikut secara detail berdasarkan kutipan pencarian web terbaru ini:\n\nTugas: ${task}\n\nHasil Pencarian Web:\n${searchContext}`,
                  'Anda adalah Sub-Agent RESEARCHER. Rangkum info web secara akurat dan informatif.'
                );
                subagentSources = sources.length > 0 ? sources : [{ title: 'Internal Knowledge (Llama)', uri: '#' }];
              } catch (fallbackErr) {
                subagentResText = `Riset gagal: ${fallbackErr.message}`;
                await emitTelemetryEvent({
                  eventType: 'RAG.Error',
                  traceId,
                  provider: model || 'coordinator-agent',
                  message: 'RAG fallback failed',
                  metadata: {
                    subagent,
                    status: 'failed',
                    latency_ms: Date.now() - ragStartedAt,
                    error: fallbackErr.message
                  }
                });
              }

              if (!subagentSources || subagentSources.length === 0) {
                await emitTelemetryEvent({
                  eventType: 'RAG.NoResult',
                  traceId,
                  provider: model || 'coordinator-agent',
                  message: 'RAG returned no result',
                  metadata: {
                    subagent,
                    status: 'unknown',
                    latency_ms: Date.now() - ragStartedAt
                  }
                });
              }
            }

          } else if (subagent === 'scraper') {
            await emitTelemetryEvent({
              eventType: 'Tool.Requested',
              traceId,
              provider: model || 'coordinator-agent',
              message: 'Tool requested: web_scraper',
              metadata: {
                tool_name: 'web_scraper',
                subagent,
                status: 'pending'
              }
            });

            try {
              let urlToScrape = task.match(/(https?:\/\/[^\s]+)/g)?.[0];
              if (!urlToScrape && accumulatedContext.match(/(https?:\/\/[^\s]+)/g)) {
                urlToScrape = accumulatedContext.match(/(https?:\/\/[^\s]+)/g)[0];
              }
              if (urlToScrape) {
                await emitTelemetryEvent({
                  eventType: 'Tool.Invoked',
                  traceId,
                  provider: model || 'coordinator-agent',
                  message: 'Tool invoked: web_scraper',
                  metadata: { tool_name: 'web_scraper', subagent, status: 'running' }
                });

                const scrapeRes = await axios.get(urlToScrape, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                  }
                });
                const $ = cheerio.load(scrapeRes.data);
                $('script, style, nav, footer, header').remove();
                const text = $('body').text().replace(/\s+/g, ' ').trim();
                subagentResText = `Isi konten dari ${urlToScrape}:\n\n${text.substring(0, 15000)}`;
                subagentSources = [{ title: $('title').text() || 'Scraped Page', uri: urlToScrape }];
                subagentToolExec = { name: 'web_scraper', args: { url: urlToScrape } };

                await emitTelemetryEvent({
                  eventType: 'Tool.Completed',
                  traceId,
                  provider: model || 'coordinator-agent',
                  message: 'Tool completed: web_scraper',
                  metadata: { tool_name: 'web_scraper', subagent, status: 'success' }
                });
              } else {
                subagentResText = "Gagal memproses URL: URL tidak ditemukan dalam instruksi atau input user.";
                await emitTelemetryEvent({
                  eventType: 'Tool.Failed',
                  traceId,
                  provider: model || 'coordinator-agent',
                  message: 'Tool failed: web_scraper (missing URL)',
                  metadata: { tool_name: 'web_scraper', subagent, status: 'failed' }
                });
              }
            } catch (err) {
              subagentResText = `Gagal melakukan web scraping: ${err.message}`;
              await emitTelemetryEvent({
                eventType: 'Tool.Failed',
                traceId,
                provider: model || 'coordinator-agent',
                message: 'Tool failed: web_scraper',
                metadata: { tool_name: 'web_scraper', subagent, status: 'failed', error: err.message }
              });
            }

          } else if (subagent === 'coder') {
            await emitTelemetryEvent({
              eventType: 'Tool.Requested',
              traceId,
              provider: model || 'coordinator-agent',
              message: 'Tool requested: execute_javascript',
              metadata: {
                tool_name: 'execute_javascript',
                subagent,
                status: 'pending'
              }
            });

            try {
              const coderSystemPrompt = `Anda adalah Sub-Agent CODER. Tugas Anda: ${task}
Tulis kode JavaScript untuk menyelesaikan tugas ini.
Kembalikan HANYA kode JavaScript yang valid, dibungkus dalam blok \`\`\`javascript ... \`\`\`. Jangan berikan penjelasan teks lainnya.
Pastikan kode Anda mencetak output menggunakan console.log atau mengembalikan nilai di akhir.`;

              let codeOutput = await runLLM(`Konteks sebelumnya:\n${accumulatedContext}\n\nSelesaikan tugas pemrograman ini sekarang.`, coderSystemPrompt);
              let match = codeOutput.match(/```javascript([\s\S]*?)```/) || codeOutput.match(/```js([\s\S]*?)```/) || [null, codeOutput];
              let cleanCode = (match[1] || codeOutput).trim();

              const runSandbox = (code) => {
                const sandboxLogs = [];
                const customConsole = { log: (...msgs) => sandboxLogs.push(msgs.join(' ')) };
                const fn = new Function('console', `try { ${code.includes('return') ? code : 'return (' + code + ');'} } catch(e) { return 'Error: ' + e.message; }`);
                const result = fn(customConsole);
                return { result, logs: sandboxLogs };
              };

              await emitTelemetryEvent({
                eventType: 'Tool.Invoked',
                traceId,
                provider: model || 'coordinator-agent',
                message: 'Tool invoked: execute_javascript',
                metadata: { tool_name: 'execute_javascript', subagent, status: 'running' }
              });

              const execution = runSandbox(cleanCode);
              subagentResText = `Menjalankan Kode:\n\`\`\`javascript\n${cleanCode}\n\`\`\`\n\nOutput:\n${execution.result}\n${execution.logs.length > 0 ? 'Logs:\n' + execution.logs.join('\n') : ''}`;
              subagentToolExec = { name: 'execute_javascript', args: { code: cleanCode } };

              await emitTelemetryEvent({
                eventType: 'Tool.Completed',
                traceId,
                provider: model || 'coordinator-agent',
                message: 'Tool completed: execute_javascript',
                metadata: { tool_name: 'execute_javascript', subagent, status: 'success' }
              });
            } catch (err) {
              subagentResText = `Eksekusi Coder gagal: ${err.message}`;
              await emitTelemetryEvent({
                eventType: 'Tool.Failed',
                traceId,
                provider: model || 'coordinator-agent',
                message: 'Tool failed: execute_javascript',
                metadata: { tool_name: 'execute_javascript', subagent, status: 'failed', error: err.message }
              });
            }

          } else if (subagent === 'communicator') {
            await emitTelemetryEvent({
              eventType: 'Tool.Requested',
              traceId,
              provider: model || 'coordinator-agent',
              message: 'Tool requested: communicator',
              metadata: { subagent, status: 'pending' }
            });

            try {
              const communicatorPrompt = `Anda adalah Sub-Agent COMMUNICATOR. Tugas Anda: ${task}
Konteks:\n${accumulatedContext}

Tentukan apakah Anda harus memanggil Slack webhook ("post_to_slack") atau melakukan panggilan API ("make_api_call").
Kembalikan respon Anda HANYA dalam JSON format berikut:
{
  "tool": "post_to_slack" atau "make_api_call" atau "none",
  "args": { ... argumen tool ... }
}`;
              let toolDecisionText = await runLLM(communicatorPrompt);
              toolDecisionText = toolDecisionText.replace(/```json/g, '').replace(/```/g, '').trim();

              let decision = { tool: 'none', args: {} };
              try {
                decision = JSON.parse(toolDecisionText);
              } catch (e) {
                console.error('Failed to parse tool decision:', toolDecisionText);
              }

              let functionResult = 'Tidak ada aksi.';
              if (decision.tool === 'post_to_slack') {
                const messageToSend = decision.args.message || task;

                await emitTelemetryEvent({
                  eventType: 'Tool.Invoked',
                  traceId,
                  provider: model || 'coordinator-agent',
                  message: 'Tool invoked: post_to_slack',
                  metadata: { tool_name: 'post_to_slack', subagent, status: 'running' }
                });

                if (process.env.SLACK_WEBHOOK_URL) {
                  await axios.post(process.env.SLACK_WEBHOOK_URL, { text: messageToSend });
                  functionResult = 'Berhasil mengirim ke Slack Webhook.';
                } else {
                  functionResult = `[Simulasi] Mengirim ke Slack: "${messageToSend}"`;
                }
                subagentToolExec = { name: 'post_to_slack', args: { message: messageToSend } };

                await emitTelemetryEvent({
                  eventType: 'Tool.Completed',
                  traceId,
                  provider: model || 'coordinator-agent',
                  message: 'Tool completed: post_to_slack',
                  metadata: { tool_name: 'post_to_slack', subagent, status: process.env.SLACK_WEBHOOK_URL ? 'success' : 'unknown' }
                });
              } else if (decision.tool === 'make_api_call') {
                const { url, method } = decision.args;
                if (url && method) {
                  await emitTelemetryEvent({
                    eventType: 'Tool.Invoked',
                    traceId,
                    provider: model || 'coordinator-agent',
                    message: 'Tool invoked: make_api_call',
                    metadata: { tool_name: 'make_api_call', subagent, status: 'running' }
                  });

                  const apiRes = await axios({ method, url });
                  functionResult = `API Call Status: ${apiRes.status}\nData: ${JSON.stringify(apiRes.data).substring(0, 200)}`;
                  subagentToolExec = { name: 'make_api_call', args: { url, method } };

                  await emitTelemetryEvent({
                    eventType: 'Tool.Completed',
                    traceId,
                    provider: model || 'coordinator-agent',
                    message: 'Tool completed: make_api_call',
                    metadata: { tool_name: 'make_api_call', subagent, status: 'success' }
                  });
                } else {
                  await emitTelemetryEvent({
                    eventType: 'Tool.Failed',
                    traceId,
                    provider: model || 'coordinator-agent',
                    message: 'Tool failed: make_api_call (missing args)',
                    metadata: { tool_name: 'make_api_call', subagent, status: 'failed' }
                  });
                }
              }

              subagentResText = `Aksi Komunikasi:\n${functionResult}`;
            } catch (err) {
              subagentResText = `Aksi Komunikasi gagal: ${err.message}`;
              await emitTelemetryEvent({
                eventType: 'Tool.Failed',
                traceId,
                provider: model || 'coordinator-agent',
                message: 'Tool failed: communicator',
                metadata: { subagent, status: 'failed', error: err.message }
              });
            }
          }

          subagentRuns.push({
            subagent: subagent,
            task: task,
            output: subagentResText,
            sources: subagentSources,
            toolExecution: subagentToolExec
          });

          accumulatedContext += `--- Hasil Sub-Agent [${subagent.toUpperCase()}]: ---\nTugas: ${task}\nOutput: ${subagentResText}\n\n`;
        }

        const synthesisPromptText = `Anda telah menugaskan beberapa sub-agent untuk menyelesaikan tugas dari user.${fullSystemContext}
                
Permintaan Awal User: "${message}"

Berikut adalah riwayat pekerjaan dari sub-agent yang telah selesai berjalan:
${accumulatedContext}

Buatlah ringkasan laporan hasil kerja sub-agent tersebut untuk user secara ramah, lengkap, terstruktur, dan profesional. Sebutkan secara singkat sub-agent apa saja yang telah bekerja membantu Anda.

PENTING:
- Gunakan format Tabel Markdown jika menyajikan data, harga, atau perbandingan.
- Jika user meminta diagram, flowchart, atau alur kerja, buatlah visualisasinya menggunakan blok \`\`\`mermaid\n(contoh diagram graph TD, sequenceDiagram, dll)\`\`\`.
JANGAN ragu menggunakan gambar/diagram jika itu mempermudah penjelasan!`;

        replyMessage = await runLLM(synthesisPromptText, '', history);
      } else {
        await emitTelemetryEvent({
          eventType: 'Verification.Pass',
          traceId,
          provider: provider || 'coordinator-agent',
          message: 'Planner verification passed (no subagent plan required)',
          metadata: {
            status: 'success',
            stage: 'planner_parse'
          }
        });

        await persistVerificationLog({
          traceId,
          decision: 'PASS',
          status: 'PASS',
          failures: [],
          metadata: {
            model,
            provider: provider || 'coordinator-agent',
            stage: 'planner_parse'
          }
        });

        replyMessage = await runLLM(message, fullSystemContext, history);
      }

      return res.json({
        message: replyMessage,
        toolsUsed: [],
        groundingSources: [],
        toolExecution: null,
        subagentRuns: subagentRuns,
        timestamp: new Date(),
        userId: userId,
        trace_id: traceId
      });
    } else if (model && model.startsWith('openrouter-')) {
      // Check if OpenRouter API Key exists
      if (!process.env.OPENROUTER_API_KEY) {
        if (process.env.GROQ_API_KEY) {
          console.log('OpenRouter key missing, falling back to Llama 3.3 on Groq...');
          try {
            const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
              model: 'llama-3.3-70b-versatile',
              messages: [
                {
                  role: 'system',
                  content: fullSystemContext
                },
                {
                  role: 'user',
                  content: message
                }
              ]
            }, {
              headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
              }
            });
            let replyMessage = '';
            if (groqResponse.data && groqResponse.data.choices?.[0]?.message) {
              replyMessage = `*(Catatan: Menggunakan Llama 3.3 70B karena OPENROUTER_API_KEY belum dikonfigurasi)*\n\n` + groqResponse.data.choices[0].message.content;
            }
            return res.json({
              message: replyMessage,
              toolsUsed: [],
              groundingSources: [],
              toolExecution: null,
              timestamp: new Date(),
              userId: userId
            });
          } catch (err) {
            console.error('Groq Llama 3.3 fallback failed:', err.message);
          }
        }
        
        return res.status(400).json({
          error: 'OPENROUTER_API_KEY belum dikonfigurasi di backend/.env. Silakan gunakan model Gemini (100% Gratis & Pintar) atau tambahkan key OpenRouter Anda.'
        });
      }

      let openRouterModel = 'meta-llama/llama-3.1-8b-instruct';
      if (model === 'openrouter-google-gemini-2.0-flash-exp') {
        openRouterModel = 'google/gemini-2.0-flash-exp:free';
      }

      console.log(`Calling OpenRouter API using model: ${openRouterModel}`);
      const openRouterResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: openRouterModel,
        messages: [
          {
            role: 'system',
            content: fullSystemContext
          },
          {
            role: 'user',
            content: extractedImage ? [
              { type: 'text', text: message },
              { type: 'image_url', image_url: { url: `data:${extractedImage.mimeType};base64,${extractedImage.data}` } }
            ] : message
          }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (openRouterResponse.data && openRouterResponse.data.choices?.[0]?.message) {
        replyMessage = openRouterResponse.data.choices[0].message.content;
      }
    } else if (model && model.startsWith('groq-')) {
      // Check if Groq API Key exists
      if (!process.env.GROQ_API_KEY) {
        return res.status(400).json({
          error: 'GROQ_API_KEY belum dikonfigurasi di backend/.env. Silakan buat API Key gratis di https://console.groq.com dan pasang di file .env Anda.'
        });
      }

      let groqModel = 'llama-3.3-70b-versatile';
      if (model === 'groq-llama-3.1') {
        groqModel = 'llama-3.1-8b-instant';
      }

      console.log(`Calling Groq API using model: ${groqModel}`);
      const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: groqModel,
        messages: [
          {
            role: 'system',
            content: fullSystemContext
          },
          {
            role: 'user',
            content: message
          }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (groqResponse.data && groqResponse.data.choices?.[0]?.message) {
        replyMessage = groqResponse.data.choices[0].message.content;
      }
    } else {
      // Call Google Gemini API (Flash or Pro)
      const geminiModel = model === 'gemini-2.5-pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
      console.log(`Calling Gemini API using model: ${geminiModel}`);
      
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      
      let response = await axios.post(geminiUrl, geminiPayload, {
        headers: {
          'content-type': 'application/json'
        }
      });

      let candidate = response.data.candidates?.[0];
      let firstPart = candidate?.content?.parts?.[0];

      // If Gemini requests a function call (Function Calling)
      if (firstPart && firstPart.functionCall) {
        const { name, args } = firstPart.functionCall;
        console.log(`AI requested function call: ${name} with args:`, args);
        
        toolExecution = {
          name: name,
          args: args
        };

        let functionResult = null;
        try {
          if (name === 'execute_javascript') {
            const codeToRun = args.code;
            const runSandbox = (code) => {
              const sandboxLogs = [];
              const customConsole = {
                log: (...msgs) => sandboxLogs.push(msgs.map(m => typeof m === 'object' ? JSON.stringify(m) : m).join(' '))
              };
              const fn = new Function('console', `
                try {
                  ${code.includes('return') ? code : 'return (' + code + ');'}
                } catch (e) {
                  return 'Error: ' + e.message;
                }
              `);
              const result = fn(customConsole);
              return {
                result: result,
                logs: sandboxLogs
              };
            };

            const execution = runSandbox(codeToRun);
            functionResult = {
              output: execution.result,
              logs: execution.logs
            };
          } else if (name === 'make_api_call') {
            const { url, method, headers, body } = args;
            const axiosConfig = {
              method: method,
              url: url,
              headers: headers || {},
            };
            if (body) {
              try {
                axiosConfig.data = JSON.parse(body);
              } catch (e) {
                axiosConfig.data = body;
              }
            }
            const apiRes = await axios(axiosConfig);
            functionResult = {
              status: apiRes.status,
              data: apiRes.data
            };
          } else if (name === 'post_to_slack') {
            const { message: slackMessage } = args;
            const webhookUrl = process.env.SLACK_WEBHOOK_URL;
            if (webhookUrl) {
              await axios.post(webhookUrl, { text: slackMessage });
              functionResult = {
                status: 'success',
                message: 'Message successfully posted to Slack Webhook.'
              };
            } else {
              console.log(`[SIMULATED SLACK] Message: ${slackMessage}`);
              functionResult = {
                status: 'simulated',
                message: 'Slack Webhook is not configured in .env. Message printed to console instead.',
                logged_message: slackMessage
              };
            }
          }
        } catch (err) {
          console.error(`Error executing function ${name}:`, err.message);
          functionResult = {
            error: err.message
          };
        }

        console.log(`Function result for ${name}:`, functionResult);

        // Send function response back to Gemini to get final output text
        const followUpPayload = {
          contents: [
            {
              role: 'user',
              parts: [{ text: message }]
            },
            {
              role: 'model',
              parts: [firstPart]
            },
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: name,
                    response: {
                      result: functionResult
                    }
                  }
                }
              ]
            }
          ]
        };

        if (geminiPayload.tools) {
          followUpPayload.tools = geminiPayload.tools;
        }

        const followUpResponse = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`, followUpPayload, {
          headers: {
            'content-type': 'application/json'
          }
        });

        candidate = followUpResponse.data.candidates?.[0];
      }

      if (candidate?.content?.parts?.[0]) {
        replyMessage = candidate.content.parts[0].text;
      }

      if (candidate?.groundingMetadata?.groundingChunks) {
        groundingSources = candidate.groundingMetadata.groundingChunks
          .map(chunk => ({
            title: chunk.web?.title || 'Sumber Web',
            uri: chunk.web?.uri
          }))
          .filter(source => source.uri);
      }
    }

    const latencyMs = Date.now() - requestStartedAt;

    await emitTelemetryEvent({
      eventType: 'Provider.Response',
      traceId,
      provider: model || 'gemini',
      message: 'Agent processing provider response completed',
      metadata: {
        model,
        user_id: userId || null,
        status: 'success',
        latency_ms: latencyMs,
        endpoint: '/api/agent/process'
      }
    });

    await persistAiSystemLog({
      traceId,
      provider: model || 'gemini',
      model: model || null,
      latencyMs,
      status: 'success',
      errorFlag: false,
      llmCallCount: 1,
      metadata: {
        endpoint: '/api/agent/process',
        user_id: userId || null
      }
    });

    await emitTelemetryEvent({
      eventType: 'Pipeline.Completed',
      traceId,
      provider: model || 'agent-process',
      message: '/api/agent/process request completed',
      metadata: {
        endpoint: '/api/agent/process',
        user_id: userId || null,
        status: 'success',
        latency_ms: latencyMs
      }
    });

    const aiResponse = {
      message: replyMessage,
      toolsUsed: tools.filter(t => ['web_search', 'code_executor', 'api_caller', 'slack_integration'].includes(t)),
      groundingSources: groundingSources,
      toolExecution: toolExecution,
      timestamp: new Date(),
      userId: userId,
      trace_id: traceId
    };

    res.json(aiResponse);

  } catch (error) {
    const latencyMs = Date.now() - requestStartedAt;
    const errMessage = error.response ? JSON.stringify(error.response.data) : error.message;

    console.error('Error calling Gemini API:', error.response ? error.response.data : error.message);

    await emitTelemetryEvent({
      eventType: 'Provider.Error',
      traceId,
      provider: req.body?.model || 'agent-process',
      message: 'Agent processing provider failed',
      metadata: {
        model: req.body?.model || null,
        user_id: req.body?.userId || null,
        status: 'failed',
        latency_ms: latencyMs,
        error: errMessage,
        endpoint: '/api/agent/process'
      }
    });

    await persistAiSystemLog({
      traceId,
      provider: req.body?.model || 'agent-process',
      model: req.body?.model || null,
      latencyMs,
      status: 'failed',
      errorFlag: true,
      llmCallCount: 1,
      metadata: {
        endpoint: '/api/agent/process',
        user_id: req.body?.userId || null,
        error: errMessage
      }
    });

    await emitTelemetryEvent({
      eventType: 'Pipeline.Failed',
      traceId,
      provider: req.body?.model || 'agent-process',
      message: '/api/agent/process request failed',
      metadata: {
        endpoint: '/api/agent/process',
        user_id: req.body?.userId || null,
        status: 'failed',
        latency_ms: latencyMs,
        error: errMessage
      }
    });

    res.status(500).json({ 
      error: 'Failed to process request with AI (Gemini)',
      details: error.response ? error.response.data : error.message,
      trace_id: traceId
    });
  }
});

// Get available tools
app.get('/api/tools', (req, res) => {
  const tools = [
    { id: 'web_search', name: 'Web Search', category: 'research' },
    { id: 'code_executor', name: 'Code Executor', category: 'compute' },
    { id: 'api_caller', name: 'API Caller', category: 'integration' },
    { id: 'slack_integration', name: 'Slack Integration', category: 'communication' },
  ];

  res.json({ tools });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║  🤖 AI Agent Backend Started!         ║
║  Server: http://localhost:${PORT}          ║
║  API Health: /api/health              ║
║  Agent Process: /api/agent/process    ║
║  Get Tools: /api/tools                ║
╚═══════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Server shutting down...');
  process.exit(0);
});

module.exports = app;
