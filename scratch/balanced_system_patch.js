const fs = require('fs');
const path = require('path');

const memoryPath = path.join(__dirname, '../supabase/functions/agent-process/plugins/memory_manager_v1.ts');
const indexPath = path.join(__dirname, '../supabase/functions/agent-process/index.ts');

// --- 1. PATCH MEMORY MANAGER V1 ---
let memoryCode = `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export const getEmbedding = async () => []; // HARD COST SHIELD: NO AI

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
    console.log('[COST LEAK DETECTION] memoryFetchCount: 1');
    // Ambil max 10 memory terakhir
    const { data } = await supabase.from('user_memories').select('summary, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
    if (!data || data.length === 0) return '';
    
    // Lightweight Scoring System (NO AI)
    const promptLower = userPrompt.toLowerCase();
    const keywords = promptLower.split(/[\\s\\p{P}]+/).filter(w => w.length > 3);
    
    // Deduplikasi berdasar isi teks
    const uniqueMemoriesMap = new Map();
    for (const d of data) {
       if (!uniqueMemoriesMap.has(d.summary.toLowerCase())) {
          uniqueMemoriesMap.set(d.summary.toLowerCase(), d);
       }
    }
    const uniqueMemories = Array.from(uniqueMemoriesMap.values());
    
    const scoredMemories = uniqueMemories.map((mem, index) => {
       let score = 0;
       const memLower = mem.summary.toLowerCase();
       
       // Exact match (+5)
       if (promptLower.includes(memLower) || memLower.includes(promptLower)) {
          score += 5;
       }
       
       // Keyword match (+2 per keyword)
       for (const kw of keywords) {
          if (memLower.includes(kw)) score += 2;
       }
       
       // Recent memory (+1) - index 0 is most recent
       if (index < 3) score += 1;
       
       return { ...mem, score };
    });
    
    // Sort by score (descending) and take top 5
    scoredMemories.sort((a, b) => b.score - a.score);
    const topMemories = scoredMemories.slice(0, 5);
    
    if (topMemories.length === 0 || topMemories[0].score === 0) {
       // If no relevance, return top 3 most recent
       return '\\n\\n[MEMORI USER]:\\n' + data.slice(0, 3).map(d => '- ' + d.summary).join('\\n') + '\\n';
    }
    
    let memoryTexts = topMemories.map(d => '- ' + d.summary).join('\\n');
    
    // CONTEXT HARD LIMIT: Max 3000 chars
    if (memoryTexts.length > 3000) {
       memoryTexts = memoryTexts.substring(0, 3000) + '...';
    }
    
    return '\\n\\n[MEMORI USER]:\\n' + memoryTexts + '\\n';
  } catch (e) {
    return '';
  }
};

export const processAndSaveMemory = async (userPrompt, aiResponse, userId, supabaseUrl, supabaseKey) => {
  if (!userId || !userPrompt) return;
  const lower = userPrompt.toLowerCase();
  
  // HANYA simpan jika mengandung info personal, preferensi, fakta penting (NO AI)
  const saveKeywords = ['ingat', 'nama saya', 'panggil saya', 'saya suka', 'jangan lupa', 'favorit saya', 'saya alergi', 'kebiasaan saya', 'catat ini', 'penting:'];
  const shouldSave = saveKeywords.some(kw => lower.includes(kw));
  
  if (shouldSave) {
    try {
      console.log('[COST LEAK DETECTION] memoryWriteCount: 1');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('user_memories').insert([{ user_id: userId, summary: userPrompt.substring(0, 300), embedding: null }]);
    } catch(e) { console.error(e); }
  }
};
`;
fs.writeFileSync(memoryPath, memoryCode);


// --- 2. PATCH INDEX.TS (SAFE RETRY & SMART FEEL) ---
let indexCode = fs.readFileSync(indexPath, 'utf8');

// Modify the LLM fetch to include 1 Safe Retry for network timeouts
indexCode = indexCode.replace(
  /const callLLMWithCascade = async \(promptText: string, systemPromptText = '', chatHistory: any\[\] = \[\]\) => \{[\s\S]*?const data = await res\.json\(\);/m,
  `const callLLMWithCascade = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
  try {
    llmCallCount++;
    console.log('[COST LEAK DETECTION] llmCallCount: ' + llmCallCount);
    if (llmCallCount > 1) {
       console.error('[HARD COST SHIELD] Blocked secondary LLM call!');
       throw new Error('HARD_COST_LIMIT: Only 1 LLM call allowed per request');
    }
    
    // 1 RETRY MAX untuk network timeout
    let attempt = 0;
    let res;
    while(attempt < 2) {
      try {
        res = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=\${allGeminiKeys[0] || GEMINI_API_KEY}\`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [...chatHistory.map(m => ({ role: m.role==='model'?'model':'user', parts: [{text: m.content}] })), { role: 'user', parts: [{text: promptText}] }],
            systemInstruction: { parts: [{text: systemPromptText}] }
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) break; // Berhasil, keluar dari loop retry
        if (res.status !== 429 && res.status >= 500) {
           throw new Error('Server Error'); // Lempar untuk di-retry jika masih attempt 0
        }
        break; // Jika bukan 5xx, tidak perlu retry
      } catch (err) {
        if (attempt === 1) throw err; // Jika sudah retry 1x dan tetap gagal
        console.warn('[SAFE RETRY] Network timeout/error, retrying exactly 1 time...');
      }
      attempt++;
    }
    
    if (!res || !res.ok) throw new Error('API failed after retry');
    const data = await res.json();`
);

fs.writeFileSync(indexPath, indexCode);
console.log('Balanced System patch applied!');
