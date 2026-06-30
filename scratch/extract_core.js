const fs = require('fs');

const indexFile = 'supabase/functions/agent-process/index.ts';
let content = fs.readFileSync(indexFile, 'utf8');

const startMarker = 'let routingDecision = ctx.request.routingDecision;';
const endMarker = '    return new Response(JSON.stringify(aiResponse), {\n      headers: { ...corsHeaders, \'Content-Type\': \'application/json\' },\n    });';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker) + endMarker.length;

if (startIdx === -1 || endIdx === -1) {
    console.error("Markers not found");
    process.exit(1);
}

let coreLogic = content.substring(startIdx, endIdx);

// Transformations on coreLogic
coreLogic = coreLogic.replace(
    /if \(stream\) \{\s*const blockedStream = new ReadableStream\(\{\s*start\(controller\) \{\s*const encoder = new TextEncoder\(\);\s*const data = JSON\.stringify\(\{ choices: \[\{ delta: \{ content: blockedMsg \} \}\] \}\);\s*controller\.enqueue\(encoder\.encode\(`data: \$\{data\}\\n\\n`\)\);\s*controller\.enqueue\(encoder\.encode\(`data: \[DONE\]\\n\\n`\)\);\s*controller\.close\(\);\s*\}\s*\}\);\s*return new Response\(blockedStream, \{\s*headers: \{ \.\.\.corsHeaders, 'Content-Type': 'text\/event-stream' \}\s*\}\);\s*\} else \{\s*return new Response\(JSON\.stringify\(\{ message: blockedMsg \}\), \{\s*headers: \{ \.\.\.corsHeaders, 'Content-Type': 'application\/json' \}\s*\}\);\s*\}/s,
    `if (stream) {
        return { mode: 'STREAM', type: 'BLOCKED', blockedMsg };
      } else {
        return { mode: 'DIRECT', aiResponse: { message: blockedMsg } };
      }`
);

// Replace stream returns
// Pattern 1
coreLogic = coreLogic.replace(
    /const streamRes = getStreamResponse\(ctx\.request\.finalMessage, fullSystemContext, history, \{ toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx\.state\.processingSteps \}, rctx\);\s*if \(streamRes\) return streamRes;/g,
    `return { mode: 'STREAM', type: 'LLM', prompt: ctx.request.finalMessage, systemContext: fullSystemContext, history, payload: { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation } };`
);

// Pattern 2
coreLogic = coreLogic.replace(
    /const streamRes = getStreamResponse\(synthesisPrompt, fullSystemContext, history, \{ toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx\.state\.processingSteps, auditMode, routingDecision, contractValidation \}, rctx\);\s*if \(streamRes\) return streamRes;/g,
    `return { mode: 'STREAM', type: 'LLM', prompt: synthesisPrompt, systemContext: fullSystemContext, history, payload: { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation } };`
);

// Pattern 3
coreLogic = coreLogic.replace(
    /const streamRes = getStreamResponse\(ctx\.request\.finalMessage, fullSystemContext, history, \{ toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx\.state\.processingSteps, auditMode, routingDecision, contractValidation \}, rctx\);\s*if \(streamRes\) return streamRes;/g,
    `return { mode: 'STREAM', type: 'LLM', prompt: ctx.request.finalMessage, systemContext: fullSystemContext, history, payload: { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation } };`
);

// Verification Fail Return
coreLogic = coreLogic.replace(
    /return new Response\(JSON\.stringify\(\{ message: "Verification Failed" \}\), \{\s*headers: \{ \.\.\.corsHeaders, 'Content-Type': 'application\/json' \}\s*\}\);/s,
    `return { mode: 'DIRECT', aiResponse: { message: "Verification Failed" } };`
);

// Final Return
coreLogic = coreLogic.replace(
    /return new Response\(JSON\.stringify\(aiResponse\), \{\s*headers: \{ \.\.\.corsHeaders, 'Content-Type': 'application\/json' \},\s*\}\);/s,
    `return { mode: 'DIRECT', aiResponse };`
);

// Add model extraction to avoid reference error
coreLogic = "  let model = rctx.model.model;\n  " + coreLogic;

// Fix GEMINI_API_KEY environment declaration issue
const envReplacement = `               const env = { 
                  GEMINI_API_KEY: rctx.keys.gemini, 
                  GROQ_API_KEY: rctx.keys.groq, 
                  OPENAI_API_KEY: rctx.keys.openAI, 
                  OPENROUTER_API_KEY: rctx.keys.openRouter, 
                  APIFY_API_TOKEN: rctx.env.apifyApiToken, 
                  allGeminiKeys: rctx.keys.allGemini 
               };`;
coreLogic = coreLogic.replace(/const env = \{\s*GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY,\s*APIFY_API_TOKEN: rctx\.env\.apifyApiToken, allGeminiKeys: rctx\.keys\.allGemini\s*\};/s, envReplacement);

