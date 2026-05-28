const express = require('express');
const cors = require('cors');
const axios = require('axios');
const google = require('googlethis');
const cheerio = require('cheerio');
const PDFParser = require('pdf2json');
const mammoth = require('mammoth');
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

// Main agent endpoint
app.post('/api/agent/process', async (req, res) => {
  try {
    let { message, tools, model, userId, file } = req.body;

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
    console.log(`[${new Date().toISOString()}] Processing message from user: ${userId}`);
    console.log(`Tools requested: ${tools.join(', ')}`);

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

    if (model === 'coordinator-agent') {
      console.log('Running Coordinator Agent Orchestrator...');
      
      // Helper function to call Groq Llama 3.3
      const callGroq = async (promptText, systemPromptText = '') => {
        const messages = [];
        if (systemPromptText) {
          messages.push({ role: 'system', content: systemPromptText });
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
      const runLLM = async (promptText, systemPromptText = '') => {
        if (process.env.GROQ_API_KEY && !extractedImage) {
          try {
            console.log('Running on Groq (Llama 3.3 70B)...');
            return await callGroq(promptText, systemPromptText);
          } catch (e) {
            console.warn('Groq failed, falling back to Gemini...', e.message);
          }
        }
        
        // Fallback to Gemini 2.5 Flash
        console.log('Running on Gemini 2.5 Flash...');
        const payload = {
          contents: []
        };
        if (systemPromptText) {
          payload.contents.push({ role: 'user', parts: [{ text: `System Instruction: ${systemPromptText}` }] });
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

      const coordinatorSystemPrompt = `Anda adalah Kepala Agent (Coordinator). Tugas Anda adalah menganalisis permintaan user berikut dan memecahnya menjadi langkah-langkah tugas untuk sub-agent khusus jika diperlukan.
              
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
      try {
        planText = await runLLM(`Permintaan User: "${message}"`, coordinatorSystemPrompt);
        planText = planText.replace(/```json/g, '').replace(/```/g, '').trim();
      } catch (err) {
        console.error('Planner LLM call failed:', err.message);
      }

      let plan = [];
      try {
        plan = JSON.parse(planText);
      } catch (e) {
        console.error('Failed to parse coordinator plan:', planText, e);
        plan = [];
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
            try {
              const subagentPayload = {
                contents: [{ role: 'user', parts: [{ text: `Cari informasi web mengenai: ${task}\n\nKonteks:\n${accumulatedContext}` }] }],
                tools: [{ googleSearch: {} }]
              };
              let geminiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, subagentPayload, {
                headers: { 'content-type': 'application/json' }
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
              }
            }

          } else if (subagent === 'scraper') {
            try {
              let urlToScrape = task.match(/(https?:\/\/[^\s]+)/g)?.[0];
              if (!urlToScrape && accumulatedContext.match(/(https?:\/\/[^\s]+)/g)) {
                urlToScrape = accumulatedContext.match(/(https?:\/\/[^\s]+)/g)[0];
              }
              if (urlToScrape) {
                const scrapeRes = await axios.get(urlToScrape);
                const $ = cheerio.load(scrapeRes.data);
                $('script, style, nav, footer, header').remove();
                const text = $('body').text().replace(/\s+/g, ' ').trim();
                subagentResText = `Isi konten dari ${urlToScrape}:\n\n${text.substring(0, 15000)}`;
                subagentSources = [{ title: $('title').text() || 'Scraped Page', uri: urlToScrape }];
                subagentToolExec = { name: 'web_scraper', args: { url: urlToScrape } };
              } else {
                subagentResText = "Gagal memproses URL: URL tidak ditemukan dalam instruksi atau input user.";
              }
            } catch (err) {
              subagentResText = `Gagal melakukan web scraping: ${err.message}`;
            }

          } else if (subagent === 'coder') {
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

              const execution = runSandbox(cleanCode);
              subagentResText = `Menjalankan Kode:\n\`\`\`javascript\n${cleanCode}\n\`\`\`\n\nOutput:\n${execution.result}\n${execution.logs.length > 0 ? 'Logs:\n' + execution.logs.join('\n') : ''}`;
              subagentToolExec = { name: 'execute_javascript', args: { code: cleanCode } };
            } catch (err) {
              subagentResText = `Eksekusi Coder gagal: ${err.message}`;
            }

          } else if (subagent === 'communicator') {
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
                if (process.env.SLACK_WEBHOOK_URL) {
                  await axios.post(process.env.SLACK_WEBHOOK_URL, { text: messageToSend });
                  functionResult = 'Berhasil mengirim ke Slack Webhook.';
                } else {
                  functionResult = `[Simulasi] Mengirim ke Slack: "${messageToSend}"`;
                }
                subagentToolExec = { name: 'post_to_slack', args: { message: messageToSend } };
              } else if (decision.tool === 'make_api_call') {
                const { url, method } = decision.args;
                if (url && method) {
                  const apiRes = await axios({ method, url });
                  functionResult = `API Call Status: ${apiRes.status}\nData: ${JSON.stringify(apiRes.data).substring(0, 200)}`;
                  subagentToolExec = { name: 'make_api_call', args: { url, method } };
                }
              }

              subagentResText = `Aksi Komunikasi:\n${functionResult}`;
            } catch (err) {
              subagentResText = `Aksi Komunikasi gagal: ${err.message}`;
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

        const synthesisPromptText = `Anda adalah Kepala Agent (Coordinator). Anda telah menugaskan beberapa sub-agent untuk menyelesaikan tugas dari user.
                
Permintaan Awal User: "${message}"

Berikut adalah riwayat pekerjaan dari sub-agent yang telah selesai berjalan:
${accumulatedContext}

Buatlah ringkasan laporan hasil kerja sub-agent tersebut untuk user secara ramah, lengkap, terstruktur, dan profesional. Sebutkan secara singkat sub-agent apa saja yang telah bekerja membantu Anda.`;

        replyMessage = await runLLM(synthesisPromptText);
      } else {
        replyMessage = await runLLM(message);
      }

      return res.json({
        message: replyMessage,
        toolsUsed: [],
        groundingSources: [],
        toolExecution: null,
        subagentRuns: subagentRuns,
        timestamp: new Date(),
        userId: userId
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

      let openRouterModel = 'meta-llama/llama-3-8b-instruct:free';
      if (model === 'openrouter-deepseek-r1') {
        openRouterModel = 'deepseek/deepseek-r1:free';
      }

      console.log(`Calling OpenRouter API using model: ${openRouterModel}`);
      const openRouterResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: openRouterModel,
        messages: [
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

    const aiResponse = {
      message: replyMessage,
      toolsUsed: tools.filter(t => ['web_search', 'code_executor', 'api_caller', 'slack_integration'].includes(t)),
      groundingSources: groundingSources,
      toolExecution: toolExecution,
      timestamp: new Date(),
      userId: userId
    };

    res.json(aiResponse);

  } catch (error) {
    console.error('Error calling Gemini API:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      error: 'Failed to process request with AI (Gemini)',
      details: error.response ? error.response.data : error.message
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
