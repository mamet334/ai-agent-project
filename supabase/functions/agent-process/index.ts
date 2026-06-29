import { executeResponsePipeline } from './lib/coordinator/parser_pipeline.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { executeRequestPipeline } from './lib/request/request_pipeline.ts';
import { Buffer } from 'node:buffer';
import { getPluginPromptList, getPluginByName } from './plugins/registry.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { executeRagPipeline } from './lib/rag/rag_pipeline.ts';
import { runSelfHealingLoopAsync } from './plugins/self_healing.ts';
import { processMemoryWriteQueue } from './memory_write_worker.ts';
import { WorkspaceGuardian } from './lib/workspace_guardian.ts';
import { validateEvidence, buildBlockedResponse } from './lib/verification/evidence_validator.ts';
import { PolicyEngine } from './lib/verification/policy_engine.ts';
import { calculateConfidence } from './lib/verification/confidence_engine.ts';
import { buildUniversalContract } from './lib/verification/universal_contract.ts';
import { VerificationEngine } from './lib/verification_engine.ts';
import {
  getActiveConflictsCount,
  persistEvidenceAuditLog,
  persistVerificationAuditLog,
  logVerificationReport,
  logVerificationAudit
} from './lib/verification/verification_service.ts';
import { RuntimeContext, createBackgroundTaskTracker, createRuntimeLogger } from './lib/runtime_context.ts';
import { callGroq, callOpenAI, callOpenRouter } from './lib/provider_manager.ts';
import {
  geminiKeyIndex, setGeminiKeyIndex,
  groqKeyIndex, setGroqKeyIndex,
  openaiKeyIndex, setOpenaiKeyIndex,
  openrouterKeyIndex, setOpenrouterKeyIndex,
  clearAllCooldowns, runLLM, runCoordinatorLLM
} from './lib/llm_orchestrator.ts';
import { getStreamResponse, corsHeaders } from './lib/stream_handler.ts';





const getActiveKey = (envVarName: string, currentIndex: number, setIndex: (idx: number) => void): string => {
  const keysString = Deno.env.get(envVarName) || '';
  if (!keysString) return '';
  const keys = keysString.split(',').map(k => k.trim()).filter(k => k);
  if (keys.length === 0) return '';
  
  const key = keys[currentIndex % keys.length];
  setIndex((currentIndex + 1) % keys.length);
  return key;
};

