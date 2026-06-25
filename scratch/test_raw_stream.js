const OPENROUTER_API_KEY = "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";

async function test() {
  const oaiMessages = [
    { role: 'user', content: 'siapa saja pejabat struktural di rsud?' }
  ];
  const orModel = 'openai/gpt-4o-mini';
  
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'HTTP-Referer': 'https://ai-agent-project.vercel.app', 'X-Title': 'Mamet AI Agent', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: orModel, messages: oaiMessages, temperature: 0.1, stream: true })
  });
  
  console.log("Status:", res.status);
  
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No body");
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunkStr = new TextDecoder().decode(value);
    console.log("RAW CHUNK:", chunkStr);
  }
}

test().catch(console.error);
