const fs = require('fs');
const filePath = 'd:\\\\SLAMET\\\\other\\\\ai-agent-project\\\\supabase\\\\functions\\\\agent-process\\\\index.ts';
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  'ctx.state.memoryArray = ctx.policy.mode === "LITE" ? [] : await retrieveMemories',
  'ctx.state.memoryArray = await retrieveMemories'
);

content = content.replace(
  'if (ctx.policy.mode !== "LITE") await safeFireAndTrack(\'MemoryWriteQueue_A\'',
  'await safeFireAndTrack(\'MemoryWriteQueue_A\''
);

content = content.replace(
  'if (ctx.policy.mode !== "LITE") await safeFireAndTrack(\'MemoryWriteQueue_B\'',
  'await safeFireAndTrack(\'MemoryWriteQueue_B\''
);

fs.writeFileSync(filePath, content, 'utf-8');
