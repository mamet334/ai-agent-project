// patch memory_manager_v1.ts for trace logging
const fs = require('fs');
const path = require('path');

const memoryFile = path.join(__dirname, '../supabase/functions/agent-process/plugins/memory_manager_v1.ts');
let code = fs.readFileSync(memoryFile, 'utf8');

if (!code.includes('[MEMORY_CALL]')) {
  const target = `export const processAndSaveMemory = async (userPrompt, aiResponse, userId, supabaseUrl, supabaseKey) => {
  const startTime = Date.now();`;
  
  const replace = `export const processAndSaveMemory = async (userPrompt, aiResponse, userId, supabaseUrl, supabaseKey) => {
  console.log("[MEMORY_CALL]", {
    time: Date.now(),
    message: userPrompt,
    stack: new Error().stack
  });
  const startTime = Date.now();`;
  
  code = code.replace(target, replace);
  
  const target2 = `await supabase.from('user_memories').insert([{ user_id: userId, summary: userPrompt.substring(0, 300), embedding: null }]);
      console.log('[MEMORY_SAVE_SUCCESS]');`;
      
  const replace2 = `console.log("[MEMORY_INSERT_ATTEMPT]", {
        userId,
        message: userPrompt,
        timestamp: Date.now()
      });
      await supabase.from('user_memories').insert([{ user_id: userId, summary: userPrompt.substring(0, 300), embedding: null }]);
      console.log("[MEMORY_INSERT_SUCCESS]");`;
      
  code = code.replace(target2, replace2);
  fs.writeFileSync(memoryFile, code);
}
console.log('patched memory_manager_v1.ts');
