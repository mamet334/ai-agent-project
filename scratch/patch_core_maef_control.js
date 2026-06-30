const fs = require('fs');
const file = 'supabase/functions/agent-process/lib/orchestration/core_engine.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Inject Control Plane Evaluation right after Context Build decides 'isChatBiasa'
content = content.replace(
    /      let isChatBiasa = false;/,
    `      let isChatBiasa = false;`
);

content = content.replace(
    /      if \(isChatBiasa\) \{/,
    `      // --- CONTROL PLANE DELEGATION ---
      maef.evaluatePhaseResult('CONTEXT_BUILD', { isChatBiasa });

      if (!maef.shouldExecutePhase('ORCHESTRATION')) {`
);

// 2. Change the else block for Orchestration
content = content.replace(
    /      \} else \{\s*let coordinatorSystemPrompt/,
    `      } 
      
      if (maef.shouldExecutePhase('ORCHESTRATION')) {
        let coordinatorSystemPrompt`
);

// 3. We must also close the Orchestration block correctly!
// This is very dangerous via regex because of nested braces.
// Let's just use the shouldExecutePhase as a guard.
content = content.replace(
    /maef\.requestTransition\('ORCHESTRATION', 'Starting Execution Planning'\);/,
    `maef.requestTransition('ORCHESTRATION', 'Starting Execution Planning');`
);

fs.writeFileSync(file, content);
