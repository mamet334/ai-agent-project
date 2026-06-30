const fs = require('fs');
const file = 'supabase/functions/agent-process/lib/orchestration/core_engine.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Add imports
const imports = `import { MAEFExecutionResult, MAEFExecutionContext } from '../maef/maef_contract.ts';\nimport { MAEFStateMachine } from '../maef/maef_state_machine.ts';\n`;
if (!content.includes('maef_contract.ts')) {
    content = imports + content;
}

// 2. Change execute signature and init MAEF
content = content.replace(
    /async execute\(ctx: any, rctx: any\) \{/,
    `async execute(ctx: any, rctx: any): Promise<MAEFExecutionResult> {
    const maef = new MAEFStateMachine();
    maef.transition('INIT', 'Engine Initialization');`
);

// 3. Inject Transitions
// Context Build
content = content.replace(
    /    \/\/ --- RAG PIPELINE \(FACADE\) ---/,
    `    // --- RAG PIPELINE (FACADE) ---
    maef.transition('CONTEXT_BUILD', 'Starting Context Building Phase');`
);

// Orchestration (Coordinator)
content = content.replace(
    /      let planText = '\[\]';\s*let plan: any\[\] = \[\];\s*ctx\.state\.processingSteps\.push\('🤖 Kepala Agent \(Coordinator\): Merencanakan strategi\.\.\.'\);/,
    `      let planText = '[]';
      let plan: any[] = [];
      maef.transition('ORCHESTRATION', 'Starting Execution Planning');
      ctx.state.processingSteps.push('🤖 Kepala Agent (Coordinator): Merencanakan strategi...');`
);

// Tool Execution
content = content.replace(
    /        \/\/ --- PHASE 4: CONTROLLED ORCHESTRATION & BUDGET ENFORCEMENT ---/,
    `        // --- PHASE 4: CONTROLLED ORCHESTRATION & BUDGET ENFORCEMENT ---
        maef.transition('TOOL_EXECUTION', 'Starting Sub-agent Execution Graph');`
);

// Post Processing Synthesis
content = content.replace(
    /        const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent\./,
    `        maef.transition('POST_PROCESSING', 'Starting Final Synthesis');
        const synthesisPrompt = \`Anda telah menugaskan beberapa sub-agent.`
);

// 4. Update ALL returns to include snapshot: maef.getSnapshot()
// return { mode: 'STREAM', type: 'BLOCKED', blockedMsg };
content = content.replace(
    /return \{ mode: 'STREAM', type: 'BLOCKED', blockedMsg \};/g,
    `return { mode: 'STREAM', type: 'BLOCKED', blockedMsg, snapshot: maef.getSnapshot() };`
);

// return { mode: 'DIRECT', aiResponse: { message: blockedMsg } };
content = content.replace(
    /return \{ mode: 'DIRECT', aiResponse: \{ message: blockedMsg \} \};/g,
    `return { mode: 'DIRECT', aiResponse: { message: blockedMsg }, snapshot: maef.getSnapshot() };`
);

// return { mode: 'STREAM', type: 'LLM', ... };
content = content.replace(
    /return \{ mode: 'STREAM', type: 'LLM', (.*?) \};/g,
    `return { mode: 'STREAM', type: 'LLM', $1, snapshot: maef.getSnapshot() };`
);

// return { mode: 'DIRECT', aiResponse: { message: "Verification Failed" } };
content = content.replace(
    /return \{ mode: 'DIRECT', aiResponse: \{ message: "Verification Failed" \} \};/g,
    `return { mode: 'DIRECT', aiResponse: { message: "Verification Failed" }, snapshot: maef.getSnapshot() };`
);

// return { mode: 'DIRECT', aiResponse };
content = content.replace(
    /return \{ mode: 'DIRECT', aiResponse \};/g,
    `maef.transition('COMPLETED', 'Execution Completed');\n    return { mode: 'DIRECT', aiResponse, snapshot: maef.getSnapshot() };`
);

// 5. Update index.ts to just take snapshot from result
const indexFile = 'supabase/functions/agent-process/index.ts';
let indexContent = fs.readFileSync(indexFile, 'utf8');
// It doesn't actually need much update because index.ts just pipes it to stream_controller.
// But we should pass snapshot to stream_controller if we want, or stream_controller ignores it.
// stream_controller currently doesn't require snapshot, it just checks result.mode.
// But wait, the return type of pipe is Response.
// We should update stream_controller.ts to accept MAEFExecutionResult.

fs.writeFileSync(file, content);
console.log('MAEF Core Engine patching complete.');
