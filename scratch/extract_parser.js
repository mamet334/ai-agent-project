const fs = require('fs');
const file = 'supabase/functions/agent-process/index.ts';

const { execSync } = require('child_process');
try {
  execSync('git checkout supabase/functions/agent-process/index.ts');
  console.log("Restored index.ts from git just in case");
} catch(e) {}

let content = fs.readFileSync(file, 'utf8');

// --- Replace Extract Source Trace ---
const traceStartStr = "        // --- PHASE 3B: SOURCE TRACE EXTRACTION LAYER ---";
const traceEndStr = "        const { replyWithoutTrace, sourceTrace } = extractSourceTrace(replyMessage);";

const traceStart = content.indexOf(traceStartStr);
const traceEnd = content.indexOf(traceEndStr);

if (traceStart !== -1 && traceEnd !== -1) {
    const traceReplacement = `        // --- PHASE 3B: SOURCE TRACE EXTRACTION LAYER ---
        const { replyWithoutTrace, sourceTrace } = executeResponsePipeline('extract_trace', replyMessage);`;
    content = content.substring(0, traceStart) + traceReplacement + content.substring(traceEnd + traceEndStr.length);
    console.log("Replaced Trace Extraction Layer");
} else {
    console.log("Could not find Trace Extraction Layer");
}

// --- Replace Mamet Healer & Execution Contract ---
const healerStartStr = "      let planText = '[]';\n      let plan: any[] = [];\n      try {\n        ctx.state.processingSteps.push('🤖 Kepala Agent (Coordinator): Merencanakan strategi...');";
const healerEndStr = "      } else {\n          console.log(`[Execution Contract] VALIDATED OK. Starting execution loop.`);\n      }";

const healerStart = content.indexOf(healerStartStr);
const healerEnd = content.indexOf(healerEndStr);

if (healerStart !== -1 && healerEnd !== -1) {
    const healerReplacement = `      let planText = '[]';
      let plan: any[] = [];
      ctx.state.processingSteps.push('🤖 Kepala Agent (Coordinator): Merencanakan strategi...');
      try {
        planText = await runCoordinatorLLM(\`Permintaan User: "\${ctx.request.finalMessage}"\`, coordinatorSystemPrompt, false, rctx);
      } catch (err) {
        console.error("Coordinator LLM Error:", err);
      }

      // --- DELEGATE TO PARSER PIPELINE ---
      const parseResult = executeResponsePipeline('parse_plan', planText);
      plan = parseResult.plan;
      contractValidation = parseResult.validation as any;

      if (parseResult.healerTriggered) {
          console.error("Mamet Healer: Format JSON rusak. Pipeline mencoba perbaikan...");
      }

      if (plan.length > 0) {
          ctx.state.processingSteps.push(\`📋 Rencana: \${plan.length} sub-agent akan ditugaskan → \${plan.map((p: any) => p.subagent).join(', ')}\`);
      } else {
          if (contractValidation.status === "REJECTED") {
              ctx.state.processingSteps.push(\`❌ [Execution Contract] Skema ditolak: \${contractValidation.reason_code}\`);
          } else {
              ctx.state.processingSteps.push('📋 Coordinator memutuskan tidak ada sub-agent yang diperlukan');
          }
      }

      if (contractValidation.status === "REJECTED") {
          console.warn(\`[Execution Contract] REJECTED: \${contractValidation.reason_code}.\`);
      } else if (plan.length > 0) {
          console.log(\`[Execution Contract] VALIDATED OK. Starting execution loop.\`);
      }`;

    content = content.substring(0, healerStart) + healerReplacement + content.substring(healerEnd + healerEndStr.length);
    console.log("Replaced Healer & Execution Contract Layer");
} else {
    console.log("Could not find Healer Layer");
}

// Ensure import is added
if (!content.includes("import { executeResponsePipeline } from './lib/coordinator/parser_pipeline.ts';")) {
    content = "import { executeResponsePipeline } from './lib/coordinator/parser_pipeline.ts';\n" + content;
}

fs.writeFileSync(file, content);
console.log("Finished patching index.ts");
