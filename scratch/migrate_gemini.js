const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../supabase/functions/agent-process/index.ts');
let code = fs.readFileSync(filePath, 'utf8');

// Replace occurrences
let newCode = code.replace(/'gemini-1.5-pro'/g, "'gemini-2.5-flash'");

fs.writeFileSync(filePath, newCode);
console.log('Migration to gemini-2.5-flash completed.');
