const OPENROUTER_API_KEY = "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";

async function test() {
  const oaiMessages = [
    { role: 'user', content: 'hello' }
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
  let output = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += new TextDecoder().decode(value);
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ') && !line.includes('[DONE]')) {
        try {
          const data = JSON.parse(line.substring(6));
          const content = data.choices?.[0]?.delta?.content || '';
          if (content) output += content;
        } catch(e) {
          console.error("Parse error:", e.message, line);
        }
      }
    }
  }
  console.log("Final Output:", output);
}

test().catch(console.error);
