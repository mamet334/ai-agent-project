const fs = require('fs');
const path = require('path');

const memoryPath = path.join(__dirname, '../supabase/functions/agent-process/plugins/memory_manager_v1.ts');
let code = fs.readFileSync(memoryPath, 'utf8');

// Replace the imports to ensure we have the things we need
code = code.replace(
  /import \{ createClient \} from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2\.39\.3';/g,
  `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Helper to log audits asynchronously
const logMemoryAudit = (supabaseUrl, supabaseKey, payload) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    supabase.from('memory_audit_logs').insert([payload]).then(({error}) => {
      if (error) console.error("Audit log insert error:", error);
    });
  } catch(e) {
    console.error("Audit log setup error:", e);
  }
};`
);

// Patch retrieveMemories
code = code.replace(
  /export const retrieveMemories = async \(userPrompt, userId, supabaseUrl, supabaseKey\) => \{[\s\S]*?try \{/m,
  `export const retrieveMemories = async (userPrompt, userId, supabaseUrl, supabaseKey) => {
  const startTime = Date.now();
  if (!userId || userPrompt.trim().length < 4) {
     logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_failed', status: 'FAILED', reason: 'query_too_short', query: userPrompt, execution_time_ms: Date.now() - startTime });
     return '';
  }
  try {`
);

// At the end of retrieveMemories success
code = code.replace(
  /return '\\n\\n\[MEMORI USER\]:\\n' \+ memoryTexts \+ '\\n';/g,
  `const latencyMs = Date.now() - startTime;
    
    // DETECT INTENT UNTUK REPORTING/LOOKUP (Rule-based)
    const promptLower = userPrompt.toLowerCase();
    if (promptLower.includes('deadline')) {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'deadline_lookup', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    } else if (promptLower.includes('tugas')) {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'task_lookup', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    } else if (promptLower.includes('laporan')) {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'report_generation', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    } else {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_success', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    }
    
    return '\\n\\n[MEMORI USER]:\\n' + memoryTexts + '\\n';`
);

// Inside catch block of retrieveMemories
code = code.replace(
  /return '';\n  \}\n\};/m,
  `logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_failed', status: 'FAILED', reason: e.message, query: userPrompt, execution_time_ms: Date.now() - startTime });
    return '';
  }
};`
);

// Patch processAndSaveMemory
code = code.replace(
  /export const processAndSaveMemory = async \(userPrompt, aiResponse, userId, supabaseUrl, supabaseKey\) => \{[\s\S]*?try \{/m,
  `export const processAndSaveMemory = async (userPrompt, aiResponse, userId, supabaseUrl, supabaseKey) => {
  const startTime = Date.now();
  if (!userId || !userPrompt) {
     logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_failed', status: 'FAILED', reason: 'missing_user_or_prompt', query: userPrompt, execution_time_ms: Date.now() - startTime });
     return;
  }
  const lower = userPrompt.toLowerCase();
  
  // SMART RULE-BASED EXTRACTION (NO AI COST)
  const memoryRegex = /(?:ingat|nama saya|panggil saya|saya suka|jangan lupa|favorit saya|saya alergi|kebiasaan saya|catat ini|penting:|project saya|tugas saya|deadline|tenggat waktu|harus selesai|riset|catatan riset|besok saya harus|jadwal|target|fokus hari ini)/i;
  
  const shouldSave = memoryRegex.test(lower);
  
  if (shouldSave) {
    try {`
);

// Inside try block of processAndSaveMemory
code = code.replace(
  /await supabase\.from\('user_memories'\)\.insert\(\[\{ user_id: userId, summary: userPrompt\.substring\(0, 300\), embedding: null \}\]\);/g,
  `await supabase.from('user_memories').insert([{ user_id: userId, summary: userPrompt.substring(0, 300), embedding: null }]);
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_success', status: 'SUCCESS', query: userPrompt, execution_time_ms: Date.now() - startTime });`
);

// Inside catch block of processAndSaveMemory
code = code.replace(
  /\} catch\(e\) \{ console\.error\(e\); \}\n  \}\n\};/m,
  `} catch(e) { 
      console.error(e); 
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_failed', status: 'FAILED', reason: e.message, query: userPrompt, execution_time_ms: Date.now() - startTime });
    }
  } else {
    // If not matching regex, log as skip so we can analyze coverage
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'no_keyword_match', query: userPrompt, execution_time_ms: Date.now() - startTime });
  }
};`
);

fs.writeFileSync(memoryPath, code);
console.log('Memory Audit Logging applied!');
