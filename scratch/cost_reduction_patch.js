const fs = require('fs');
const path = require('path');

const memoryPath = path.join(__dirname, '../supabase/functions/agent-process/plugins/memory_manager_v1.ts');
const indexPath = path.join(__dirname, '../supabase/functions/agent-process/index.ts');

// --- 1. PATCH MEMORY MANAGER V1 ---
let memoryCode = `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export const getEmbedding = async () => []; // Disabled for cost saving

export const saveFactDirectly = async (fact, userId, supabaseUrl, supabaseKey) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('user_memories').insert([{ user_id: userId, summary: fact, embedding: null }]);
  } catch(e) { console.error('Memory save error', e); }
};

export const retrieveMemories = async (userPrompt, userId, supabaseUrl, supabaseKey) => {
  if (!userId || userPrompt.trim().length < 4) return '';
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    // NON-AI Retrieval: just get the latest 5 facts to save tokens and avoid embedding API
    const { data } = await supabase.from('user_memories').select('summary').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
    if (!data || data.length === 0) return '';
    const memoryTexts = data.map(d => '- ' + d.summary).join('\\n');
    return '\\n\\n[MEMORI USER]:\\n' + memoryTexts + '\\n';
  } catch (e) {
    return '';
  }
};

export const processAndSaveMemory = async (userPrompt, aiResponse, userId, supabaseUrl, supabaseKey) => {
  if (!userId || !userPrompt) return;
  const lower = userPrompt.toLowerCase();
  // RULE-BASED ONLY (NO AI CLASSIFIER / SUMMARIZER)
  if (lower.includes('ingat') || lower.includes('nama saya') || lower.includes('panggil saya') || lower.includes('saya suka')) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('user_memories').insert([{ user_id: userId, summary: userPrompt.substring(0, 200), embedding: null }]);
    } catch(e) { console.error(e); }
  }
};
`;
fs.writeFileSync(memoryPath, memoryCode);


// --- 2. PATCH INDEX.TS ---
let indexCode = fs.readFileSync(indexPath, 'utf8');

// A. Remove cascade and multiple retries to enforce single call & fast fail
indexCode = indexCode.replace(
  /const callLLMWithCascade = async[\s\S]*?throw new Error\('Semua provider AI sedang limit\/gangguan[\s\S]*?\};\n/m,
  `const callLLMWithCascade = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
  try {
    // SINGLE CALL ONLY. No cascade, no retries.
    const res = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=\${allGeminiKeys[0] || GEMINI_API_KEY}\`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [...chatHistory.map(m => ({ role: m.role==='model'?'model':'user', parts: [{text: m.content}] })), { role: 'user', parts: [{text: promptText}] }],
        systemInstruction: { parts: [{text: systemPromptText}] }
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error('API failed');
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (e) {
    throw e;
  }
};
`
);

// B. Force isChatBiasa = true to completely disable router and agents
indexCode = indexCode.replace(
  /if \(tools && tools\.length > 0\) \{[\s\S]*?\/\/ --- INTENT ROUTER[\s\S]*?let isChatBiasa = false;[\s\S]*?if \(isChatBiasa\) \{/m,
  `if (tools || !tools) {
      const isChatBiasa = true; // FORCE DISABLE MULTI-AGENT
      if (isChatBiasa) {`
);

// C. Truncate history aggressively (last 4 messages only)
indexCode = indexCode.replace(
  /if \(history && history\.length > 15\) \{[\s\S]*?\}\n/m,
  `if (history && history.length > 4) { history = history.slice(-4); }\n`
);

// D. Clean up verbose system prompt
indexCode = indexCode.replace(
  /let agentIdentityPrompt = `\\nKONTEKS WAKTU HARI INI[\s\S]*?Jika user menanyakan jumlah atau nama sub-agent Anda, sebutkan nama-nama di atas\.`;/m,
  `let agentIdentityPrompt = "\\nAnda adalah Mamet, asisten AI cerdas. Jawab dengan ringkas dan langsung.";`
);

// E. Simplify the global catch to match the exact requirement
indexCode = indexCode.replace(
  /return new Response\(JSON\.stringify\(\{ success: false[\s\S]*?\}\);/m,
  `return new Response(JSON.stringify({ success: false, fallback_response: "system busy" }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });`
);

fs.writeFileSync(indexPath, indexCode);
console.log('Massive cost reduction patch applied!');
