import { CapabilityAdapter, AdapterContext, AdapterResult } from './capability_adapter.ts';
import { callGroq, callOpenRouter, callOpenAI } from '../provider_manager.ts';
import { RuntimeContext } from '../runtime_context.ts';

async function* processOpenAIStream(res: Response): AsyncGenerator<string, void, unknown> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No body");
  let buffer = '';
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
          if (content) yield content;
        } catch(e) {}
      }
    }
  }
}

export class GroqAdapter implements CapabilityAdapter {
  name = 'GroqAdapter';
  type = 'AI' as const;
  private rctx: RuntimeContext;

  constructor(rctx: RuntimeContext) {
    this.rctx = rctx;
  }

  async initialize() {
    return !!this.rctx.keys.groq;
  }

  async execute(input: any, context: AdapterContext): Promise<AdapterResult> {
    const { promptText, systemPromptText, chatHistory } = input;
    const answer = await callGroq(promptText, systemPromptText || '', chatHistory || [], this.rctx);
    return {
      result: answer,
      confidence: 0.9,
      source: 'groq',
      trace_id: context.trace_id
    };
  }

  async *stream(input: any, context: AdapterContext): AsyncGenerator<string, void, unknown> {
    const { promptText, systemPromptText, chatHistory } = input;
    let groqModel = 'llama-3.1-8b-instant';
    if (this.rctx.model.model && this.rctx.model.model.startsWith('groq/')) groqModel = this.rctx.model.model.replace('groq/', '');
    
    const messages = [];
    if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
    if (chatHistory) {
       for (const msg of chatHistory) messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
    }
    messages.push({ role: 'user', content: promptText });

    const aborter = new AbortController();
    const id = setTimeout(() => aborter.abort(), 15000);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.rctx.keys.groq}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: groqModel, messages, temperature: 0.1, stream: true }),
      signal: aborter.signal
    });
    clearTimeout(id);
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
    yield* processOpenAIStream(res);
  }

  async healthCheck() {
    return await this.initialize();
  }

  async shutdown() {}
}

export class OpenRouterAdapter implements CapabilityAdapter {
  name = 'OpenRouterAdapter';
  type = 'AI' as const;
  private rctx: RuntimeContext;

  constructor(rctx: RuntimeContext) {
    this.rctx = rctx;
  }

  async initialize() {
    return !!this.rctx.keys.openRouter;
  }

  async execute(input: any, context: AdapterContext): Promise<AdapterResult> {
    const { promptText, systemPromptText, chatHistory, forceDefaultModel } = input;
    const answer = await callOpenRouter(promptText, systemPromptText || '', chatHistory || [], !!forceDefaultModel, this.rctx);
    return {
      result: answer,
      confidence: 0.9,
      source: 'openrouter',
      trace_id: context.trace_id
    };
  }

