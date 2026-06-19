const fs = require('fs');
const path = require('path');

const memoryPath = path.join(__dirname, '../supabase/functions/agent-process/plugins/memory_manager_v1.ts');
let memoryCode = fs.readFileSync(memoryPath, 'utf8');

// Replace the old simple saveKeywords check with a robust Regex-based system
const oldSaveLogicRegex = /const saveKeywords = \['ingat', 'nama saya', 'panggil saya', 'saya suka', 'jangan lupa', 'favorit saya', 'saya alergi', 'kebiasaan saya', 'catat ini', 'penting:'\];\s+const shouldSave = saveKeywords\.some\(kw => lower\.includes\(kw\)\);/m;

const newSaveLogic = `// SMART RULE-BASED EXTRACTION (NO AI COST)
  // Menangkap berbagai intent: Project, Task, Deadline, Research, Personal
  const memoryRegex = /(?:ingat|nama saya|panggil saya|saya suka|jangan lupa|favorit saya|saya alergi|kebiasaan saya|catat ini|penting:|project saya|tugas saya|deadline|tenggat waktu|harus selesai|riset|catatan riset|besok saya harus|jadwal|target|fokus hari ini)/i;
  
  const shouldSave = memoryRegex.test(lower);`;

if (memoryCode.match(oldSaveLogicRegex)) {
  memoryCode = memoryCode.replace(oldSaveLogicRegex, newSaveLogic);
  fs.writeFileSync(memoryPath, memoryCode);
  console.log('Smart Memory Extraction patch applied!');
} else {
  // Fallback if the exact string doesn't match
  memoryCode = memoryCode.replace(
    /const saveKeywords = \[.*?\];\s*const shouldSave = saveKeywords\.some\(kw => lower\.includes\(kw\)\);/s,
    newSaveLogic
  );
  fs.writeFileSync(memoryPath, memoryCode);
  console.log('Smart Memory Extraction patch applied (fallback)!');
}
