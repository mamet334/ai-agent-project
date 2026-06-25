const OPENROUTER_API_KEY = "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";

async function test() {
  const oaiMessages = [
    { role: 'user', content: 'hello ' + 'world '.repeat(15000) } // Simulate ~15k tokens
  ];
  const orModel = 'openai/gpt-4o-mini';
  
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://ai-agent-project.vercel.app', 'X-Title': 'Mamet AI Agent', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: orModel, messages: oaiMessages, temperature: 0.1, stream: true })
  });
  
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text.substring(0, 500));
}

test().catch(console.error);