// Build core_engine.ts content
const coreEngineContent = `import { executeRagPipeline } from '../rag/rag_pipeline.ts';
import { runSelfHealingLoopAsync } from '../../plugins/self_healing.ts';
import { processMemoryWriteQueue } from '../memory_write_worker.ts';
import { WorkspaceGuardian } from '../workspace_guardian.ts';
import { validateEvidence, buildBlockedResponse } from '../verification/evidence_validator.ts';
import { PolicyEngine } from '../verification/policy_engine.ts';
import { calculateConfidence } from '../verification/confidence_engine.ts';
import { buildUniversalContract } from '../verification/universal_contract.ts';
import { VerificationEngine } from '../verification_engine.ts';
import {
  getActiveConflictsCount,
  persistEvidenceAuditLog,
  persistVerificationAuditLog,
  logVerificationReport,
  logVerificationAudit
} from '../verification/verification_service.ts';
import { callGroq, callOpenAI, callOpenRouter } from '../provider_manager.ts';
import { runLLM, runCoordinatorLLM } from '../llm_orchestrator.ts';
import { getPluginPromptList, getPluginByName } from '../../plugins/registry.ts';
import { executeResponsePipeline } from './parser_pipeline.ts';

export const coreEngine = {
  async execute(ctx: any, rctx: any) {
  ${coreLogic}
  }
};
`;

// Write core_engine.ts
fs.mkdirSync('supabase/functions/agent-process/lib/orchestration', { recursive: true });
fs.writeFileSync('supabase/functions/agent-process/lib/orchestration/core_engine.ts', coreEngineContent);

// Build stream_controller.ts content
const streamControllerContent = `import { corsHeaders, getStreamResponse } from '../stream_handler.ts';

export const streamController = {
    pipe(result: any, rctx: any): Response {
        if (result.mode === 'BLOCKED') {
            const blockedStream = new ReadableStream({
              start(controller) {
                const encoder = new TextEncoder();
                const data = JSON.stringify({ choices: [{ delta: { content: result.blockedMsg } }] });
                controller.enqueue(encoder.encode(\`data: \${data}\\n\\n\`));
                controller.enqueue(encoder.encode(\`data: [DONE]\\n\\n\`));
                controller.close();
              }
            });
            return new Response(blockedStream, {
              headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
            });
        }
        
        if (result.mode === 'STREAM') {
            if (result.type === 'BLOCKED') {
                const blockedStream = new ReadableStream({
                  start(controller) {
                    const encoder = new TextEncoder();
                    const data = JSON.stringify({ choices: [{ delta: { content: result.blockedMsg } }] });
                    controller.enqueue(encoder.encode(\`data: \${data}\\n\\n\`));
                    controller.enqueue(encoder.encode(\`data: [DONE]\\n\\n\`));
                    controller.close();
                  }
                });
                return new Response(blockedStream, {
                  headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
                });
            } else if (result.type === 'LLM') {
                return getStreamResponse(result.prompt, result.systemContext, result.history, result.payload, rctx);
            }
        }
        
        if (result.mode === 'DIRECT') {
            return new Response(JSON.stringify(result.aiResponse), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        
        return new Response(JSON.stringify({ error: "Unknown execution mode" }), { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
};
`;

fs.mkdirSync('supabase/functions/agent-process/lib/streaming', { recursive: true });
fs.writeFileSync('supabase/functions/agent-process/lib/streaming/stream_controller.ts', streamControllerContent);

// Build new index.ts
let newIndexHeader = `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { executeRequestPipeline } from './lib/request/request_pipeline.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { coreEngine } from './lib/orchestration/core_engine.ts';
import { streamController } from './lib/streaming/stream_controller.ts';
import { corsHeaders } from './lib/stream_handler.ts';

serve(async (req) => {
  if (req.method === 'GET') {
    const runtimeEnv = {
      supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
      supabaseServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
      apifyApiToken: Deno.env.get('APIFY_API_TOKEN') || '',
      enableAsyncMemoryWrite: Deno.env.get('ENABLE_ASYNC_MEMORY_WRITE') !== 'false'
    };
    try {
      const supClient = createClient(runtimeEnv.supabaseUrl, runtimeEnv.supabaseServiceKey);
      const { data: logsData, error: logsError } = await supClient.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(50);
      const { data: memData, error: memError } = await supClient.from('user_memories').select('*').order('created_at', { ascending: false }).limit(50);
      return new Response(JSON.stringify({ logs: logsData, logsError, memories: memData, memError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }

  try {
    const pipelineResult = await executeRequestPipeline({ request: req, corsHeaders });
    if (pipelineResult.response) return pipelineResult.response;

    const { ctx, rctx } = pipelineResult;

    // --- EXECUTE ORCHESTRATION ---
    const engineResult = await coreEngine.execute(ctx, rctx);
    
    // --- POST EXECUTION GUARANTEES ---
    await rctx.tasks.awaitAll();

    // --- STREAMING OR RESPONSE LAYER ---
    return streamController.pipe(engineResult, rctx);

  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
`;

fs.writeFileSync(indexFile, newIndexHeader);

console.log("Extraction complete!");
