import { RuntimeContext } from './runtime_context.ts';

export const callGroq = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], rctx: RuntimeContext) => {
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
  
  let groqModel = 'llama-3.1-8b-instant';
  if (rctx.model.model && rctx.model.model.startsWith('groq/')) {
    groqModel = rctx.model.model.replace('groq/', '');
  } else if (rctx.model.model === 'groq-llama-3.3') {
    groqModel = 'llama-3.3-70b-versatile';
  } else if (rctx.model.model === 'groq-llama-3.1') {
    groqModel = 'llama-3.1-8b-instant';
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${rctx.keys.groq}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: groqModel,
      messages: messages,
      temperature: 0.1
    })
  });
  if (!res.ok) {
    throw new Error(`Groq API Error: ${res.status}`);
  }
  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content || '';
  
  // Catat pemakaian
  if (!rctx.stream.isStream) rctx.logger.logApiUsage('groq', groqModel, promptText + systemPromptText, answer);
  
  return answer;
};

export const callOpenAI = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], overrideModel: string | undefined, rctx: RuntimeContext) => {
  const messages = [];
  if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
  if (chatHistory && chatHistory.length > 0) {
    for (const msg of chatHistory) {
      messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
    }
  }
  messages.push({ role: 'user', content: promptText });
  
  const selectedModel = overrideModel || rctx.model.model || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${rctx.keys.openAI}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: messages,
      temperature: 0.1
    })
  });
  if (!res.ok) throw new Error(`OpenAI API Error: ${res.status}`);
  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content || '';
  
  if (!rctx.stream.isStream) rctx.logger.logApiUsage('openai', selectedModel, promptText + systemPromptText, answer);
  return answer;
};

export const callOpenRouter = async (promptText: string, systemPromptText = '', chatHistory: any[] = [], forceDefaultModel = false, rctx: RuntimeContext) => {
  const messages = [];
  if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
  if (chatHistory && chatHistory.length > 0) {
    for (const msg of chatHistory) {
      messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
    }
  }
  messages.push({ role: 'user', content: promptText });
  
  let openRouterModel = 'anthropic/claude-sonnet-4.6';
  if (!forceDefaultModel) {
    if (rctx.model.model && rctx.model.model.startsWith('openrouter/')) {
      openRouterModel = rctx.model.model.replace('openrouter/', '');
    } else if (rctx.model.model === 'openrouter-llama-3') {
      openRouterModel = 'anthropic/claude-sonnet-4.6';
    } else if (rctx.model.model === 'openrouter-google-gemini-2.0-flash-exp') {
      openRouterModel = 'anthropic/claude-sonnet-4.6';
    }
  }
  
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${rctx.keys.openRouter}`,
      'HTTP-Referer': 'https://ai-agent-project.vercel.app',
      'X-Title': 'Mamet AI Agent',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages: messages,
      temperature: 0.1
    })
  });
  if (!res.ok) throw new Error(`OpenRouter API Error: ${res.status}`);
  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content || '';
  
  if (!rctx.stream.isStream) rctx.logger.logApiUsage('openrouter', openRouterModel, promptText + systemPromptText, answer);
  return answer;
};
