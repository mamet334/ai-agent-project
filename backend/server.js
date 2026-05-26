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

    // If web_search is enabled, attach real Google Search Grounding tool
    if (tools.includes('web_search')) {
      geminiPayload.tools = [
        {
          google_search: {}
        }
      ];
    }

    // Call Google Gemini API
    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, geminiPayload, {
      headers: {
        'content-type': 'application/json'
      }
    });

    // Extract text and grounding sources from Gemini response structure
    let replyMessage = 'Gagal memproses jawaban dari AI.';
    let groundingSources = [];

    const candidate = response.data.candidates?.[0];
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

    const aiResponse = {
      message: replyMessage,
      toolsUsed: tools.filter(t => ['web_search', 'code_executor', 'api_caller', 'slack_integration'].includes(t)),
      groundingSources: groundingSources,
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
