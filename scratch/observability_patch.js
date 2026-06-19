const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '../supabase/functions/agent-process/index.ts');

let indexCode = fs.readFileSync(indexPath, 'utf8');

// --- 1. SETUP OBSERVABILITY VARIABLES AT REQUEST START ---
if (!indexCode.includes('const obs = {')) {
  indexCode = indexCode.replace(
    /let extractedImage = null;/g,
    `let extractedImage = null;
    const obs = {
      startTime: Date.now(),
      llmCallCount: 0,
      modelUsed: 'gemini-1.5-pro',
      memoryFetchCount: 0,
      memoryWriteCount: 0,
      errorFlag: false,
      costAlertFlag: false,
      retryCount: 0
    };`
  );
}

// Replace llmCallCount references
indexCode = indexCode.replace(/let llmCallCount = 0;/g, '');
indexCode = indexCode.replace(/llmCallCount\+\+/g, 'obs.llmCallCount++');
indexCode = indexCode.replace(/llmCallCount/g, 'obs.llmCallCount');

// Update memory calls to increment obs variables
// Since memory functions are imported, we can track them in index.ts around the function calls
indexCode = indexCode.replace(
  /const dynamicMemory = await retrieveMemories\([\s\S]*?\);/m,
  `obs.memoryFetchCount++;\n    const dynamicMemory = await retrieveMemories(finalMessage, userId, Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', GEMINI_API_KEY);`
);

// We replaced processAndSaveMemory previously. Let's make sure it increments.
indexCode = indexCode.replace(
  /const memoryPromise3 = processAndSaveMemory\([\s\S]*?;\n/m,
  `const memoryPromise3 = processAndSaveMemory(message, "[Direct Chat - AI Respons]", userId, Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', GEMINI_API_KEY, GROQ_API_KEY).then(() => { obs.memoryWriteCount++; }).catch(e => console.error(e));\n`
);

// --- 2. UPDATE SAFE RETRY BLOCK FOR OBSERVABILITY ---
indexCode = indexCode.replace(
  /console\.warn\('\[SAFE RETRY\] Network timeout\/error, retrying exactly 1 time\.\.\.'\);/g,
  `obs.retryCount++;\n        obs.costAlertFlag = true;\n        console.warn('[SAFE RETRY] Network timeout/error, retrying exactly 1 time...');`
);

// --- 3. FINAL OBSERVABILITY LOG & DB INSERT ---
const finalLogSnippet = `
    const latencyMs = Date.now() - obs.startTime;
    if (obs.llmCallCount > 1 || latencyMs > 8000 || obs.retryCount > 0) {
       obs.costAlertFlag = true;
       console.warn('[COST_ALERT] Inefficient request detected: ', JSON.stringify({ llmCalls: obs.llmCallCount, latencyMs, retries: obs.retryCount }));
    }

    const logPayload = {
      user_id: userId || null,
      llm_call_count: obs.llmCallCount,
      model_used: obs.modelUsed,
      latency_ms: latencyMs,
      memory_fetch_count: obs.memoryFetchCount,
      memory_write_count: obs.memoryWriteCount,
      error_flag: obs.errorFlag,
      cost_alert_flag: obs.costAlertFlag
    };

    console.log('[OBSERVABILITY LOG]:', JSON.stringify(logPayload));

    // Async insert to DB (NO AWAIT)
    try {
      const supClient = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
      supClient.from('ai_system_logs').insert([logPayload]).then(({error}) => {
        if (error) console.error("Observability insert error:", error);
      });
    } catch(e) { /* ignore */ }
    
    return new Response(JSON.stringify(aiResponse), {
`;

indexCode = indexCode.replace(
  /return new Response\(JSON\.stringify\(aiResponse\), \{/g,
  finalLogSnippet
);

// --- 4. ERROR BLOCK TRACKING ---
const errorLogSnippet = `obs.errorFlag = true;
    const latencyMs = Date.now() - obs.startTime;
    console.error('[ERROR_MONITORING] ', { errorType: error.name, errorMessage: error.message, functionName: 'agent-process:serve', latencyMs });
    
    const logPayload = {
      user_id: null,
      llm_call_count: obs.llmCallCount || 0,
      model_used: obs.modelUsed || 'unknown',
      latency_ms: latencyMs,
      memory_fetch_count: obs.memoryFetchCount || 0,
      memory_write_count: obs.memoryWriteCount || 0,
      error_flag: true,
      cost_alert_flag: true
    };
    try {
      const supClient = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
      supClient.from('ai_system_logs').insert([logPayload]).then();
    } catch(e) { /* ignore */ }
    
    return new Response(JSON.stringify({ success: false, fallback_response: "system busy" }), {`;

indexCode = indexCode.replace(
  /return new Response\(JSON\.stringify\(\{ success: false, fallback_response: "system busy" \}\), \{/g,
  errorLogSnippet
);

fs.writeFileSync(indexPath, indexCode);
console.log('Observability patch applied to index.ts!');
