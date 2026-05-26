const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Main agent endpoint
app.post('/api/agent/process', async (req, res) => {
  try {
    const { message, tools, userId } = req.body;

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
      
      const coordinatorPrompt = {
        contents: [
          {
            role: 'user',
            parts: [{
              text: `Anda adalah Kepala Agent (Coordinator). Tugas Anda adalah menganalisis permintaan user berikut dan memecahnya menjadi langkah-langkah tugas untuk sub-agent khusus jika diperlukan.
              
Permintaan User: "${message}"

Sub-agent yang tersedia:
1. "researcher": Menggunakan penelusuran web (web_search) untuk mencari info aktual, berita terkini, atau referensi online.
2. "coder": Menggunakan eksekusi kode JS (code_executor) untuk melakukan perhitungan matematika, manipulasi teks/array, atau pemrosesan logika data.
3. "communicator": Menggunakan kirim pesan Slack (post_to_slack) atau pemanggilan API eksternal (api_caller) untuk mengirimkan notifikasi atau integrasi data.

Jika permintaan membutuhkan eksekusi salah satu atau beberapa sub-agent di atas secara berurutan, Anda WAJIB merespon HANYA dengan JSON array dengan format berikut:
[
  { "subagent": "researcher", "task": "deskripsi tugas spesifik untuk sub-agent mencari informasi X" },
  { "subagent": "coder", "task": "deskripsi tugas spesifik untuk melakukan perhitungan Y menggunakan data dari langkah sebelumnya" },
  { "subagent": "communicator", "task": "deskripsi tugas spesifik untuk mengirimkan hasil akhir Z ke Slack" }
]

Jika permintaan user hanyalah obrolan biasa, pertanyaan umum, atau tidak memerlukan sub-agent sama sekali (misal hanya menyapa atau tanya hal teoritis sederhana), kembalikan array kosong saja: [].

PENTING: Jangan berikan teks penjelasan lain, jangan gunakan markdown code block (\`\`\`json), berikan HANYA JSON array murni.`
            }]
          }
        ]
      };

      const planRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, coordinatorPrompt, {
        headers: { 'content-type': 'application/json' }
      });

      let planText = planRes.data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      planText = planText.replace(/```json/g, '').replace(/```/g, '').trim();

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

          let subagentTools = [];
          if (subagent === 'researcher') {
            subagentTools.push({ googleSearch: {} });
          } else if (subagent === 'coder') {
            subagentTools.push({
              functionDeclarations: [{
                name: 'execute_javascript',
                description: 'Execute JavaScript/Node.js code safely to perform mathematical calculations, data formatting, string manipulation, or array processing.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    code: {
                      type: 'STRING',
                      description: 'The JavaScript code to execute. It must return a value or log output.'
                    }
                  },
                  required: ['code']
                }
              }]
            });
          } else if (subagent === 'communicator') {
            subagentTools.push({
              functionDeclarations: [
                {
                  name: 'post_to_slack',
                  description: 'Post a message to a Slack channel via Webhook.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      message: { type: 'STRING', description: 'The message text to send to Slack.' }
                    },
                    required: ['message']
                  }
                },
                {
                  name: 'make_api_call',
                  description: 'Make an HTTP REST API request (GET, POST, etc.) to a given URL with optional headers and request body.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      url: { type: 'STRING', description: 'The URL of the API to call.' },
                      method: { type: 'STRING', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'The HTTP method to use.' }
                    },
                    required: ['url', 'method']
                  }
                }
              ]
            });
          }

          const subagentPromptText = `Anda adalah Sub-Agent "${subagent.toUpperCase()}".
Tugas Anda: ${task}

Konteks dari langkah sebelumnya:
${accumulatedContext}

Selesaikan tugas Anda sekarang. Jika Anda memerlukan tool, panggil tool tersebut. Kembalikan jawaban yang padat dan jelas tentang hasil kerja Anda.`;

          const subagentPayload = {
            contents: [{ role: 'user', parts: [{ text: subagentPromptText }] }]
          };
          if (subagentTools.length > 0) {
            subagentPayload.tools = subagentTools;
          }

          let subagentResText = 'Gagal memproses.';
          let subagentSources = [];
          let subagentToolExec = null;

          try {
            let geminiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, subagentPayload, {
              headers: { 'content-type': 'application/json' }
            });

            let candidate = geminiRes.data.candidates?.[0];
            let firstPart = candidate?.content?.parts?.[0];

            if (firstPart && firstPart.functionCall) {
              const { name, args } = firstPart.functionCall;
              subagentToolExec = { name, args };
              let functionResult = null;

              if (name === 'execute_javascript') {
                const runSandbox = (code) => {
                  const sandboxLogs = [];
                  const customConsole = { log: (...msgs) => sandboxLogs.push(msgs.join(' ')) };
                  const fn = new Function('console', `try { ${code.includes('return') ? code : 'return (' + code + ');'} } catch(e) { return 'Error: ' + e.message; }`);
                  const result = fn(customConsole);
                  return { result, logs: sandboxLogs };
                };
                const execution = runSandbox(args.code);
                functionResult = { output: execution.result, logs: execution.logs };
              } else if (name === 'make_api_call') {
                const apiRes = await axios({ method: args.method, url: args.url });
                functionResult = { status: apiRes.status, data: apiRes.data };
              } else if (name === 'post_to_slack') {
                if (process.env.SLACK_WEBHOOK_URL) {
                  await axios.post(process.env.SLACK_WEBHOOK_URL, { text: args.message });
                  functionResult = { status: 'success' };
                } else {
                  functionResult = { status: 'simulated', logged_message: args.message };
                }
              }

              const followUpPayload = {
                contents: [
                  { role: 'user', parts: [{ text: subagentPromptText }] },
                  { role: 'model', parts: [firstPart] },
                  { role: 'user', parts: [{ functionResponse: { name, response: { result: functionResult } } }] }
                ]
              };
              if (subagentPayload.tools) {
                followUpPayload.tools = subagentPayload.tools;
              }

              const followUpRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, followUpPayload, {
                headers: { 'content-type': 'application/json' }
              });

              candidate = followUpRes.data.candidates?.[0];
            }

            if (candidate?.content?.parts?.[0]) {
              subagentResText = candidate.content.parts[0].text;
            }

            if (candidate?.groundingMetadata?.groundingChunks) {
              subagentSources = candidate.groundingMetadata.groundingChunks
                .map(chunk => ({ title: chunk.web?.title || 'Sumber Web', uri: chunk.web?.uri }))
                .filter(s => s.uri);
            }
          } catch (err) {
            console.error(`Error in subagent ${subagent}:`, err.message);
            subagentResText = `Error: ${err.message}`;
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

        const synthesisPrompt = {
          contents: [
            {
              role: 'user',
              parts: [{
                text: `Anda adalah Kepala Agent (Coordinator). Anda telah menugaskan beberapa sub-agent untuk menyelesaikan tugas dari user.
                
Permintaan Awal User: "${message}"

Berikut adalah riwayat pekerjaan dari sub-agent yang telah selesai berjalan:
${accumulatedContext}

Buatlah ringkasan laporan hasil kerja sub-agent tersebut untuk user secara ramah, lengkap, terstruktur, dan profesional. Sebutkan secara singkat sub-agent apa saja yang telah bekerja membantu Anda.`
              }]
            }
          ]
        };

        const synthRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, synthesisPrompt, {
          headers: { 'content-type': 'application/json' }
        });

        replyMessage = synthRes.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Gagal merangkum jawaban akhir.';
      } else {
        const normalPrompt = {
          contents: [{ role: 'user', parts: [{ text: message }] }]
        };
        const normalRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, normalPrompt, {
          headers: { 'content-type': 'application/json' }
        });
        replyMessage = normalRes.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Gagal merespon.';
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
            content: message
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
