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
    const { data } = await supabase.from('user_memories').select('summary').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    if (!data || data.length === 0) return '';
    
    const keywords = userPrompt.toLowerCase().split(/\\s+/).filter(w => w.length > 4);
    let matchedMemories = [];
    if (keywords.length > 0) {
      matchedMemories = data.filter(d => keywords.some(kw => d.summary.toLowerCase().includes(kw)));
    }
    if (matchedMemories.length === 0) matchedMemories = data.slice(0, 3);
    
    // CONTEXT HARD LIMIT: Max 5 items
    matchedMemories = matchedMemories.slice(0, 5);
    let memoryTexts = matchedMemories.map(d => '- ' + d.summary).join('\\n');
    
    // CONTEXT HARD LIMIT: Max 2000 chars
    if (memoryTexts.length > 2000) {
       memoryTexts = memoryTexts.substring(0, 2000) + '...';
    }
    
    return '\\n\\n[MEMORI USER]:\\n' + memoryTexts + '\\n';
  } catch (e) {
    return '';
  }
};

export const processAndSaveMemory = async (userPrompt, aiResponse, userId, supabaseUrl, supabaseKey) => {
  if (!userId || !userPrompt) return;
  const lower = userPrompt.toLowerCase();
  if (lower.includes('ingat') || lower.includes('nama saya') || lower.includes('panggil saya') || lower.includes('saya suka') || lower.includes('jangan lupa')) {
    try {
      console.log('[COST LEAK DETECTION] memoryWriteCount: 1');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('user_memories').insert([{ user_id: userId, summary: userPrompt.substring(0, 200), embedding: null }]);
    } catch(e) { console.error(e); }
  }
};
`;
fs.writeFileSync(memoryPath, memoryCode);


// --- 2. PATCH INDEX.TS (HARD COST SHIELD) ---
let indexCode = fs.readFileSync(indexPath, 'utf8');

// Insert request-scoped LLM Call Counter
if (!indexCode.includes('let llmCallCount = 0;')) {
  indexCode = indexCode.replace(
    /let extractedImage = null;/g,
    `let llmCallCount = 0;\n    let extractedImage = null;`
  );
}

// Modify the LLM fetch to include the hard stop
indexCode = indexCode.replace(
  /const callLLMWithCascade = async \(promptText: string, systemPromptText = '', chatHistory: any\[\] = \[\]\) => \{[\s\S]*?try \{/m,
  `const callLLMWithCascade = async (promptText: string, systemPromptText = '', chatHistory: any[] = []) => {
  try {
    llmCallCount++;
    console.log('[COST LEAK DETECTION] llmCallCount: ' + llmCallCount);
    if (llmCallCount > 1) {
       console.error('[HARD COST SHIELD] Blocked secondary LLM call!');
       throw new Error('HARD_COST_LIMIT: Only 1 LLM call allowed per request');
    }`
);

// Truncate user prompt to max 3000 chars
indexCode = indexCode.replace(
  /let finalMessage = message;/g,
  `let finalMessage = message ? message.substring(0, 3000) : '';`
);

fs.writeFileSync(indexPath, indexCode);
console.log('HARD COST SHIELD patch applied!');