  async *stream(input: any, context: AdapterContext): AsyncGenerator<string, void, unknown> {
    const { promptText, systemPromptText, chatHistory } = input;
    let orModel = 'meta-llama/llama-3.1-8b-instruct:free';
    if (this.rctx.model.model && this.rctx.model.model.startsWith('openrouter/')) orModel = this.rctx.model.model.replace('openrouter/', '');
    
    const messages = [];
    if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
    if (chatHistory) {
       for (const msg of chatHistory) messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
    }
    messages.push({ role: 'user', content: promptText });

    const aborter = new AbortController();
    const id = setTimeout(() => aborter.abort(), 15000);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.rctx.keys.openRouter}`, 'HTTP-Referer': 'https://ai-agent-project.vercel.app', 'X-Title': 'Mamet AI Agent', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: orModel, messages, temperature: 0.1, stream: true }),
      signal: aborter.signal
    });
    clearTimeout(id);
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
    yield* processOpenAIStream(res);
  }

  async healthCheck() {
    return await this.initialize();
  }

  async shutdown() {}
}

export class GeminiAdapter implements CapabilityAdapter {
  name = 'GeminiAdapter';
  type = 'AI' as const;
  private rctx: RuntimeContext;
  private static keyIndex = 0;

  constructor(rctx: RuntimeContext) {
    this.rctx = rctx;
  }

  async initialize() {
    return this.rctx.keys.allGemini.length > 0;
  }

  async execute(input: any, context: AdapterContext): Promise<AdapterResult> {
    const { payload, model } = input;
    const allKeys = this.rctx.keys.allGemini;
    const maxRetries = 3;
    let seenRateLimit = false;
    let lastError = 'Unknown error';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (let ki = 0; ki < allKeys.length; ki++) {
        const key = allKeys[(GeminiAdapter.keyIndex + ki) % allKeys.length];
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (res.ok) {
            GeminiAdapter.keyIndex = (GeminiAdapter.keyIndex + ki + 1) % allKeys.length;
            const data = await res.json();
            const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const grounding = data.candidates?.[0]?.groundingMetadata;
            const metadata: any = {};
            if (grounding?.groundingChunks) {
                metadata.sources = grounding.groundingChunks.map((c: any) => ({
                    title: c.web?.title || 'Sumber Web', uri: c.web?.uri 
                })).filter((s: any) => s.uri);
            }
            return {
              result: answer,
              confidence: 0.95,
              source: 'gemini',
              trace_id: context.trace_id,
              metadata
            };
          }
          
          const errText = await res.text();
          lastError = `Status ${res.status}: ${errText}`;
          if (res.status === 429) {
            seenRateLimit = true;
            console.warn(`[GeminiAdapter] key #${ki} got 429, trying next key...`);
            continue;
          }
          console.warn(`[GeminiAdapter] key #${ki} error ${res.status}, trying next...`);
        } catch (e: any) {
          lastError = e.message || String(e);
          console.warn(`[GeminiAdapter] network error:`, e);
        }
      }
      
      if (attempt < maxRetries - 1) {
        const waitMs = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, waitMs));
      }
    }

    if (seenRateLimit) {
      throw new Error(`RATE_LIMIT`);
    }
    throw new Error(`Gemini failed all retries. Last error: ${lastError}`);
  }

  async *stream(input: any, context: AdapterContext): AsyncGenerator<string, void, unknown> {
    const { promptText, systemPromptText, chatHistory, image } = input;
    const geminiContents = [];
    if (chatHistory) {
      for (const msg of chatHistory) {
        geminiContents.push({ role: msg.role === 'model' ? 'model' : 'user', parts: [{ text: msg.content }] });
      }
    }
    const userParts: any[] = [{ text: promptText }];
    if (image) userParts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    geminiContents.push({ role: 'user', parts: userParts });

    const geminiPayload: any = { contents: geminiContents };
    if (systemPromptText) geminiPayload.systemInstruction = { parts: [{ text: systemPromptText }] };

    const allKeys = this.rctx.keys.allGemini;
    const model = this.rctx.model.model && this.rctx.model.model.includes('gemini') ? this.rctx.model.model : 'gemini-2.0-flash';
    let res: Response | null = null;
    let lastErr = '';

    for (let ki = 0; ki < allKeys.length; ki++) {
      const key = allKeys[(GeminiAdapter.keyIndex + ki) % allKeys.length];
      const aborter = new AbortController();
      const id = setTimeout(() => aborter.abort(), 15000);
      try {
        const attempt = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(geminiPayload), signal: aborter.signal
        });
        clearTimeout(id);
        if (attempt.ok) {
          GeminiAdapter.keyIndex = (GeminiAdapter.keyIndex + ki + 1) % allKeys.length;
          res = attempt;
          break;
        }
        lastErr = `HTTP ${attempt.status}`;
        if (attempt.status === 404 || attempt.status === 400) {
           throw new Error(`FATAL_CLIENT_ERROR: Gemini Model Not Found or Bad Request. ${lastErr}`);
        }
      } catch(e: any) {
        clearTimeout(id);
        lastErr = e.message;
        if (lastErr.includes('FATAL_CLIENT_ERROR')) throw e;
      }
    }
    
    if (!res) throw new Error(`Gemini exhausted. Last error: ${lastErr}`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No body");
    let buffer = '';
    let isThinking = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            const part = data.candidates?.[0]?.content?.parts?.[0];
            let content = part?.text || '';
            const partIsThought = !!part?.thought;
            if (content) {
              if (partIsThought && !isThinking) { content = '<think>\n' + content; isThinking = true; }
              else if (!partIsThought && isThinking) { content = '\n</think>\n\n' + content; isThinking = false; }
              yield content;
            }
          } catch(e) {}
        }
      }
    }
    if (isThinking) yield '\n</think>\n\n';
  }

  async healthCheck() {
    return await this.initialize();
  }

  async shutdown() {}
}

export class OpenAIAdapter implements CapabilityAdapter {
  name = 'OpenAIAdapter';
  type = 'AI' as const;
  private rctx: RuntimeContext;

  constructor(rctx: RuntimeContext) {
    this.rctx = rctx;
  }

  async initialize() {
    return !!this.rctx.keys.openAI;
  }

  async execute(input: any, context: AdapterContext): Promise<AdapterResult> {
    const { promptText, systemPromptText, chatHistory } = input;
    const answer = await callOpenAI(promptText, systemPromptText || '', chatHistory || [], undefined, this.rctx);
    return {
      result: answer,
      confidence: 0.9,
      source: 'openai',
      trace_id: context.trace_id
    };
  }

  async *stream(input: any, context: AdapterContext): AsyncGenerator<string, void, unknown> {
    const { promptText, systemPromptText, chatHistory } = input;
    const messages = [];
    if (systemPromptText) messages.push({ role: 'system', content: systemPromptText });
    if (chatHistory) {
       for (const msg of chatHistory) messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content });
    }
    messages.push({ role: 'user', content: promptText });

    const aborter = new AbortController();
    const id = setTimeout(() => aborter.abort(), 15000);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.rctx.keys.openAI}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.rctx.model.model || 'gpt-4o-mini', messages, temperature: 0.1, stream: true }),
      signal: aborter.signal
    });
    clearTimeout(id);
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
    yield* processOpenAIStream(res);
  }

  async healthCheck() {
    return await this.initialize();
  }

  async shutdown() {}
}
