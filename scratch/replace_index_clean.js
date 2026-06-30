const fs = require('fs');
const file = 'supabase/functions/agent-process/index.ts';
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const b1Start = 598; // line 599
const b1End = 803; // line 804 (exclude 804 onwards)

const b2Start = 880; // line 881
const b2End = 952; // line 953 (exclude 953 onwards)

const b1New = `    const verificationResult = await executeVerificationPipeline({
      userId: ctx.auth.userId || '',
      mode: ctx.policy.mode,
      ragResult: ragResult,
      appSource: ctx.auth.appSource,
      finalMessage: ctx.request.finalMessage || '',
      routingDecision: routingDecision,
      agentIdentityPrompt,
      userContextPrompt,
      ragArray: ctx.state.ragArray,
      memoryArray: ctx.state.memoryArray,
      processingSteps: ctx.state.processingSteps,
      riskScore: ctx.policy.riskScore,
      webHint: ctx.policy.webHint || '',
      isDesktopOSMode: desktopOSMode,
      auditMode: "BASIC"
    }, rctx);

    // === HARD BLOCK: Jika verdict BLOCKED, hentikan pipeline di sini ===
    if (!verificationResult.evidenceReport.isValid) {
      console.warn(\`[EVIDENCE_GATE] BLOCKED: \${verificationResult.evidenceReport.blockReason}\`);
      const blockedMsg = buildBlockedResponse(verificationResult.evidenceReport, ctx.request.finalMessage || '');
      return new Response(JSON.stringify({ message: blockedMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let fullSystemContext = verificationResult.systemPrompt;`;

// Before B1
const beforeB1 = lines.slice(0, b1Start).join('\n');
// Between B1 and B2
const betweenB1B2 = lines.slice(b1End, b2Start).join('\n');
// After B2
const afterB2 = lines.slice(b2End).join('\n');

fs.writeFileSync(file, beforeB1 + '\n' + b1New + '\n' + betweenB1B2 + '\n' + afterB2);
console.log('Success');
