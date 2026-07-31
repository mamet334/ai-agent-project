const fs = require('fs');
const indexFile = 'd:\\\\SLAMET\\\\other\\\\ai-agent-project\\\\supabase\\\\functions\\\\agent-process\\\\index.ts';
const knowledgeManagerFile = 'd:\\\\SLAMET\\\\other\\\\ai-agent-project\\\\supabase\\\\functions\\\\agent-process\\\\plugins\\\\knowledge_manager.ts';

// --- 1. Fix index.ts ---
let content = fs.readFileSync(indexFile, 'utf-8');

// Update MametExecutionContext
content = content.replace(
    'policy: { mode: "AI" | "LITE"; decision: "ALLOW" | "ALLOW_WITH_LIMIT" | "BLOCK"; toolsEnabled: boolean; webSearchEnabled: boolean; riskScore: number; ragTopK: number; ragThreshold: number; webHint?: string; };',
    'policy: { mode: "AI" | "LITE"; decision: "ALLOW" | "ALLOW_WITH_LIMIT" | "BLOCK"; toolsEnabled: boolean; webSearchEnabled: boolean; riskScore: number; ragTopK: number; ragThreshold: number; webHint?: string; canReadRAG: boolean; canReadMemory: boolean; canWriteMemory: boolean; canWriteKnowledge: boolean; canUseWorkspace: boolean; canUseAutomation: boolean; canUseDesktopTools: boolean; };'
);

// Update buildUnifiedExecutionContext ctx creation
const oldPolicyInit = `policy: { 
        mode, decision: "ALLOW", toolsEnabled: true, webSearchEnabled: true, 
        riskScore: 0, ragTopK: mode === "LITE" ? 10 : 5, ragThreshold: dynamicThreshold, webHint 
    },`;
const newPolicyInit = `policy: { 
        mode, decision: "ALLOW", toolsEnabled: true, webSearchEnabled: true, 
        riskScore: 0, ragTopK: mode === "LITE" ? 10 : 5, ragThreshold: dynamicThreshold, webHint,
        canReadRAG: true, canReadMemory: true, canWriteMemory: mode === "AI",
        canWriteKnowledge: mode === "AI", canUseWorkspace: true, canUseAutomation: mode === "AI",
        canUseDesktopTools: mode === "AI"
    },`;
content = content.replace(oldPolicyInit, newPolicyInit);

// Update Desktop native prompt
content = content.replace('if (desktopOSMode) {', 'if (ctx.policy.canUseDesktopTools) {');
// Wait, there's another check for desktopOSMode:
// if (desktopOSMode && !systemPromptText.includes('DESKTOP NATIVE AWARENESS ENABLED'))
// We can leave that as is or change to canUseDesktopTools. Let's do it cleanly:
content = content.replace('if (desktopOSMode && !systemPromptText.includes(\'DESKTOP NATIVE AWARENESS ENABLED\')) {', 'if (ctx.policy.canUseDesktopTools && !systemPromptText.includes(\'DESKTOP NATIVE AWARENESS ENABLED\')) {');
content = content.replace('const isDesktopLocalRequest = desktopOSMode && desktopLocalKeywords.some', 'const isDesktopLocalRequest = ctx.policy.canUseDesktopTools && desktopLocalKeywords.some');

// Add Tool filtering based on capabilities
const toolFilterAnchor = `tools = guardian.filterTools(tools, storageTarget);`;
const toolFilterInject = `tools = guardian.filterTools(tools, storageTarget);
    
    // Capability Filter
    if (tools && Array.isArray(tools)) {
      tools = tools.filter(t => {
        if (t === 'cron_manager' && !ctx.policy.canUseAutomation) return false;
        if (t === 'file_analyzer' && !ctx.policy.canUseDesktopTools) return false;
        // Tools requiring canWriteKnowledge are handled inside the plugin (since knowledge_manager handles both read and write)
        return true;
      });
    }`;
content = content.replace(toolFilterAnchor, toolFilterInject);

// Re-add Memory Write protection using capability
content = content.replace(
    'await safeFireAndTrack(\'MemoryWriteQueue_A\', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));',
    'if (ctx.policy.canWriteMemory) await safeFireAndTrack(\'MemoryWriteQueue_A\', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));'
);
content = content.replace(
    'await safeFireAndTrack(\'MemoryWriteQueue_B\', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));',
    'if (ctx.policy.canWriteMemory) await safeFireAndTrack(\'MemoryWriteQueue_B\', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));'
);

// Inject policy into plugin execution context
const execAnchor = `const executeContext = { 
                      task: fullTask, cleanTask: task, accumulatedContext, 
                      env: { ...env, signal: abortController.signal, fetch: controlledFetch }, 
                      runLLM: customRunLLM, userId, signal: abortController.signal 
                  };`;
const newExecAnchor = `const executeContext = { 
                      task: fullTask, cleanTask: task, accumulatedContext, 
                      env: { ...env, signal: abortController.signal, fetch: controlledFetch }, 
                      runLLM: customRunLLM, userId: ctx.auth.userId, signal: abortController.signal, policy: ctx.policy 
                  };`;
content = content.replace(execAnchor, newExecAnchor);

fs.writeFileSync(indexFile, content, 'utf-8');

// --- 2. Fix knowledge_manager.ts ---
let kmContent = fs.readFileSync(knowledgeManagerFile, 'utf-8');

kmContent = kmContent.replace(
    'const { task, env, userId, accumulatedContext } = context;',
    'const { task, env, userId, accumulatedContext, policy } = context;'
);

const actionCheckAnchor = 'switch (action) {';
const newActionCheck = `const writeActions = ['CREATE_WORKSPACE', 'SAVE_TO_WORKSPACE', 'DELETE_WORKSPACE', 'UPDATE_WORKSPACE_SUMMARY'];
      if (writeActions.includes(action) && policy && !policy.canWriteKnowledge) {
          return { output: \`Akses Ditolak (MametLite): Fitur modifikasi workspace (Write/Delete) dinonaktifkan.\`, sources: [] };
      }
      
      switch (action) {`;
kmContent = kmContent.replace(actionCheckAnchor, newActionCheck);

fs.writeFileSync(knowledgeManagerFile, kmContent, 'utf-8');
