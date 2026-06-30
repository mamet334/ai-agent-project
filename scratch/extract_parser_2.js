const fs = require('fs');
const file = 'supabase/functions/agent-process/index.ts';

let content = fs.readFileSync(file, 'utf8');

const healerStartStr = "      let planText = '[]';";
const healerEndStr = "console.log(`[Execution Contract] VALIDATED OK. Starting execution loop.`);\n      }";

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
    fs.writeFileSync(file, content);
} else {
    console.log("Could not find Healer Layer", healerStart, healerEnd);
}
