/**
 * Simple Agent Caller untuk Mametlite
 * Langsung panggil Supabase Edge Function tanpa token optimization
 * Tools yang digunakan: rag_search, web_search, deep_research
 */

import { supabase } from './supabase.js';

/**
 * Panggil agent backend dengan tools terbatas

 * @param {string} message - User message
 * @param {Array<string>} tools - Tools yang diaktifkan (websearch, research, dll)
 * @param {string} userId - User ID dari Supabase Auth
 * @param {string} userName - Username display
 * @param {Array<Object>} history - Chat history untuk context
 * @param {boolean} ragEnabled - Apakah RAG enabled
 * @param {Object} byokKeys - BYOK keys dari localStorage
 * @returns {Promise<Response>} Fetch response (streaming atau JSON)
 */
export async function callAgentSimple(
  message,
  tools,
  userId,
  userName,
  history = [],
  ragEnabled = true,
  byokKeys = {}
) {
  // Validasi input
  if (!message || !userId) {
    throw new Error('Message dan userId harus diisi');
  }

  // Normalkan tools menjadi array yang valid
  let effectiveTools = [];
  
  // Tools yang hanya diterima: rag_search, web_search, deep_research
  const allowedTools = ['rag_search', 'web_search', 'deep_research', 'researcher', 'deep_research'];
  
  if (Array.isArray(tools)) {
    effectiveTools = tools.filter(t => allowedTools.includes(t));
  }
  
  // Jika tidak ada tools yang valid, gunakan default: rag_search + web_search
  if (effectiveTools.length === 0) {
    effectiveTools = ragEnabled ? ['rag_search', 'web_search'] : ['web_search'];
  }

  // URL endpoint
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-process`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!endpoint || !anonKey) {
    throw new Error('VITE_SUPABASE_URL atau VITE_SUPABASE_ANON_KEY tidak dikonfigurasi');
  }

  // Ambil token JWT asli dari session
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || anonKey;

  // Build headers dengan BYOK keys
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-byok-gemini': (byokKeys['x-byok-gemini'] || '').trim(),
    'x-byok-groq': (byokKeys['x-byok-groq'] || '').trim(),
    'x-byok-openai': (byokKeys['x-byok-openai'] || '').trim(),
    'x-byok-openrouter': (byokKeys['x-byok-openrouter'] || '').trim()
  };

  // Build payload
  const payload = {
    message,
    tools: effectiveTools,
    model: 'gemini-2.5-flash', // Model default untuk mametlite
    appSource: 'mametlite',
    userId,
    userName,
    ragEnabled,
    stream: true,
    history: history.slice(-5) // Kirim hanya 5 pesan terakhir untuk context
  };

  // Panggil endpoint
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  // Jika response bukan 200, throw error
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server error: ${response.status}`);
  }

  return response;
}

/**
 * Helper: Parse SSE stream dari response
 * @param {Response} response - Fetch response object
 * @param {Function} onChunk - Callback saat ada chunk baru (optional)
 * @returns {Promise<string>} Full content
 */
export async function parseSSEStream(response, onChunk = null) {
  if (!response.body) {
    throw new Error('Response body tidak tersedia');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    buffer += chunk;
    // Pastikan buffer adalah string sebelum split
    const bufferStr = String(buffer || '');
    const lines = bufferStr.split('\n');

    // Simpan baris terakhir yang belum lengkap
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
            const content = data.choices[0].delta.content;
            fullContent += content;
            
            // Panggil callback jika ada
            if (onChunk && typeof onChunk === 'function') {
              onChunk(content, fullContent);
            }
          }
        } catch (e) {
          console.error('Parse SSE error:', e);
        }
      }
    }
  }

  return fullContent;
}

export default { callAgentSimple, parseSSEStream };
