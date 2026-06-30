const fs = require('fs');
const file = 'supabase/functions/agent-process/index.ts';
let content = fs.readFileSync(file, 'utf8');

try {
  const { execSync } = require('child_process');
  execSync('git checkout supabase/functions/agent-process/index.ts');
  content = fs.readFileSync(file, 'utf8');
} catch(e) {}

// Replace the isChatBiasa branch stream/runLLM block and the verification gate
const chatBiasaFindStr = `        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps }, rctx);
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
        
        // --- PHASE 3B: SOURCE TRACE EXTRACTION LAYER ---`;

const chatBiasaEndStr = `          case "FAIL":
            console.warn(\`[HARD GATE] BLOCKED. Keputusan verifikasi gagal (Skor: \${vReport.score}).\`);
            return new Response(JSON.stringify({ message: "Verification Failed" }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }`;

let chatBiasaStartIdx = content.indexOf(chatBiasaFindStr);
let chatBiasaEndIdx = content.indexOf(chatBiasaEndStr);

if (chatBiasaStartIdx !== -1 && chatBiasaEndIdx !== -1) {
    const replacement = `        if (stream && !extractedImage) {
          streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps }, rctx);
        } else {
          replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
        }`;
    content = content.substring(0, chatBiasaStartIdx) + replacement + content.substring(chatBiasaEndIdx + chatBiasaEndStr.length);
} else {
    console.error("Could not find isChatBiasa block");
    process.exit(1);
}

// Replace MemoryManager A
const memABegin = `        // --- MEMORY MANAGER (BACKGROUND SAVE) ---`;
const memAEnd = `replyMessage = await runLLM(synthesisPrompt, fullSystemContext, history, rctx);`;

let memAStartIdx = content.indexOf(memABegin);
let memAEndIdx = content.indexOf(memAEnd);
if (memAStartIdx !== -1 && memAEndIdx !== -1) {
    const repA = `        if (stream && !extractedImage) {
          streamRes = getStreamResponse(synthesisPrompt, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
        } else {
          replyMessage = await runLLM(synthesisPrompt, fullSystemContext, history, rctx);
        }`;
    content = content.substring(0, memAStartIdx) + repA + content.substring(memAEndIdx + memAEnd.length);
}

// Replace Sub-Agent no-plan branch
const noPlanBegin = `      } else {
        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
      }`;
const repNoPlan = `      } else {
        if (stream && !extractedImage) {
          streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
        } else {
          replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
        }
      }`;
content = content.replace(noPlanBegin, repNoPlan);

// Replace MemoryManager B (Tools===0)
const memBBegin = `      // --- MEMORY MANAGER (BACKGROUND SAVE - DIRECT RESPONSE) ---`;
const memBEnd = `replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);`;

let memBStartIdx = content.indexOf(memBBegin);
let memBEndIdx = content.indexOf(memBEnd);
if (memBStartIdx !== -1 && memBEndIdx !== -1) {
    const repB = `      if (stream && !extractedImage) {
        ctx.state.processingSteps.push('✍️ Menjawab langsung (tanpa tools)...');
        streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
      } else {
        replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
      }`;
    content = content.substring(0, memBStartIdx) + repB + content.substring(memBEndIdx + memBEnd.length);
}

// Add let streamRes before if (isChatBiasa)
const declareStreamResIdx = content.indexOf('if (isChatBiasa) {');
if (declareStreamResIdx !== -1) {
    content = content.substring(0, declareStreamResIdx) + 'let streamRes: Response | undefined;\n      ' + content.substring(declareStreamResIdx);
}

// Add post processing at the end
const endFindStr = `    // Phase 5: Guarantee async delivery before sending JSON response
    await rctx.tasks.awaitAll();

    const aiResponse = {
      message: replyMessage,`;
const endRepStr = `    // --- POST PROCESSING LAYER ---
    const postProcessResult = postProcessResponse({
      replyMessage,
      isChatBiasa,
      isStreaming: !!streamRes,
      confidenceReport,
      evidenceReport,
      runtimeState: ctx.state,
      userId: ctx.auth.userId,
      finalMessage: ctx.request.finalMessage,
      enableAsyncMemoryWrite: rctx.env.enableAsyncMemoryWrite,
      canWriteMemory: ctx.policy.canWriteMemory,
      groundingSources,
    });

    if (postProcessResult.vReport) {
      console.log(\`========================\\nVERIFICATION DECISION\\nDecision : \${postProcessResult.vReport.decision}\\nStatus   : \${postProcessResult.vReport.status}\\nScore    : \${postProcessResult.vReport.score}\\n========================\`);
      logVerificationReport(postProcessResult.vReport);
    }
    
    if (postProcessResult.auditRecord) {
      logVerificationAudit(postProcessResult.auditRecord);
    }

    for (const t of postProcessResult.auditTasks) {
      rctx.tasks.fire(t.name, persistVerificationAuditLog(rctx, t.payload.auditRecord, t.payload.userId));
    }

    if (postProcessResult.decision === 'FAIL') {
      console.warn(\`[HARD GATE] BLOCKED. Keputusan verifikasi gagal (Skor: \${postProcessResult.verificationScore}).\`);
      return new Response(JSON.stringify({ message: "Verification Failed" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else if (postProcessResult.vReport) {
      console.log("[HARD GATE] PASSED. Membuka blokir respons.");
    }

    for (const t of postProcessResult.memoryTasks) {
      rctx.tasks.fire(t.name, processMemoryWriteQueue(t.payload.userId, t.payload.message, rctx.env.supabaseUrl, rctx.env.supabaseServiceKey));
    }

    // Phase 5: Guarantee async delivery before sending JSON response
    await rctx.tasks.awaitAll();

    if (streamRes) return streamRes;

    const aiResponse = {
      message: postProcessResult.finalReplyMessage,`;

content = content.replace(endFindStr, endRepStr);

// Add import
if (!content.includes("import { postProcessResponse } from './lib/coordinator/post_processing.ts';")) {
    content = "import { postProcessResponse } from './lib/coordinator/post_processing.ts';\n" + content;
}

fs.writeFileSync(file, content);
console.log("Finished patching index.ts for Post Processing Extraction");