// === JURUS RAHASIA ANTI-LIMIT ===
// Ambil SEMUA Gemini keys untuk dicoba satu per satu saat 429
const getAllKeys = (envVarName: string): string[] => {
  const keysString = Deno.env.get(envVarName) || '';
  if (!keysString) return [];
  return keysString.split(',').map(k => k.trim()).filter(k => k);
};


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
  let routingDecision = ctx.request.routingDecision;
  const globalMemory = ctx.request.globalMemory;
  const tools = ctx.request.tools;
  const history = ctx.request.history;
  const stream = ctx.request.stream;
  const extractedImage = ctx.request.extractedImage;
  const auditMode = ctx.request.auditMode;
  const contractValidation = ctx.request.contractValidation;
  const desktopOSMode = ctx.request.desktopOSMode;
  const agentIdentityPrompt = ctx.request.agentIdentityPrompt || '';
  const userContextPrompt = ctx.request.userContextPrompt || '';
  const isRagEnabled = ctx.request.isRagEnabled;
  const effectiveRagThreshold = ctx.request.effectiveRagThreshold;
  const effectiveRagMatchCount = ctx.request.effectiveRagMatchCount;
  let replyMessage = 'Gagal memproses jawaban dari AI.';
  let groundingSources: any[] = [];
  let toolExecution: any = null;
  let subagentRuns: any[] = [];

    // --- RAG PIPELINE (FACADE) ---
    const ragResult = await executeRagPipeline({
      userId: ctx.auth.userId,
      query: ctx.request.finalMessage,
      globalMemory,
      isRagEnabled,
      effectiveRagThreshold,
      effectiveRagMatchCount,
      canReadMemory: ctx.policy.canReadMemory,
      mode: ctx.policy.mode,
      ragTopK: ctx.policy.ragTopK,
      webHint: ctx.policy.webHint,
      agentIdentityPrompt,
      userContextPrompt
    }, rctx);

    ctx.state.ragArray = ragResult.ragArray;
    ctx.state.memoryArray = ragResult.memoryArray;
    ctx.state.processingSteps.push(...ragResult.metadata.processingSteps);
    if (ragResult.metadata.routingDecision) {
       routingDecision = ragResult.metadata.routingDecision;
    }

    // --- SINGLE GATEWAY: ANTI DUPLICATE MEMORY (TIER 1 & 2) ---
    // Dipanggil TEPAT SEBELUM membangun final context.
    if (ctx.auth.userId && ctx.request.finalMessage && typeof ctx.request.finalMessage === 'string' && ctx.request.finalMessage.trim().length > 0) {
      console.log(`[MEMORY_GATEWAY] Edge Function hanya validasi auth dan memproses LLM. Tidak ada auto-save sembunyi.`);
    }

    let brain1Ids = ragResult.engineerContext?.brain1Ids || [];
    let brain2Tasks = ragResult.engineerContext?.brain2Tasks || [];
    let brain2Gaps = ragResult.engineerContext?.brain2Gaps || [];
    let brain2Verifications = ragResult.engineerContext?.brain2Verifications || [];
    
    if (ctx.policy.mode === 'ENGINEER' && ragResult.engineerContext) {
        (ctx as any).brain1Entries = ragResult.engineerContext.brain1Entries;
    }

    let fullSystemContext = ragResult.finalContext;
    
    // === EVIDENCE VALIDATOR — Hard Gate Layer ===
    // Ini adalah "hakim" yang memutuskan apakah LLM boleh dipanggil.
    // Filosofi: jika evidence = 0 di Engineer mode → STOP, jangan kirim ke LLM.
    const ragIds = ctx.state.ragArray.map((r: any) => {
       const match = r.content?.match(/\[Dari file "([^"]+)"\]/);
       return match ? match[1] : 'unknown_doc';
    });
    const memoryCount = ctx.state.memoryArray.length;

    const evidenceReport = validateEvidence({
      userId: ctx.auth.userId,
      mode: ctx.policy.mode,
      brain1Ids,
      brain2Tasks,
      brain2Gaps,
      brain2Verifications,
      ragArray: ctx.state.ragArray,
      memoryArray: ctx.state.memoryArray,
    });

    // LOGGING Evidence Report
    console.log(`[EVIDENCE_GATE]`, {
      verdict: evidenceReport.verdict,
      mode: evidenceReport.mode,
      brain1: evidenceReport.brain1Count,
      brain2: evidenceReport.brain2Count,
      rag: evidenceReport.ragCount,
      memory: evidenceReport.memoryCount,
      total: evidenceReport.totalEvidence,
      blocked: !evidenceReport.isValid,
      blockReason: evidenceReport.blockReason
    });
    ctx.state.processingSteps.push(`[EVIDENCE_GATE] Verdict=${evidenceReport.verdict} | total=${evidenceReport.totalEvidence}`);

    // Background: Simpan audit log ke Supabase
    rctx.tasks.fire('EvidenceAuditLog', persistEvidenceAuditLog(rctx, {
      userId: ctx.auth.userId,
      appSource: ctx.auth.appSource,
      evidenceReport,
      brain1Ids,
      brain2Tasks,
      brain2Gaps,
      ragDocs: ragIds,
      messagePreview: (ctx.request.finalMessage || '').substring(0, 100),
      routingScope: routingDecision?.scope || null,
      workspaceId: routingDecision?.workspace_id || null,
    }));

    // === HARD BLOCK: Jika verdict BLOCKED, hentikan pipeline di sini ===
    if (!evidenceReport.isValid) {
      const blockedMsg = buildBlockedResponse(evidenceReport, ctx.request.finalMessage);
      console.warn(`[EVIDENCE_GATE BLOCKED] User=${ctx.auth.userId} Mode=${ctx.policy.mode} Reason=${evidenceReport.blockReason}`);

      if (stream) {
        const blockedStream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const data = JSON.stringify({ choices: [{ delta: { content: blockedMsg } }] });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          }
        });
        return new Response(blockedStream, {
          headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' }
        });
      } else {
        return new Response(JSON.stringify({ message: blockedMsg }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Inject EVIDENCE_GATE_VERDICT ke system context (LLM tahu status evidencenya)
    fullSystemContext += evidenceReport.gateVerdictText;

    // === PHASE 2: CONFIDENCE ENGINE + UNIVERSAL CONTRACT ===
    // Hitung confidence dari backend (deterministic) — bukan dari LLM
    const brain1EntriesForConf = (ctx as any).brain1Entries || [];
    const ragDocTitles = ctx.state.ragArray.map((r: any) => {
      const match = r.content?.match(/\[Dari file "([^"]+)"\]/);
      return match ? match[1] : 'rag_doc';
    });

    let activeConflictsCount = 0;
    const currentEntryIds = brain1EntriesForConf.map((e: any) => e.id).filter(Boolean);
    if (currentEntryIds.length > 0) {
      activeConflictsCount = await getActiveConflictsCount(rctx, currentEntryIds);
    }

    const confidenceReport = calculateConfidence({
      mode: ctx.policy.mode,
      brain1Ids,
      brain1Entries: brain1EntriesForConf,
      brain2Tasks,
      brain2Gaps,
      brain2Verifications,
      ragDocs: ragDocTitles,
      memoryCount: ctx.state.memoryArray.length,
      activeConflicts: activeConflictsCount, // Berasal dari runtime Supabase
      hasVerification: brain2Verifications.length > 0,
      allCurrent: brain1EntriesForConf.every((e: any) => e.is_current !== false),
    });

    console.log('[CONFIDENCE_ENGINE]', {
      score: confidenceReport.score,
      grade: confidenceReport.grade,
      label: confidenceReport.label,
      evidenceCount: confidenceReport.signals.evidenceCount,
    });
    ctx.state.processingSteps.push(`[CONFIDENCE] ${confidenceReport.score}% Grade:${confidenceReport.grade} | ${confidenceReport.label}`);

    // === PHASE 2: UNIVERSAL EVIDENCE CONTRACT ===
    // Build contract 6-blok yang sama formatnya untuk semua LLM provider
    let policyConstraintText = '';
    const activeConstraints: string[] = [];
    const forbidden: string[] = [];
    
    if (ctx.policy.mode === 'ENGINEER') {
      const policyCtx = {
        mode: ctx.policy.mode as any,
        evidenceCount: evidenceReport.totalEvidence,
        riskScore: ctx.policy.riskScore,
        appSource: ctx.auth.appSource,
        hasActiveConflicts: activeConflictsCount > 0,
      };

      const allDecisions = PolicyEngine.evaluateAll(policyCtx);
      policyConstraintText = PolicyEngine.buildConstraintPrompt(allDecisions);
      
      for (const [action, decision] of Object.entries(allDecisions)) {
        if (decision.allow && decision.constraints.length > 0) activeConstraints.push(...decision.constraints);
        if (!decision.allow) forbidden.push(`Melakukan: ${action} (${decision.reason})`);
      }
      if (policyConstraintText) {
        ctx.state.processingSteps.push(`[POLICY] Constraints injected: ${policyConstraintText.length} chars`);
      }
    }

    // Ekstrak blok-blok dari resolved context fusion
    const memoryContextText = ragResult.memoryArray?.length > 0 
      ? ragResult.memoryArray.map((m: any) => m.content).join('\n') : '';
    const ragContextText = ragResult.ragArray?.length > 0 
      ? ragResult.ragArray.map((r: any) => r.content).join('\n') : '';
    
    // Brain 1 context text build
    const brain1ContextText = brain1EntriesForConf.map((e: any) => `[${e.entry_type}] ${e.title}: ${e.content}`).join('\n');
    let brain2ContextText = '';
    if (brain2Tasks.length > 0) brain2ContextText += `Active Tasks: ${brain2Tasks.join(', ')}\n`;
    if (brain2Gaps.length > 0) brain2ContextText += `Architecture Gaps: ${brain2Gaps.join(', ')}\n`;
    if (brain2Verifications.length > 0) brain2ContextText += `Recent Verifications: ${brain2Verifications.join(', ')}\n`;

    // Gabung instruksi inti (Identity, Sub-Agents, Zip, Web Hint)
    let systemBasePrompt = agentIdentityPrompt + userContextPrompt + ragResult.memoryPrompt;
    if (ctx.policy.webHint === "HIGH_PRIORITY") {
      systemBasePrompt += `\n[WEB vs RAG COMPARISON CONTRACT]: Jika terdapat perbedaan antara dokumen RAG internal dan Web/Internet, identifikasi mana yang lebih baru secara eksplisit.`;
    }

    const universalContract = buildUniversalContract({
      mode: ctx.policy.mode,
      appSource: ctx.auth.appSource,
      userId: ctx.auth.userId,
      evidenceReport,
      confidenceReport,
      brain1Entries: brain1EntriesForConf,
      brain2Tasks,
      brain2Gaps,
      brain2Verifications,
      ragArray: ctx.state.ragArray,
      memoryArray: ctx.state.memoryArray,
      memoryContextText,
      brain1ContextText,
      brain2ContextText,
      ragContextText,
      policyConstraints: activeConstraints,
      policyForbidden: forbidden,
      systemBasePrompt,
      activeConflicts: activeConflictsCount
    });

    // SOURCE OF TRUTH PAYLOAD: Universal Contract
    fullSystemContext = universalContract.asSystemPromptText();


    console.log("[MAMET BRAIN v2]", {
      memoryUsed: ragResult.memoryArray.length,
      ragUsed: ragResult.ragArray.length,
      contextSize: fullSystemContext.length,
      evidenceVerdict: evidenceReport.verdict,
    });

    console.log(`[SYSTEM CONTEXT FINAL] fullSystemContext="${fullSystemContext.substring(fullSystemContext.length - 300)}"`);
    ctx.state.processingSteps.push(`[SYSTEM CONTEXT FINAL] fullSystemContext="${fullSystemContext.substring(fullSystemContext.length - 300)}"`);

    // Gateway already moved up.

    if (tools && tools.length > 0) {
      // --- INTENT ROUTER (Pemotong Kompas Cerdas) ---
      let isChatBiasa = false;
      ctx.request.lowerMsg = ctx.request.finalMessage.toLowerCase();
      ctx.state.processingSteps.push('🔍 Menganalisis permintaan user...');
      
      // Deteksi instan (Hardcoded) untuk fitur yang membutuhkan sub-agent/tools
      const desktopLocalKeywords = ["desktop", "terminal", "cmd", "powershell", "hardisk", "hard disk", "folder saya", "file saya", "komputer saya", "laptop saya", "daftar file", "cek file", "isi desktop", "isi folder", "buka terminal", "jalankan perintah", "eksekusi", "direktori"];
      const isDesktopLocalRequest = ctx.policy.canUseDesktopTools && desktopLocalKeywords.some(kw => ctx.request.lowerMsg.includes(kw));

      if (isDesktopLocalRequest) {
        isChatBiasa = true;
        ctx.state.processingSteps.push('🖥️ Intent Router: Tugas lokal Desktop terdeteksi → Mamet langsung menangani (bypass Sub-Agent)');
        console.log("Intent Router: Desktop local request detected. Forcing CHAT_BIASA to let main LLM handle via <terminal> tags.");
      } else {
      const actionKeywords = [
        "jadwal", "cron", "otomatis", "remind", "ingatkan",
        "cari", "temukan", "search", "google", "internet", "web",
        "siapa", "mengapa", "bagaimana", "kapan", "dimana", "apakah",
        "berita", "motogp", "cuaca", "saham", "info", "terkini", "terbaru", "prediksi",
        "kurs", "harga", "nilai", "hitung", "matematika", "jumlah",
        "kode", "coding", "program", "javascript", "python", "html", "css", "buatkan", "tuliskan",
        "excel", "pdf", "file", "dokumen", "baca", "ringkas", "rangkum",
        "youtube", "yt", "video", "transkrip", "link", "url", "http",
        "slack", "discord", "telegram", "api", "webhook", "post", "send", "kirim",
        "login", "masuk", "sign in", "scrape", "credential", "username", "password", "sesi",
        "workspace", "folder", "analisis file", "periksa file", "scan folder", "baca file", "isi folder", "struktur folder", "LOCAL FOLDER CONTENT",
        "ingat", "ingatlah", "catat", "nama saya", "panggil saya", "saya suka", "favorit saya", "saya alergi", "kebiasaan saya", "informasi penting",
        "debat", "rapat", "diskusikan", "direksi", "ceo", "cfo", "cto", "board of directors", "keputusan bisnis",
        "shopee", "affiliate", "afiliate", "promosi", "produk", "jual", "komisi"
      ];
      const containsActionKeyword = actionKeywords.some(kw => ctx.request.lowerMsg.includes(kw));

      if (containsActionKeyword) {
        isChatBiasa = false;
        ctx.state.processingSteps.push('🎯 Intent Router: Mendeteksi kata kunci aksi → Butuh Sub-Agent');
        console.log("Intent Router: Mendeteksi kata kunci aksi. Bypass LLM check -> BUTUH_AGENT");
      } else {
        try {
          ctx.state.processingSteps.push('🧠 Intent Router: Mengklasifikasi jenis permintaan...');
          const intentCheckPrompt = `Analisis apakah input user berikut membutuhkan pencarian internet (web search), kunjungan website, analisis mendalam, penulisan/eksekusi kode, pemanggilan API, atau pembuatan jadwal/cron.
Pesan user: "${ctx.request.finalMessage}"

Kriteria:
- Jawab "CHAT_BIASA" jika pesan HANYA berupa sapaan (halo, pagi), obrolan santai (apa kabar, kamu siapa), ucapan terima kasih, atau pernyataan/pertanyaan umum yang bisa dijawab tanpa info luar/terkini/koding.
- Jawab "BUTUH_AGENT" jika pesan memerlukan informasi terkini, pencarian Google, pengerjaan kode, atau otomatisasi/cron.

Jawab HANYA dengan satu kata: "CHAT_BIASA" atau "BUTUH_AGENT".`;
          const intentResult = await runCoordinatorLLM(intentCheckPrompt, "Anda adalah router intent super ringan. Jawab HANYA satu kata.", true, rctx);
          if (intentResult.toUpperCase().includes("CHAT_BIASA")) {
             isChatBiasa = true;
             ctx.state.processingSteps.push('💬 Keputusan: Obrolan biasa → Jawab langsung tanpa sub-agent');
             console.log("Intent Router: Ini chat biasa. Bypass logika Sub-Agent untuk menghemat waktu dan kuota.");
          } else {
             ctx.state.processingSteps.push('⚡ Keputusan: Butuh aksi → Mempersiapkan sub-agent...');
          }
        } catch (err) {
          console.warn("Intent router error, mengabaikan intent check:", err);
        }
      }
      } // close desktopLocalRequest else

      if (isChatBiasa) {
        ctx.state.processingSteps.push('✍️ Menghubungi Model AI untuk menjawab langsung...');
        
        // --- MEMORY MANAGER (BACKGROUND SAVE) ---
        // Kita hanya mengambil 'message' murni (tanpa embel-embel dokumen 50rb karakter) agar token Groq tidak meledak
        // --- [REMOVED] MEMORY MANAGER DUPLICATE CALL ---

        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps }, rctx);
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
        
        // --- PHASE 3B: SOURCE TRACE EXTRACTION LAYER ---
        const { replyWithoutTrace, sourceTrace } = executeResponsePipeline('extract_trace', replyMessage);

        // --- PHASE 3: VERIFICATION ENGINE SKELETON ---
        const vContext = {
          responseText: replyWithoutTrace,
          sourceTrace: sourceTrace,
          confidenceReport: confidenceReport,
          evidenceReport: evidenceReport,
          runtimeContext: ctx.state
        };
        const vReport = VerificationEngine.verify(vContext);
        
        console.log(`========================\nVERIFICATION DECISION\nDecision : ${vReport.decision}\nStatus   : ${vReport.status}\nScore    : ${vReport.score}\n========================`);
        logVerificationReport(vReport);

        // TASK 015 & 016: Audit Object & Logger
        const auditRecord = VerificationEngine.createAuditRecord(vReport, vContext);
        logVerificationAudit(auditRecord);

        // TASK 019: Verification Audit Persistence
        rctx.tasks.fire('VerificationAuditLog', persistVerificationAuditLog(rctx, auditRecord, ctx.auth.userId || null));

        // TASK 018: Hard Response Gate
        switch (vReport.decision) {
          case "PASS":
            console.log("[HARD GATE] PASSED. Membuka blokir respons.");
            break;
          case "FAIL":
            console.warn(`[HARD GATE] BLOCKED. Keputusan verifikasi gagal (Skor: ${vReport.score}).`);
            return new Response(JSON.stringify({ message: "Verification Failed" }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        // ---------------------------------------------
        
      } else {
        let coordinatorSystemPrompt = `Tugas Anda adalah menganalisis permintaan user dan memilih sub-agent yang tepat.
Anda memiliki tim Sub-Agent nyata berikut ini:
${getPluginPromptList(tools)}

PENTING:
1. Anda adalah mesin parsing JSON. Anda DILARANG KERAS merespons dengan kalimat atau teks biasa. Anda WAJIB mengembalikan HANYA sebuah Array JSON murni. Jika tidak butuh sub-agent, kembalikan [].
2. Jika user menanyakan informasi aktual, fakta terbaru, berita, pertandingan olahraga (seperti MotoGP 2026), cuaca, harga saham, atau info di luar batas pengetahuan internal Anda (akhir 2024), Anda WAJIB memanggil sub-agent "researcher" atau "deep_research". JANGAN gunakan sub-agent "logika" untuk menjawab pertanyaan fakta/aktual!
3. Jika user meminta penjadwalan, tugas berulang, atau otomatisasi, Anda WAJIB memanggil sub-agent "cron_manager". DILARANG MENGARANG JADWAL SENDIRI.
4. JIKA pertanyaan user adalah tentang data spesifik (nama orang, lokasi, jumlah, isi laporan) yang kemungkinan besar ada di Pangkalan Data RAG/Dokumen internal user, kembalikan []. Sistem RAG beroperasi otomatis di jalur terpisah. JANGAN panggil "researcher" (Pencarian Web) untuk mencari dokumen personal!
5. RULE KETAT KNOWLEDGE WORKSPACE (MACRO VS MICRO QUERY):
- MACRO QUERY: Jika user meminta "ringkas", "rangkum", "pola", "tren", "insight", "kesimpulan", "seluruh workspace", "semua dokumen", atau "isi workspace", Anda WAJIB memanggil "knowledge_manager" dengan instruksi yang tepat (GET_WORKSPACE_SUMMARY atau LIST_DOCUMENTS).
- MICRO QUERY: Jika user mencari data spesifik ("cari", "siapa", "berapa", "kapan", "detail", "informasi tentang") di dalam workspace, Anda WAJIB MENGEMBALIKAN []. Sistem RAG Micro (Vector Search) akan otomatis berjalan di jalur terpisah. JANGAN panggil knowledge_manager untuk Micro Query.
- LOKAL FOLDER: JIKA prompt mengandung kata "folder", "directory", "desktop", atau "hardisk" DAN TIDAK MENGANDUNG kata "workspace", MAKA "file_analyzer" WAJIB menjadi kandidat utama (atau balas [] pada Mode Desktop).
Contoh Output Wajib: [{"subagent": "researcher", "task": "Cari pemenang MotoGP Italia Mugello 2026"}]`;
        
        coordinatorSystemPrompt += guardianPromptDirective;

        if (desktopOSMode) {
          coordinatorSystemPrompt += `\nCATATAN DESKTOP MODE: Jika user meminta eksekusi di komputer lokalnya (Cek Desktop, Eksekusi Terminal CMD, Cari File Hardisk), MAKA ITU ADALAH "CHAT_BIASA", JANGAN panggil sub-agent! Karena Anda (Mamet) sudah bisa melakukannya sendiri secara native menggunakan tag <terminal> atau <search_disk>. Berikan output [] jika itu masalah lokal.`;
        }

      let planText = '[]';
      let plan: any[] = [];
      ctx.state.processingSteps.push('🤖 Kepala Agent (Coordinator): Merencanakan strategi...');
      try {
        planText = await runCoordinatorLLM(`Permintaan User: "${ctx.request.finalMessage}"`, coordinatorSystemPrompt, false, rctx);
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
          ctx.state.processingSteps.push(`📋 Rencana: ${plan.length} sub-agent akan ditugaskan → ${plan.map((p: any) => p.subagent).join(', ')}`);
      } else {
          if (contractValidation.status === "REJECTED") {
              ctx.state.processingSteps.push(`❌ [Execution Contract] Skema ditolak: ${contractValidation.reason_code}`);
          } else {
              ctx.state.processingSteps.push('📋 Coordinator memutuskan tidak ada sub-agent yang diperlukan');
          }
      }

      if (contractValidation.status === "REJECTED") {
          console.warn(`[Execution Contract] REJECTED: ${contractValidation.reason_code}.`);
      } else if (plan.length > 0) {
          console.log(`[Execution Contract] VALIDATED OK. Starting execution loop.`);
      }

      let accumulatedContext = `Permintaan awal user: "${ctx.request.finalMessage}"\n\n`;

      if (plan && plan.length > 0) {
        // --- PHASE 4: DEPENDENCY-AWARE EXECUTION GRAPH BUILDER ---
        const INDEPENDENT_PLUGINS = new Set(['scraper', 'researcher', 'deep_research', 'youtube_analyst', 'file_analyzer', 'shopee_ninja', 'memory_manager', 'cron_manager']);
        const executionTiers: any[][] = [];
        let currentTier: any[] = [];
        const seenTasks = new Set();
        
        for (let i = 0; i < plan.length; i++) {
          if (i >= 5) {
            console.log("Mamet Healer: Membatasi maksimal 5 tugas (Budget Limit).");
            break;
          }
          
          const p = plan[i];
          const taskSignature = p.subagent + ":" + (p.task || "").substring(0, 30);
          
          if (seenTasks.has(taskSignature)) continue;
          seenTasks.add(taskSignature);
          
          if (INDEPENDENT_PLUGINS.has(p.subagent)) {
              // Independent plugins can be batched together for safe parallel execution
              currentTier.push(p);
          } else {
              // Dependent plugins flush the current batch, and run sequentially in their own tier
              if (currentTier.length > 0) {
                  executionTiers.push([...currentTier]);
                  currentTier = [];
              }
              executionTiers.push([p]);
          }
        }
        if (currentTier.length > 0) executionTiers.push(currentTier);

        // --- PHASE 4: CONTROLLED ORCHESTRATION & BUDGET ENFORCEMENT ---
        const GLOBAL_TIMEOUT_MS = 24000; // 24s total execution budget
        const PER_PLUGIN_TIMEOUT_MS = 12000;
        const orchestrationStartTime = Date.now();

        ctx.state.processingSteps.push(`🧠 Orchestrator: Membangun graph dengan ${executionTiers.length} tier eksekusi.`);

        for (let tierIdx = 0; tierIdx < executionTiers.length; tierIdx++) {
            const tierTasks = executionTiers[tierIdx];
            
            // Check Global Budget
            if (Date.now() - orchestrationStartTime > GLOBAL_TIMEOUT_MS) {
                console.warn(`[BUDGET_ENFORCER] Global Orchestration Budget Exceeded! Sisa tugas dibatalkan.`);
                ctx.state.processingSteps.push(`⚠️ Eksekusi dibatalkan karena melebihi total waktu budget (24s).`);
                break;
            }

            // Run Tier in Parallel safely
            const tierPromises = tierTasks.map(async (taskDef) => {
               const { subagent, task } = taskDef;
               let subagentResText = 'Gagal memproses.';
               let subagentSources: any[] = [];
               let subagentToolExec = null;
               
               const plugin = getPluginByName(subagent);
               if (!plugin) {
                   ctx.state.processingSteps.push(`⚠️ Sub-Agent "${subagent}" tidak ditemukan`);
                   return { subagent, task, subagentResText: `Sub-agent '${subagent}' tidak ditemukan di sistem plugin.`, subagentSources, subagentToolExec };
               }
               
               ctx.state.processingSteps.push(`🚀 Eksekusi [Tier ${tierIdx+1}]: Sub-Agent "${subagent}"`);
               
               const env = { 
                  GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, 
                  APIFY_API_TOKEN: rctx.env.apifyApiToken, allGeminiKeys: rctx.keys.allGemini 
               };
               const fullTask = `Tugas Spesifik Anda: ${task}\n\nPermintaan Asli User: "${ctx.request.finalMessage}"\n\nKonteks Tambahan (Hasil Tier Sebelumnya):\n${accumulatedContext}`;
               
               const customRunLLM = async (prompt: string, sys: string, hist: any[]) => {
                  const originalModel = model;
                  try {
                    if (subagent === 'coder' || subagent === 'debate') {
                       console.log(`🚥 Traffic Light: Sub-agent [${subagent}] dialihkan ke OpenRouter Gemini`);
                       model = 'openrouter-google-gemini-2.0-flash-exp';
                    } else if (subagent === 'scraper' || subagent === 'communicator' || subagent === 'youtube_analyst' || subagent === 'file_analyzer') {
                       console.log(`🚥 Traffic Light: Sub-agent [${subagent}] dialihkan ke GROQ`);
                       model = 'groq-llama-3.1';
                    } else {
                       console.log(`🚥 Traffic Light: Sub-agent [${subagent}] menggunakan GEMINI`);
                       model = 'gemini-2.0-flash';
                    }
                    return await runLLM(prompt, sys, hist, rctx);
                  } finally { model = originalModel; }
               };

               // --- MAMET HEALER (PHASE 3 ISOLATION + PHASE 4 BUDGET) ---
               const startTime = Date.now();
               let lifecycleState = 'CREATED';
               const abortController = new AbortController();
               const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;

               try {
                  lifecycleState = 'RUNNING';
                  
                  // Phase 5: TRUE EXECUTION CANCELLATION LAYER
                  // Memberikan 'propagate execution hook' ke plugin agar auto-abort bekerja
                  const controlledFetch = (input: RequestInfo | URL, init?: RequestInit) => {
                      return fetch(input, { ...init, signal: init?.signal || abortController.signal });
                  };
                  
                  const executeContext = { 
                      task: fullTask, cleanTask: task, accumulatedContext, 
                      env: { ...env, signal: abortController.signal, fetch: controlledFetch }, 
                      runLLM: customRunLLM, userId: ctx.auth.userId, signal: abortController.signal 
                  };

                  const isolatedExecutionPromise = (async () => {
                     try {
                         const rawResult = await plugin.execute(executeContext);
                         if (lifecycleState !== 'RUNNING') {
                             console.warn(`[GATING_LAYER] Execution ${executionId} (${subagent}) late. Result DISCARDED.`);
                             return null; 
                         }
                         lifecycleState = 'COMPLETED';
                         return rawResult;
                     } catch (err) {
                         if (lifecycleState !== 'RUNNING') return null;
                         throw err;
                     }
                  })();

                  const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        if (lifecycleState === 'RUNNING') {
                            lifecycleState = 'ORPHANED';
                            abortController.abort(new Error('TIMEOUT_ABORT'));
                            reject(new Error('HARD_TIMEOUT_REACHED'));
                        }
                    }, PER_PLUGIN_TIMEOUT_MS);
                  });
                  
                  const result = await Promise.race([isolatedExecutionPromise, timeoutPromise]) as any;
                  
                  if (lifecycleState !== 'COMPLETED') throw new Error('GATING_VALIDATION_FAILED');
                  
                  subagentResText = result?.output || '';
                  subagentSources = result?.sources || [];
                  subagentToolExec = result?.toolExecution || null;
                  
                  const durationMs = Date.now() - startTime;
                  const outputPreview = (subagentResText || '').substring(0, 80).replace(/\n/g, ' ');
                  ctx.state.processingSteps.push(`✅ [Tier ${tierIdx+1}] "${subagent}" selesai (${durationMs}ms)${subagentSources.length > 0 ? ` → ${subagentSources.length} sumber referensi` : ''} → "${outputPreview}..."`);
               } catch (err: any) {
                  const durationMs = Date.now() - startTime;
                  const status = err.message === 'HARD_TIMEOUT_REACHED' ? 'timeout' : 'fail';
                  
                  subagentToolExec = { status: lifecycleState, safe_fallback: true, error_classification: status === 'timeout' ? "TIMEOUT_GATED" : "EXECUTION_ERROR" };
                  
                  if (status === 'timeout') {
                    subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent "${subagent}" dibatalkan permanen (Hard Timeout ${PER_PLUGIN_TIMEOUT_MS/1000}s).`;
                    ctx.state.processingSteps.push(`⏳ [Tier ${tierIdx+1}] "${subagent}" tereliminasi (Hard Timeout Gated)`);
                  } else {
                    subagentResText = `[SISTEM DILINDUNGI OLEH MAMET HEALER]: Eksekusi sub-agent gagal pada mode terisolasi (${err.message || 'Unknown'}).`;
                    ctx.state.processingSteps.push(`❌ [Tier ${tierIdx+1}] "${subagent}" gagal terisolasi: ${err.message || 'Unknown'}`);
                  }
               }
               return { subagent, task, subagentResText, subagentSources, subagentToolExec };
            });

            // Tunggu semua tugas di tier ini selesai (Partial Result Aggregation)
            const tierResults = await Promise.allSettled(tierPromises);

            // Akumulasi hasil untuk Tier berikutnya
            for (const outcome of tierResults) {
                if (outcome.status === 'fulfilled') {
                    const res = outcome.value;
                    const safeSubagent = String(res.subagent || "UNKNOWN");
                    subagentRuns.push({ subagent: safeSubagent, task: res.task, output: res.subagentResText, sources: res.subagentSources, toolExecution: res.subagentToolExec });
                    accumulatedContext += `--- Hasil Sub-Agent [${safeSubagent.toUpperCase()}]: ---\nTugas: ${res.task}\nOutput: ${res.subagentResText}\n\n`;
                }
            }
            
            // Penundaan ringan antar Tier untuk Rate Limit LLM
            if (tierIdx < executionTiers.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent.${fullSystemContext}\n\nPermintaan Awal User: "${ctx.request.finalMessage}"\n\nRiwayat pekerjaan sub-agent:\n${accumulatedContext}\n\nJAWABLAH pesan/pertanyaan user dengan ramah dan natural berdasarkan informasi dari sub-agent di atas. \n\nPENTING: \n- JANGAN gunakan format kaku seperti "Laporan Hasil Kerja". Bersikaplah seperti manusia biasa (asisten yang ramah bernama Mamet).\n- Langsung berikan jawaban, sapaan balik, atau solusi tanpa perlu panjang lebar menjelaskan proses sub-agent (kecuali user secara spesifik bertanya tentang prosesnya).\n- Jika pada riwayat pekerjaan sub-agent terdapat bagian "Gambar Terkait" (dalam format Markdown ![Gambar](url)), Anda WAJIB menyertakan gambar-gambar tersebut di bagian paling akhir jawaban Anda untuk memberikan visualisasi kepada user.\n- Jika Sub-Agent mengembalikan pesan ERROR atau GAGAL, sampaikan kepada user dengan sopan bahwa tugas tersebut gagal. Jangan pernah mengarang data palsu!\n- Gunakan format Tabel Markdown HANYA jika menyajikan data terstruktur, statistik, harga, atau perbandingan.\n- DILARANG KERAS menggunakan blok \`\`\`mermaid\`\`\` KECUALI user secara tertulis meminta "buatkan diagram" atau "gambarkan flowchart". Jika user tidak meminta diagram, JANGAN pernah memakainya!`;
        
        ctx.state.processingSteps.push('📝 Merangkum dan menyintesis jawaban akhir...');
        
        // --- MEMORY MANAGER (BACKGROUND SAVE) ---
        if (rctx.env.enableAsyncMemoryWrite) {
            const supUrl = rctx.env.supabaseUrl;
            const supKey = rctx.env.supabaseServiceKey;
            if (ctx.policy.canWriteMemory) await rctx.tasks.fire('MemoryWriteQueue_A', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));
        }

        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(synthesisPrompt, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(synthesisPrompt, fullSystemContext, history, rctx);
      } else {
        if (stream && !extractedImage) {
          const streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
          if (streamRes) return streamRes;
        }
        replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
      }
      }
    } else {
      // --- MEMORY MANAGER (BACKGROUND SAVE - DIRECT RESPONSE) ---
      if (rctx.env.enableAsyncMemoryWrite) {
          const supUrl = rctx.env.supabaseUrl;
          const supKey = rctx.env.supabaseServiceKey;
          if (ctx.policy.canWriteMemory) await rctx.tasks.fire('MemoryWriteQueue_B', processMemoryWriteQueue(ctx.auth.userId, ctx.request.finalMessage, supUrl, supKey));
      }

      if (stream && !extractedImage) {
        ctx.state.processingSteps.push('✍️ Menjawab langsung (tanpa tools)...');
        const streamRes = getStreamResponse(ctx.request.finalMessage, fullSystemContext, history, { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode, routingDecision, contractValidation }, rctx);
        if (streamRes) return streamRes;
      }
      replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
    }

    // Phase 5: Guarantee async delivery before sending JSON response
    await rctx.tasks.awaitAll();

    const aiResponse = {
      message: replyMessage,
      toolsUsed: tools,
      groundingSources,
      toolExecution,
      subagentRuns,
      processingSteps: ctx.state.processingSteps,
      timestamp: new Date(),
      userId: ctx.auth.userId
    };

    return new Response(JSON.stringify(aiResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
