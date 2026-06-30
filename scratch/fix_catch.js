const fs = require('fs');
const file = 'supabase/functions/agent-process/index.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('catch (error) {', 'catch (error: any) {');
fs.writeFileSync(file, content);
console.log('Success');
