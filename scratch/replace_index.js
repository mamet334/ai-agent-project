const fs = require('fs');
const file = 'supabase/functions/agent-process/index.ts';
let content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');

const startIdx = 598; // Line 599 (0-indexed 598)
const endIdx = 953; // Line 954 is `      } else {` which should be kept, so end before it.

const newLines = `    const verificationResult = await executeVerificationPipeline({
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
      webHint: ctx.policy.webHint,
      isDesktopOSMode: desktopOSMode,
      auditMode: "BASIC"
    }, rctx);

    // === HARD BLOCK: Jika verdict BLOCKED, hentikan pipeline di sini ===
    if (!verificationResult.evidenceReport.isValid) {
      console.warn(\`[EVIDENCE_GATE] BLOCKED: \${verificationResult.evidenceReport.blockReason}\`);
      return buildBlockedResponse(verificationResult.evidenceReport.blockReason, corsHeaders);
    }

    fullSystemContext = verificationResult.systemPrompt;

    if (tools && tools.length > 0) {
      let isChatBiasa = false;
      ctx.request.lowerMsg = ctx.request.finalMessage.toLowerCase();
      ctx.state.processingSteps.push('🔍 Menganalisis permintaan user...');
      
      const desktopLocalKeywords = ["desktop", "terminal", "cmd", "powershell", "hardisk", "hard disk", "folder saya", "file saya", "komputer saya", "laptop saya", "daftar file", "cek file", "isi desktop", "isi folder", "buka terminal", "jalankan perintah", "eksekusi", "direktori"];
      const isDesktopLocalRequest = ctx.policy.canUseDesktopTools && desktopLocalKeywords.some(kw => ctx.request.lowerMsg.includes(kw));

      const timeKeywords = ["jam berapa", "hari apa", "tanggal berapa", "waktu sekarang"];
      const isTimeRequest = timeKeywords.some(kw => ctx.request.lowerMsg.includes(kw));

      const isClearMemory = ctx.request.lowerMsg.includes("hapus memori") || ctx.request.lowerMsg.includes("lupakan");

      const webKeywords = ["cari di web", "cari web", "berita hari ini", "berita terbaru", "harga saham", "cuaca", "search di google", "googling"];
      const isWebExplicit = webKeywords.some(kw => ctx.request.lowerMsg.includes(kw));

      const workspaceKeywords = ["ringkas", "rangkum", "semua dokumen", "isi workspace", "pola", "tren", "insight", "keseluruhan workspace", "daftar dokumen"];
      const isMacroWorkspaceQuery = workspaceKeywords.some(kw => ctx.request.lowerMsg.includes(kw));

      if (isTimeRequest || isClearMemory || isDesktopLocalRequest) {
          isChatBiasa = true;
          ctx.state.processingSteps.push('⚡ Fast-Track: Terdeteksi sebagai chat lokal/sederhana (Bypass Coordinator).');
      }

      if (!isChatBiasa || isWebExplicit || isMacroWorkspaceQuery) {
        
        switch (verificationResult.verificationReport.decision) {
          case "PASS":
            console.log("[HARD GATE] PASSED. Membuka blokir respons.");
            break;
          case "FAIL":
            console.warn(\`[HARD GATE] BLOCKED. Keputusan verifikasi gagal (Skor: \${verificationResult.verificationReport.score}).\`);
            return new Response(JSON.stringify({ message: "Verification Failed" }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
`;

const before = lines.slice(0, startIdx).join('\n');
const after = lines.slice(endIdx).join('\n');

fs.writeFileSync(file, before + '\n' + newLines + '\n' + after);
console.log('Success');
