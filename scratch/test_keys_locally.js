const OPENROUTER_API_KEY = "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";

async function testOpenRouter() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        messages: [{ role: 'user', content: 'hi' }]
      })
    });
    console.log("OpenRouter 4.6 Sonnet Status:", res.status);
    console.log("OpenRouter 4.6 Sonnet Body:", await res.text());
  } catch(e) {
    console.log("OpenRouter Failed:", e.message);
  }
}

testOpenRouter();
