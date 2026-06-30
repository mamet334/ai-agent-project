const fs = require('fs');
const file = 'supabase/functions/agent-process/lib/streaming/stream_controller.ts';
let content = fs.readFileSync(file, 'utf8');

const imports = `import { MAEFExecutionResult } from '../maef/maef_contract.ts';\n`;
if (!content.includes('maef_contract.ts')) {
    content = imports + content;
}

content = content.replace(
    /pipe\(result: any, rctx: any\): Response/,
    `pipe(result: MAEFExecutionResult, rctx: any): Response`
);

fs.writeFileSync(file, content);
console.log('Stream Controller patched.');
