import { runCoordinatorLLM } from '../../llm_orchestrator.ts';
import { executeResponsePipeline } from '../../coordinator/parser_pipeline.ts';
import { getPluginPromptList } from '../../../plugins/registry.ts';

export const IntentRouterHandler = {
  async handle(ctx: any, rctx: any, maef: any): Promise<any> {
    const tools = ctx.request.tools;
    let isChatBiasa = false;
    let plan: any[] = [];
    let contractValidation = ctx.request.contractValidation;

    if (!tools || tools.length === 0) {
      maef.evaluatePhaseResult('CONTEXT_BUILD', { isChatBiasa: true });
      return { isChatBiasa: true, plan, contractValidation };
    }

    ctx.request.lowerMsg = ctx.request.finalMessage.toLowerCase();
    ctx.state.processingSteps.push('🔍 Menganalisis permintaan user...');
    
    const desktopLocalKeywords = ["desktop", "terminal", "cmd", "powershell", "hardisk", "hard disk", "folder saya", "file saya", "komputer saya", "laptop saya", "daftar file", "cek file", "isi desktop", "isi folder", "buka terminal", "jalankan perintah", "eksekusi", "direktori"];
    const isDesktopLocalRequest = ctx.policy.canUseDesktopTools && desktopLocalKeywords.some(kw => ctx.request.lowerMsg.includes(kw));

    if (isDesktopLocalRequest) {
      isChatBiasa = true;
      ctx.state.processingSteps.push('🖥️ Intent Router: Tugas lokal Desktop terdeteksi → Mamet langsung menangani (bypass Sub-Agent)');
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
      } else {
        try {
          ctx.state.processingSteps.push('🧠 Intent Router: Mengklasifikasi jenis permintaan...');
          const intentCheckPrompt = `Analisis apakah input user berikut membutuhkan pencarian internet (web search), kunjungan website, analisis mendalam, penulisan/eksekusi kode, pemanggilan API, atau pembuatan jadwal/cron.\nPesan user: "${ctx.request.finalMessage}"\n\nKriteria:\n- Jawab "CHAT_BIASA" jika pesan HANYA berupa sapaan, obrolan santai, ucapan terima kasih, atau pertanyaan umum yang bisa dijawab tanpa info luar/terbaru.\n- Jawab "BUTUH_AGENT" jika butuh agen eksternal.\n\nJawab HANYA dengan satu kata: "CHAT_BIASA" atau "BUTUH_AGENT".`;
          const intentResult = await runCoordinatorLLM(intentCheckPrompt, "Anda adalah router intent super ringan. Jawab HANYA satu kata.", true, rctx);
          if (intentResult.toUpperCase().includes("CHAT_BIASA")) {
             isChatBiasa = true;
             ctx.state.processingSteps.push('💬 Keputusan: Obrolan biasa → Jawab langsung tanpa sub-agent');
          } else {
             ctx.state.processingSteps.push('⚡ Keputusan: Butuh aksi → Mempersiapkan sub-agent...');
          }
        } catch (err) {
          console.warn("Intent router error, mengabaikan intent check:", err);
        }
      }
    } 

    maef.evaluatePhaseResult('CONTEXT_BUILD', { isChatBiasa });

    if (maef.shouldExecutePhase('ORCHESTRATION')) {
        let coordinatorSystemPrompt = `Tugas Anda adalah menganalisis permintaan user dan memilih sub-agent yang tepat.\nAnda memiliki tim Sub-Agent nyata berikut ini:\n${getPluginPromptList(tools)}\n\nPENTING:\n1. Anda adalah mesin parsing JSON. Anda DILARANG KERAS merespons dengan kalimat atau teks biasa. Anda WAJIB mengembalikan HANYA sebuah Array JSON murni. Jika tidak butuh sub-agent, kembalikan [].\n2. Jika user menanyakan informasi aktual, fakta terbaru, atau info di luar batas pengetahuan internal Anda, Anda WAJIB memanggil sub-agent "researcher" atau "deep_research".\n3. Jika user meminta penjadwalan, panggil "cron_manager".\n4. JIKA pertanyaan user adalah tentang data spesifik yang ada di Pangkalan Data RAG/Dokumen internal user, kembalikan [].\n5. RULE KETAT KNOWLEDGE WORKSPACE:\n- MACRO QUERY: panggil "knowledge_manager".\n- MICRO QUERY: kembalikan [].\n- LOKAL FOLDER: panggil "file_analyzer".\nContoh Output Wajib: [{"subagent": "researcher", "task": "Cari pemenang MotoGP 2026"}]`;
        
        coordinatorSystemPrompt += (ctx.request.guardianPromptDirective || '');

        if (ctx.request.desktopOSMode) {
          coordinatorSystemPrompt += `\nCATATAN DESKTOP MODE: Jika permintaan eksekusi lokal (Terminal, Cmd, Folder Lokal), MAKA ITU "CHAT_BIASA", balas []!`;
        }

        let planText = '[]';
        maef.requestTransition('ORCHESTRATION', 'Starting Execution Planning');
        ctx.state.processingSteps.push('🤖 Kepala Agent (Coordinator): Merencanakan strategi...');
        try {
          planText = await runCoordinatorLLM(`Permintaan User: "${ctx.request.finalMessage}"`, coordinatorSystemPrompt, false, rctx);
        } catch (err) {
          console.error("Coordinator LLM Error:", err);
        }

        const parseResult = executeResponsePipeline('parse_plan', planText, rctx);
        plan = parseResult.plan;
        contractValidation = parseResult.validation as any;

        if (plan.length > 0) {
            ctx.state.processingSteps.push(`📋 Rencana: ${plan.length} sub-agent akan ditugaskan → ${plan.map((p: any) => p.subagent).join(', ')}`);
        } else if (contractValidation.status === "REJECTED") {
            ctx.state.processingSteps.push(`❌ [Execution Contract] Skema ditolak: ${contractValidation.reason_code}`);
        } else {
            ctx.state.processingSteps.push('📋 Coordinator memutuskan tidak ada sub-agent yang diperlukan');
        }
    }

    return { isChatBiasa, plan, contractValidation };
  }
};
