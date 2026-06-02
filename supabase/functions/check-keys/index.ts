const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const results: any = {};

  // Check Gemini Keys
  const geminiKeys = (Deno.env.get('GEMINI_API_KEY') || '').split(',').map(k => k.trim()).filter(k => k);
  results.gemini_keys_count = geminiKeys.length;
  results.gemini_keys_status = [];
  
  for (let i = 0; i < geminiKeys.length; i++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKeys[i]}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'say hi' }] }] })
      });
      results.gemini_keys_status.push({
        key_index: i,
        key_preview: geminiKeys[i].substring(0, 8) + '...',
        status: res.status,
        ok: res.ok
      });
    } catch (e: any) {
      results.gemini_keys_status.push({ key_index: i, status: 'error', error: e.message });
    }
  }

  // Check Groq
  const groqKey = Deno.env.get('GROQ_API_KEY') || '';
  results.groq_key_exists = !!groqKey;
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'say hi' }], max_tokens: 5 })
      });
      results.groq_status = res.status;
      results.groq_ok = res.ok;
    } catch (e: any) {
      results.groq_status = 'error';
      results.groq_error = e.message;
    }
  }

  // Check OpenRouter
  const orKey = Deno.env.get('OPENROUTER_API_KEY') || '';
  results.openrouter_key_exists = !!orKey;

  // Check OpenAI
  const oaiKey = Deno.env.get('OPENAI_API_KEY') || '';
  results.openai_key_exists = !!oaiKey;

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
