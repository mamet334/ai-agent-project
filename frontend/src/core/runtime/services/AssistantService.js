/**
 * AssistantService.js — Assistant Brain Mamet AI
 *
 * Peran:
 * - Memproses pesan user (handleSend logic)
 * - Inject memory & semantic context ke payload AI
 * - Memanggil Supabase Edge Function (agent-process) dengan streaming/JSON
 * - Menyimpan dan memuat riwayat chat ke/dari Supabase
 * - Menjadi "rumah arsitektur" resmi untuk PR#1 (CommandRegistry),
 *   PR#2 (CognitiveMemoryGovernor), PR#5 (RetrievalStrategy), PR#6 (TokenEfficiency)
 *
 * Prinsip: Satu file, satu tanggung jawab — tidak ada JSX, tidak ada useState.
 * Komponen React (ConversationEngine) hanya memanggil service ini dan menampilkan hasil.
 *
 * Mengikuti pola engineer.js:
 * - Constructor menerima serviceManager
 * - initialize() async untuk setup
 * - Terdaftar resmi di Kernel.js Phase 3
 */

const AGENT_ENDPOINT = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process';

// PR#2: Import governor dari versi JS lokal (bukan cross-boundary ke lib/ TypeScript)
import {
  runCognitiveMemoryGovernor,
  LEGACY_COGNITION_ENABLED
} from './CognitiveMemoryGovernorService.js';

// PR#6: Token estimator sederhana (~4 chars per token, standar Anthropic/OpenAI approximation)
// Dipakai untuk logging before/after context optimization
function estimateTokens(text = '') {
  return Math.ceil(text.length / 4);
}

// PR#6: Batas maksimal karakter untuk RAG/memory context yang dikirim ke Edge Function
// Cegah bloat — context besar tidak selalu = jawaban lebih baik
const MAX_RAG_CONTEXT_CHARS = 4000;   // ~1000 token
const MAX_SEMANTIC_CONTEXT_CHARS = 2000; // ~500 token

export class AssistantService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this._initialized = false;
  }

  async initialize() {
    this._initialized = true;
    console.log('[AssistantService] Initialized');
  }

  // =============================================
  // MODE RESOLUTION
  // =============================================

  /**
   * Resolusi mode berdasarkan workspaceId aktif.
   * @param {string} workspaceId
   * @returns {{ resolvedMode: string, resolvedAppSource: string }}
   */
  resolveMode(workspaceId) {
    if (workspaceId === 'ws-engineer' || workspaceId === 'ENGINEER') {
      return { resolvedMode: 'ENGINEER', resolvedAppSource: 'engineer' };
    }
    if (workspaceId === 'ws-lite' || workspaceId === 'MAMETLITE' || workspaceId === 'LITE') {
      return { resolvedMode: 'LITE', resolvedAppSource: 'mametlite' };
    }
    return { resolvedMode: 'ASSISTANT', resolvedAppSource: 'assistant' };
  }

  // =============================================
  // FILE PATH EXTRACTION (untuk Engineer mode)
  // =============================================

  /**
   * Extract file path dari pesan user untuk Engineer mode.
   * @param {string} message
   * @returns {string|null}
   */
  extractFilePathFromMessage(message) {
    if (!message) return null;
    const pattern1 = /(?:di\s+)?(?:file|berkas)\s+([a-zA-Z0-9_\-\/\.]+\.(jsx?|tsx?|ts|js))/i;
    const match1 = message.match(pattern1);
    if (match1) return match1[1];

    const pattern2 = /([a-zA-Z0-9_\-\/]+\.(jsx?|tsx?))/g;
    const match2 = message.match(pattern2);
    if (match2 && match2.length > 0) {
      const withSlash = match2.find(m => m.includes('/'));
      return withSlash || match2[0];
    }
    return null;
  }

  // =============================================
  // MEMORY: Natural Language Trigger
  // =============================================

  /**
   * Deteksi keyword memori dan simpan ke MemoryService jika ada.
   * @param {string} userMsg
   * @returns {Promise<{ handled: boolean, responseContent: string }>}
   */
  async handleMemoryTrigger(userMsg, context = {}) {
    const memoryKeywords = ['ingat', 'simpan', 'catat', 'remember', 'save', 'store'];
    const lowerMsg = userMsg.toLowerCase();
    const hasMemoryKeyword = memoryKeywords.some(k => lowerMsg.includes(k));

    if (!hasMemoryKeyword) return { handled: false, responseContent: '' };

    const memoryService = this.serviceManager.get('MemoryService');
    const governor = this.serviceManager.has('MemoryGovernorService')
      ? this.serviceManager.get('MemoryGovernorService')
      : null;

    if (!memoryService && !governor) return { handled: false, responseContent: '' };

    const contentToRemember = userMsg
      .replace(/(ingat|simpan|catat|remember|save|store)/gi, '')
      .trim();

    if (contentToRemember.length === 0) return { handled: false, responseContent: '' };

    try {
      const { supabase } = await import('../../../supabase.js');
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // Infer category
      let category = 'general';
      const cLower = contentToRemember.toLowerCase();
      if (/suka|ingin|favorit|preferensi|nama saya|panggil/i.test(cLower)) {
        category = 'preference';
      } else if (/kode|file|fungsi|class|repo|bug|error|endpoint|script/i.test(cLower)) {
        category = 'engineering';
      }

      const goldenMeta = {
        source_type: 'assistant_chat',
        source_reference: 'assistant_chat_trigger',
        chat_id: context.chatId || null,
        version_code: `AST-${Date.now()}`,
        category,
        useGovernor: true
      };

      if (governor && userId && typeof governor.storeGoldenMemory === 'function') {
        // Cek deteksi konflik sebelum store agar memori bertentangan ditandai CONFLICT_PENDING_REVIEW
        await governor.detectAndMarkConflict({
          userId,
          sourceFile: goldenMeta.source_reference,
          newContent: contentToRemember,
          newVersionSeq: 1
        });

        const stored = await governor.storeGoldenMemory({
          user_id: userId,
          content: contentToRemember,
          summary: contentToRemember,
          source_type: goldenMeta.source_type,
          source_reference: goldenMeta.source_reference,
          chat_id: goldenMeta.chat_id,
          version_code: goldenMeta.version_code,
          category: goldenMeta.category
        });

        if (stored) {
          return {
            handled: true,
            responseContent: `✅ Saya telah menyimpan: "${contentToRemember}" ke memori (kategori: ${category}).`
          };
        }
      } else if (memoryService) {
        const stored = await memoryService.storeMemory(contentToRemember, contentToRemember, goldenMeta);
        if (stored) {
          return {
            handled: true,
            responseContent: `✅ Saya telah menyimpan: "${contentToRemember}" ke memori.`
          };
        }
      }
    } catch (err) {
      console.warn('[AssistantService] Memory trigger failed:', err);
    }
    return { handled: false, responseContent: '' };
  }

  // =============================================
  // CONTEXT INJECTION: Memory + Semantic
  // =============================================

  /**
   * Bangun localContext (memory) dan semanticContext untuk payload.
   * @param {string} userMsg
   * @param {string} resolvedMode
   * @param {string} userId
   * @returns {Promise<{ localContext: string, semanticContext: string }>}
   */
  async buildContextInjection(userMsg, resolvedMode, userId) {
    let localContext = '';
    let semanticContext = '';

    if (resolvedMode === 'LITE') {
      console.log('[AssistantService] Mode LITE — Memory & Semantic injection dilewati.');
      return { localContext, semanticContext };
    }

    // Memory injection
    let memoryService = this.serviceManager.get('MemoryService');
    if (!memoryService) {
      await new Promise(r => setTimeout(r, 1000));
      memoryService = this.serviceManager.get('MemoryService');
    }

    if (memoryService) {
      try {
        const memories = await memoryService.getMemory(userMsg);
        if (memories && memories.length > 0) {
          localContext = memories.map(m => m.summary || m.content || '').filter(Boolean).join('\n');
        }
      } catch (e) {
        console.warn('[AssistantService] MemoryService query failed:', e);
      }
    }

    // Semantic context injection
    try {
      const semanticContextService = this.serviceManager.get('SemanticContextService');
      if (semanticContextService && userId) {
        const intentResult = semanticContextService.parseIntent(userMsg);
        if (intentResult.entities && intentResult.entities.length > 0) {
          semanticContextService.updateGraph(userId, intentResult.entities);
          const contextResult = semanticContextService.getContext(userId, userMsg);
          semanticContext = contextResult.context;
        }
      }
    } catch (e) {
      console.warn('[AssistantService] SemanticContextService failed:', e);
    }

    return { localContext, semanticContext };
  }

  // =============================================
  // BUILD REQUEST HEADERS
  // =============================================

  /**
   * Bangun headers untuk fetch ke Edge Function.
   * @param {string} token - Supabase access token
   * @param {string} aiProvider - 'gemini' | 'openai' | 'openrouter' | 'groq'
   * @param {string} aiKey - BYOK key
   * @returns {Object}
   */
  buildHeaders(token, aiProvider, aiKey) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token.replace(/[^\x00-\x7F]/g, '')}`
    };

    if (aiKey) {
      const cleanKey = aiKey.replace(/[^\x00-\x7F]/g, '');
      if (aiProvider === 'openrouter') headers['x-byok-openrouter'] = cleanKey;
      else if (aiProvider === 'openai') headers['x-byok-openai'] = cleanKey;
      else if (aiProvider === 'groq') headers['x-byok-groq'] = cleanKey;
      else if (aiProvider === 'gemini') headers['x-byok-gemini'] = cleanKey;
    }

    return headers;
  }

  // =============================================
  // FILE ATTACHMENT: konversi ke base64
  // =============================================

  /**
   * Konversi File object ke payload base64 untuk dikirim ke API.
   * @param {File|null} attachedFile
   * @returns {Promise<Object|null>}
   */
  async buildFileData(attachedFile) {
    if (!attachedFile) return null;
    const buffer = await attachedFile.arrayBuffer();
    const base64String = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    return {
      name: attachedFile.name,
      type: attachedFile.type,
      size: attachedFile.size,
      data: base64String
    };
  }

  // =============================================
  // CORE: processMessage
  // =============================================

  /**
   * Proses pesan user — PR#8: Thin dispatcher (Linux-style).
   * Hanya: resolve mode → memory trigger → classify → dispatch.
   * Logic berat ada di _handleLookup() dan _handleConversation().
   */
  async processMessage({
    userMsg,
    history,
    workspaceId,
    userId,
    token,
    attachedFile = null,
    workspaceManager,
    onChunk,
    onDone,
    onError
  }) {
    if (!userMsg || !token) {
      onError?.('Pesan atau token tidak tersedia.');
      return;
    }

    console.log('[LIFECYCLE] Chat request sent');

    // 1. Resolve mode
    const { resolvedMode, resolvedAppSource } = this.resolveMode(workspaceId);

    // 2. Memory trigger check (keyword: ingat/simpan/catat)
    const memoryResult = await this.handleMemoryTrigger(userMsg, { chatId: workspaceId });
    if (memoryResult.handled) {
      onDone?.(memoryResult.responseContent, [], null);
      return;
    }

    // 3. PR#8: Classify request type (deterministic, 0 LLM cost)
    const classifier = this.serviceManager.has('RequestClassifierService')
      ? this.serviceManager.get('RequestClassifierService')
      : null;
    const { type: requestType } = classifier?.classify(userMsg, history, resolvedMode)
      || { type: 'CONVERSATION' };

    // 4. Dispatch ke handler yang sesuai
    const handlerParams = {
      userMsg, history, workspaceId, userId, token,
      attachedFile, workspaceManager, onChunk, onDone, onError,
      resolvedMode, resolvedAppSource
    };

    if (requestType === 'LOOKUP') {
      return this._handleLookup(handlerParams);
    }

    // Dispatch SKILL → _handleSkill()
    if (requestType === 'SKILL') {
      const { metadata } = classifier.classify(userMsg, history, resolvedMode);
      const skillReg = this.serviceManager.has('SkillRegistry')
        ? this.serviceManager.get('SkillRegistry')
        : null;
      const skill = skillReg?.getSkill(metadata?.skillId);
      if (skill) {
        return this._handleSkill({ ...handlerParams, skill });
      }
      // Fallback ke CONVERSATION jika skill tidak ditemukan
      console.warn(`[processMessage] Skill "${metadata?.skillId}" tidak ditemukan — fallback ke CONVERSATION`);
    }

    // COMMAND, ENGINEER, CONVERSATION → semua lewat ConversationHandler
    // CommandRegistry dipanggil downstream setelah LLM respond (via PR#1 flow)
    return this._handleConversation(handlerParams);
  }

  // =============================================
  // PR#8 — LOOKUP HANDLER (ringan, cepat, murah)
  // =============================================

  /**
   * Handle pesan tipe LOOKUP — pertanyaan faktual singkat.
   * SKIP: memory retrieval, RAG, semantic context, CMG validation.
   * Hanya: get AI provider → build minimal payload → fetch → handle response.
   *
   * @private
   */
  async _handleLookup({
    userMsg, history, userId, token, workspaceManager,
    resolvedMode, resolvedAppSource, onChunk, onDone, onError
  }) {
    console.log('[AssistantService] PR#8 → _handleLookup (skip memory/RAG/semantic)');

    // Get AI provider config
    let aiProvider = 'gemini';
    let formattedModel = '';
    let aiKey = '';
    try {
      const brainService = this.serviceManager.get('BrainService');
      if (brainService) {
        const context = await brainService.getActiveBrainContext();
        aiProvider = context.provider || 'gemini';
        formattedModel = context.model || '';
        aiKey = context.key || '';
      }
    } catch (e) {
      console.warn('[AssistantService] BrainService not available:', e);
    }

    // Payload minimal — tidak ada globalMemory atau semanticContext
    const payload = {
      message: userMsg,
      mode: 'LOOKUP',              // flag ke Edge Function
      appSource: resolvedAppSource,
      workspaceTarget: null,
      history: history.slice(-3),  // hanya 3 pesan terakhir (bukan 10)
      globalMemory: '',            // sengaja kosong — tidak butuh RAG
      semanticContext: '',         // sengaja kosong
      stream: false,
      ragEnabled: false,
      model: formattedModel || undefined,
      cache_hint: true,
      _request_type: 'LOOKUP'
    };
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    const headers = this.buildHeaders(token, aiProvider, aiKey);

    let response;
    try {
      response = await fetch(AGENT_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(payload) });
    } catch (fetchErr) {
      onError?.(`Gagal menghubungi server: ${fetchErr.message}`);
      return;
    }

    console.log(`[LIFECYCLE] LOOKUP response received (HTTP ${response.status})`);

    if (!response.ok) {
      let errorText = `HTTP error! status: ${response.status}`;
      try { const e = await response.json(); errorText = e.error || errorText; } catch (_) { errorText = (await response.text()) || errorText; }
      onError?.(`⚠️ Error: ${errorText}`);
      return;
    }

    // Reuse response handler yang sama dengan ConversationHandler
    await this._handleResponseStream(response, { userMsg, isEngineerMode: false, workspaceManager, onChunk, onDone, onError });
  }

  // =============================================
  // PR#8 / Skill Impl — SKILL HANDLER
  // =============================================

  /**
   * Handle pesan tipe SKILL — eksekusi prosedur multi-step yang didefinisikan Owner.
   *
   * Alur:
   * 1. Ambil skill dari SkillRegistry
   * 2. Validasi via SkillGuardService
   * 3. Eksekusi steps berurutan:
   *    - 'ask'      → kirim prompt sebagai pesan AI, tunggu jawaban Owner
   *    - 'generate' → kirim ke Edge Function dengan context dari jawaban sebelumnya
   *    - 'write'    → emit ke CommandRegistry (PR#1 confirmation)
   *    - 'read'     → baca file (stub, dikembangkan berikutnya)
   * 4. Log ke AuditLogService
   *
   * @private
   */
  async _handleSkill({
    skill, userMsg, history, userId, token, workspaceManager,
    resolvedMode, resolvedAppSource, onChunk, onDone, onError
  }) {
    console.log(`[AssistantService] Skill → _handleSkill("${skill.id}")`);

    // 1. Validasi via SkillGuardService
    const guard = this.serviceManager.has('SkillGuardService')
      ? this.serviceManager.get('SkillGuardService')
      : null;

    const validation = guard ? guard.validate(skill) : { allowed: true, stepPolicies: [] };

    if (!validation.allowed) {
      const msg = `⚠️ Skill "${skill.name}" tidak bisa dijalankan: ${validation.reason}`;
      console.warn('[SkillHandler]', msg);
      onDone?.(msg, [], null);
      return;
    }

    this.eventBus.emit('Skill:Started', { skillId: skill.id, skillName: skill.name });
    const startedAt = Date.now();

    // 2. Context yang diakumulasi selama eksekusi multi-step
    const skillContext = {
      skillId: skill.id,
      skillName: skill.name,
      answers: [],    // Jawaban dari Owner untuk step 'ask'
      outputs: [],    // Output generate dari setiap step
      currentStep: 0
    };

    // 3. Eksekusi steps berurutan
    for (let i = 0; i < skill.steps.length; i++) {
      const step = skill.steps[i];
      const stepPolicy = validation.stepPolicies?.[i]?.policy || 'ALLOW';
      skillContext.currentStep = i + 1;

      console.log(`[SkillHandler] Step ${i + 1}/${skill.steps.length}: action=${step.action}`);

      // — STEP: ask — kirim prompt, tunggu jawaban di pesan berikutnya
      if (step.action === 'ask') {
        // Format pesan tanya yang jelas — sertakan progress step
        const askMsg = `**[Skill: ${skill.name} — Langkah ${i + 1}/${skill.steps.length}]**\n\n${step.prompt}`;

        // Simpan jawaban dari history jika sudah ada (multi-turn skill)
        // Untuk sekarang: kirim pertanyaan pertama, berikutnya lewat history
        if (i === 0) {
          // Step pertama: kirim pertanyaan ke Owner
          onDone?.(askMsg, [], null, { isSkillStep: true, skillId: skill.id, stepIndex: i });
          this.eventBus.emit('Skill:StepDone', { skillId: skill.id, step: i + 1, action: 'ask' });
          // Skill multi-turn akan dilanjutkan di pesan berikutnya via history
          // Untuk versi ini, selesaikan skill sampai di sini dan beri tahu Owner
          const continueMsg = `\n\n_Jawab pertanyaan di atas, kemudian saya akan melanjutkan ke langkah berikutnya._`;
          // Simpan state skill ke EventBus untuk dilanjutkan
          this.eventBus.emit('Skill:AwaitingAnswer', {
            skillId: skill.id,
            stepIndex: i,
            remainingSteps: skill.steps.slice(i + 1)
          });
          return;
        } else {
          // Step berikutnya: ambil jawaban dari history terakhir
          const lastUserMsg = history.slice().reverse().find(m => m.role === 'user')?.content || '';
          skillContext.answers.push({ step: i + 1, answer: lastUserMsg });
        }
      }

      // — STEP: generate — kirim ke LLM dengan context terkumpul
      if (step.action === 'generate') {
        // Bangun prompt yang menyertakan semua jawaban yang terkumpul
        let contextSummary = '';
        if (skillContext.answers.length > 0) {
          contextSummary = skillContext.answers
            .map(a => `Jawaban langkah ${a.step}: ${a.answer}`)
            .join('\n');
        }

        const generatePrompt = contextSummary
          ? `${step.prompt}\n\nKonteks dari jawaban sebelumnya:\n${contextSummary}`
          : step.prompt;

        // Kirim ke Edge Function dengan payload minimal
        const { aiProvider, formattedModel, aiKey } = await this._resolveAIProvider();
        const payload = {
          message: generatePrompt,
          mode: resolvedMode || 'STANDARD',
          appSource: resolvedAppSource,
          history: history.slice(-5),
          globalMemory: '',
          semanticContext: '',
          stream: false,
          ragEnabled: false,
          model: formattedModel || undefined,
          cache_hint: true,
          _request_type: 'SKILL',
          _skill_id: skill.id
        };
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

        const headers = this.buildHeaders(token, aiProvider, aiKey);
        let response;
        try {
          response = await fetch(AGENT_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(payload) });
        } catch (fetchErr) {
          onError?.(`Gagal menghubungi server saat eksekusi skill: ${fetchErr.message}`);
          this.eventBus.emit('Skill:Error', { skillId: skill.id, step: i + 1, reason: fetchErr.message });
          return;
        }

        if (!response.ok) {
          onError?.(`⚠️ Skill error HTTP ${response.status}`);
          this.eventBus.emit('Skill:Error', { skillId: skill.id, step: i + 1, reason: `HTTP ${response.status}` });
          return;
        }

        await this._handleResponseStream(response, {
          userMsg: generatePrompt,
          isEngineerMode: false,
          workspaceManager,
          onChunk,
          onDone,
          onError
        });

        skillContext.outputs.push({ step: i + 1, done: true });
        this.eventBus.emit('Skill:StepDone', { skillId: skill.id, step: i + 1, action: 'generate' });
      }

      // — STEP: write — butuh konfirmasi (PR#1 flow)
      if (step.action === 'write') {
        if (stepPolicy === 'REQUIRE_CONFIRMATION') {
          const confirmMsg = `⚠️ Skill "${skill.name}" ingin menulis file. Konfirmasi diperlukan via CommandRegistry.`;
          onDone?.(confirmMsg, [], null);
          this.eventBus.emit('Skill:StepDone', { skillId: skill.id, step: i + 1, action: 'write', requiresConfirmation: true });
        }
      }

      // — STEP: read — stub (belum implementasi penuh)
      if (step.action === 'read') {
        console.log(`[SkillHandler] Step read — stub, path: ${step.path || '(tidak ada)'}`);
        skillContext.answers.push({ step: i + 1, answer: `[read: ${step.path || 'tidak ada path'}]` });
        this.eventBus.emit('Skill:StepDone', { skillId: skill.id, step: i + 1, action: 'read' });
      }
    }

    // 4. Skill selesai
    const duration = Date.now() - startedAt;
    this.eventBus.emit('Skill:Completed', {
      skillId: skill.id,
      totalSteps: skill.steps.length,
      duration
    });
    console.log(`[SkillHandler] Skill "${skill.id}" selesai dalam ${duration}ms`);

    // 5. Log ke AuditLogService jika tersedia
    const auditLog = this.serviceManager.has('AuditLogService')
      ? this.serviceManager.get('AuditLogService')
      : null;
    if (auditLog) {
      auditLog.log({
        type: 'SKILL_EXECUTED',
        skillId: skill.id,
        skillName: skill.name,
        steps: skill.steps.length,
        duration,
        triggeredBy: userMsg
      });
    }
  }

  /**
   * Helper: resolve AI provider dari BrainService.
   * Dipakai oleh _handleSkill dan _handleLookup.
   * @private
   */
  async _resolveAIProvider() {
    let aiProvider = 'gemini';
    let formattedModel = '';
    let aiKey = '';
    try {
      const brainService = this.serviceManager.get('BrainService');
      if (brainService) {
        const context = await brainService.getActiveBrainContext();
        aiProvider = context.provider || 'gemini';
        formattedModel = context.model || '';
        aiKey = context.key || '';
      }
    } catch (e) {
      console.warn('[AssistantService] BrainService not available:', e);
    }
    return { aiProvider, formattedModel, aiKey };
  }

  // =============================================
  // PR#8 — CONVERSATION HANDLER (alur penuh)
  // =============================================

  /**
   * Handle pesan tipe CONVERSATION/ENGINEER/COMMAND — alur lengkap.
   * Ini adalah logika yang sebelumnya ada di processMessage().
   *
   * @private
   */
  async _handleConversation({
    userMsg, history, workspaceId, userId, token,
    attachedFile, workspaceManager, resolvedMode, resolvedAppSource,
    onChunk, onDone, onError
  }) {
    const isEngineerMode = resolvedMode === 'ENGINEER';
    const isLiteMode = resolvedMode === 'LITE';

    console.log(`[AssistantService] Mode check: workspace=${workspaceId}, resolvedMode=${resolvedMode}`);

    // 3. Get AI provider config dari BrainService
    let aiProvider = 'gemini';
    let formattedModel = '';
    let aiKey = '';
    try {
      const brainService = this.serviceManager.get('BrainService');
      if (brainService) {
        const context = await brainService.getActiveBrainContext();
        aiProvider = context.provider || 'gemini';
        formattedModel = context.model || '';
        aiKey = context.key || '';
      }
    } catch (e) {
      console.warn('[AssistantService] BrainService not available:', e);
    }

    // 4. Inject memory + semantic context
    const { localContext, semanticContext } = await this.buildContextInjection(
      userMsg, resolvedMode, userId
    );

    // 4b. PR#9: 3-Tier Retrieval Orchestrator — ambil knowledge/RAG context (terpisah dari memory)
    let knowledgeContext = '';
    const retrievalOrchestrator = this.serviceManager?.get('RetrievalOrchestrator');
    if (retrievalOrchestrator && !isLiteMode) {
      try {
        const retrievalResult = await retrievalOrchestrator.retrieve(userMsg, { limit: 5 });
        if (retrievalResult && retrievalResult.formattedContext) {
          knowledgeContext = retrievalResult.formattedContext;
          console.log(`[AssistantService] PR#9 RetrievalOrchestrator: Tier ${retrievalResult.tier}, strategy=${retrievalResult.strategy}, sufficiency=${retrievalResult.sufficiency}`);
        }
      } catch (err) {
        console.warn('[AssistantService] RetrievalOrchestrator query error (fallback):', err.message);
      }
    }

    // Gabungkan localContext (Memory) + knowledgeContext (RAG Knowledge)
    let combinedContext = '';
    if (localContext && knowledgeContext) {
      combinedContext = `${localContext}\n\n${knowledgeContext}`;
    } else {
      combinedContext = knowledgeContext || localContext || '';
    }

    let enhancedRagContext = combinedContext;

    // 4c. PR#2: Cognitive Memory Governor — validasi memory sebelum dikirim ke LLM
    if (enhancedRagContext && LEGACY_COGNITION_ENABLED) {
      try {
        const governorResult = runCognitiveMemoryGovernor({
          final_decision_context: { memory: { active: { content: enhancedRagContext } }, confidence_score: 0.8 },
          memory_context: { tgml_nodes: [], conflict_edges: [] },
          truth_score_bundle: null,
          behavior_profile: null,
          global_loop_result: null
        });
        if (governorResult.status === 'REJECT') {
          console.warn('[AssistantService] CMG REJECT — mengirim tanpa memory context');
          enhancedRagContext = '';
        } else if (governorResult.status === 'REWRITE') {
          console.warn('[AssistantService] CMG REWRITE — confidence diturunkan');
        }
      } catch (e) {
        console.warn('[AssistantService] CMG error (skip):', e.message);
      }
    }

    // 5. Build file data
    const fileData = await this.buildFileData(attachedFile);

    // 6. PR#6: Context trimming
    const rawRagLen = (enhancedRagContext || '').length;
    const rawSemLen = (semanticContext || '').length;

    let trimmedRagContext = enhancedRagContext || '';
    if (trimmedRagContext.length > MAX_RAG_CONTEXT_CHARS) {
      trimmedRagContext = trimmedRagContext.slice(0, MAX_RAG_CONTEXT_CHARS) +
        '\n[...konteks RAG dipotong untuk efisiensi token...]';
    }

    let trimmedSemanticContext = semanticContext || '';
    if (trimmedSemanticContext.length > MAX_SEMANTIC_CONTEXT_CHARS) {
      trimmedSemanticContext = trimmedSemanticContext.slice(0, MAX_SEMANTIC_CONTEXT_CHARS) +
        '\n[...konteks semantik dipotong...]';
    }

    const tokensBefore = estimateTokens(enhancedRagContext) + estimateTokens(semanticContext) + estimateTokens(userMsg);
    const tokensAfter  = estimateTokens(trimmedRagContext) + estimateTokens(trimmedSemanticContext) + estimateTokens(userMsg);
    const tokensSaved  = tokensBefore - tokensAfter;
    console.log(`[PR#6 TokenEfficiency] RAG: ${rawRagLen}→${trimmedRagContext.length} chars | Semantic: ${rawSemLen}→${trimmedSemanticContext.length} chars`);
    console.log(`[PR#6 TokenEfficiency] Estimasi token: ${tokensBefore} → ${tokensAfter} (hemat ~${tokensSaved} token)`);

    // 7. Build payload
    const payload = {
      message: userMsg,
      mode: resolvedMode,
      appSource: resolvedAppSource,
      workspaceTarget: workspaceId,
      history: history.slice(isLiteMode ? -5 : -10),
      globalMemory: trimmedRagContext,
      semanticContext: trimmedSemanticContext,
      stream: false,
      ragEnabled: true,
      model: formattedModel || undefined,
      file: fileData || undefined,
      requestedFilePath: isEngineerMode ? this.extractFilePathFromMessage(userMsg) : undefined,
      tools: isLiteMode ? ['rag_search', 'web_search', 'deep_research'] : undefined,
      cache_hint: true,
      _token_meta: { estimated_before: tokensBefore, estimated_after: tokensAfter, saved: tokensSaved },
      _request_type: 'CONVERSATION'
    };
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    // 8. Build headers & fetch
    const headers = this.buildHeaders(token, aiProvider, aiKey);
    let response;
    try {
      response = await fetch(AGENT_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(payload) });
    } catch (fetchErr) {
      onError?.(`Gagal menghubungi server: ${fetchErr.message}`);
      return;
    }

    console.log(`[LIFECYCLE] LLM response received (HTTP Status: ${response.status})`);

    if (!response.ok) {
      let errorText = `HTTP error! status: ${response.status}`;
      try { const errorData = await response.json(); errorText = errorData.error || errorText; }
      catch (_) { errorText = (await response.text()) || errorText; }
      console.error('[LIFECYCLE] Edge Function Error:', errorText);
      onError?.(`⚠️ Error: ${errorText}`);
      return;
    }

    await this._handleResponseStream(response, { userMsg, isEngineerMode, workspaceManager, onChunk, onDone, onError });
  }

  // =============================================
  // SHARED — Response Stream Handler
  // =============================================

  /**
   * Handle JSON/streaming response dari Edge Function.
   * Dipakai bersama oleh _handleLookup dan _handleConversation.
   * @private
   */
  async _handleResponseStream(response, { userMsg, isEngineerMode, workspaceManager, onChunk, onDone, onError }) {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      console.log('[LIFECYCLE] Received JSON response (DIRECT mode)');
      const jsonData = await response.json();
      const rawContent = typeof (jsonData.message || jsonData) === 'string'
        ? (jsonData.message || jsonData)
        : JSON.stringify(jsonData.message || jsonData);

      const hasPatch = isEngineerMode && rawContent.includes('[MAMET_PATCH_READY]');
      const cleanContent = hasPatch ? rawContent.replace('[MAMET_PATCH_READY]', '').trim() : rawContent;

      onDone?.(cleanContent, jsonData.processingSteps || [], jsonData, { hasPatch, patchOriginalTask: hasPatch ? userMsg : undefined });

      if (workspaceManager?.openWidgetInWorkbench) {
        workspaceManager.openWidgetInWorkbench('right', 'widget:maef-monitor', { focusStep: 'execution', logs: jsonData });
      }
      return;
    }

    // Streaming path
    let reader, decoder;
    try {
      reader = response.body.getReader();
      decoder = new TextDecoder('utf-8');
    } catch (streamErr) {
      console.error('[LIFECYCLE] Failed to get stream reader:', streamErr);
      onError?.('⚠️ Error: Gagal membaca aliran data.');
      return;
    }

    let done = false;
    let aiResponseText = '';
    let processingSteps = [];
    let buffer = '';

    console.log('[LIFECYCLE] Stream started');
    onChunk?.('', '', []);

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.step) processingSteps.push(parsed.step);

              let chunkText = '';
              if (parsed.text) {
                chunkText = parsed.text;
              } else if (parsed.choices?.[0]?.delta?.content) {
                chunkText = parsed.choices[0].delta.content;
              }

              if (chunkText) aiResponseText += chunkText;
              onChunk?.(chunkText, aiResponseText, [...processingSteps]);
            } catch (err) {
              console.error('[LIFECYCLE] Exception during chunk processing:', err);
              aiResponseText += `\n\n[System Error: Gagal memproses aliran data. Root Cause: ${err.message}]`;
              onChunk?.('', aiResponseText, [...processingSteps]);
              done = true;
            }
          }
        }
      }
    }

    console.log('[LIFECYCLE] Stream completed');

    const hasPatch = isEngineerMode && aiResponseText.includes('[MAMET_PATCH_READY]');
    const finalText = hasPatch
      ? aiResponseText.replace('[MAMET_PATCH_READY]', '').trim()
      : aiResponseText;

    onDone?.(finalText, processingSteps, null, {
      hasPatch,
      patchOriginalTask: hasPatch ? userMsg : undefined
    });

    // OS Execution Interceptor (Electron only)
    await this._runOSInterceptor(finalText, userMsg, workspaceManager, onChunk, onDone, onError);
  }

  // =============================================
  // OS EXECUTION INTERCEPTOR
  // =============================================

  /**
   * Jalankan desktop interceptor setelah AI selesai merespons.
   * Memanfaatkan `runDesktopInterceptors` dari useDesktopInterceptor.js
   * yang sudah ada — tidak duplikasi logika.
   *
   * @private
   */
  async _runOSInterceptor(finalAiResponseText, originalUserMsg, workspaceManager, onChunk, onDone, onError) {
    if (!window.electronAPI) return;

    // Ambil osState dari workspaceManager jika tersedia
    const osState = workspaceManager?.osState;
    if (!osState?.capabilities?.includes('cap:code-execution')) return;

    // Import runDesktopInterceptors — sudah diekstrak di useDesktopInterceptor.js
    try {
      const { runDesktopInterceptors } = await import('../../../components/AIAgent/hooks/useDesktopInterceptor.js');
      const { interceptHit, autoReply } = await runDesktopInterceptors(finalAiResponseText);

      if (interceptHit && autoReply) {
        // Feed output kembali ke AI setelah 1 detik
        setTimeout(() => {
          this.processMessage({
            userMsg: `[OS EXECUTION REPORT]\nBerikut adalah hasil eksekusi dari tindakan otomatis Anda di sistem operasi lokal user.\n${autoReply}`,
            history: [],
            workspaceId: workspaceManager?.activeWorkspaceId || 'ws-assistant',
            userId: null,
            token: '',
            attachedFile: null,
            workspaceManager,
            onChunk,
            onDone,
            onError
          });
        }, 1000);
      }
    } catch (e) {
      console.warn('[AssistantService] OS Interceptor import failed:', e);
    }
  }

  // =============================================
  // CHAT PERSISTENCE
  // =============================================

  /**
   * Simpan riwayat chat ke Supabase.
   * @param {Object} params
   * @param {Array}  params.messages
   * @param {string|null} params.chatId - null untuk INSERT baru
   * @param {string} params.userId
   * @param {string} params.workspaceId
   * @param {Function} params.onNewChatId - callback(newId) saat INSERT berhasil
   * @returns {Promise<void>}
   */
  async saveChatToDB({ messages, chatId, userId, workspaceId, onNewChatId }) {
    if (!messages || messages.length === 0) return;
    if (!userId) return;

    // Gunakan supabase client dari modul yang sudah ada
    const { supabase } = await import('../../../supabase.js');

    const title = messages[0]?.content?.substring(0, 50) || 'Percakapan Baru';
    const payload = {
      user_id: userId,
      title,
      messages,
      updated_at: new Date().toISOString(),
      workspace_type: workspaceId || 'ws-assistant'
    };

    let result;
    if (chatId) {
      result = await supabase.from('chats').update(payload).eq('id', chatId);
    } else {
      result = await supabase.from('chats').insert(payload).select('id').single();
      if (result.data?.id) {
        onNewChatId?.(result.data.id);
      }
    }

    if (result?.error) {
      console.error('[AssistantService] Gagal menyimpan chat:', result.error);
    } else {
      // Verifikasi integritas memori sesi Assistant (golden source alignment)
      const effectiveChatId = chatId || result?.data?.id;
      await this.finalizeAssistantSession({ userId, chatId: effectiveChatId });
    }
  }

  /**
   * Finalisasi sesi Assistant: memverifikasi integritas golden memory yang disimpan selama sesi.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} [params.chatId]
   * @returns {Promise<Object|null>}
   */
  async finalizeAssistantSession({ userId, chatId }) {
    try {
      const governor = this.serviceManager.has('MemoryGovernorService')
        ? this.serviceManager.get('MemoryGovernorService')
        : null;

      if (governor && typeof governor.verifyAssistantSession === 'function' && userId) {
        const res = await governor.verifyAssistantSession({ userId, chatId });
        console.log('[AssistantService] Sesi Assistant difinalisasi:', res);
        return res;
      }
    } catch (e) {
      console.warn('[AssistantService] Finalisasi sesi error:', e.message);
    }
    return null;
  }

  /**
   * Muat riwayat chat dari Supabase.
   * @param {string} chatId
   * @returns {Promise<Array|null>} - array messages atau null jika tidak ditemukan
   */
  async loadChat(chatId) {
    if (!chatId) return null;
    const { supabase } = await import('../../../supabase.js');
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single();

    if (error) {
      console.error('[AssistantService] loadChat error:', error);
      return null;
    }
    return data?.messages || [];
  }

  // =============================================
  // ENGINEER COMMAND (PR#1 integration point)
  // =============================================

  /**
   * Jalankan command dari Engineer mode melalui CommandRegistry (PR#1).
   * Whitelist-first: hanya command terdaftar yang bisa dieksekusi.
   *
   * @param {string} commandName - nama command dari CommandRegistry (atau raw cmd untuk legacy)
   * @param {Object} args        - { path, content, sourcePath, targetPath, ... }
   * @param {Object} [context]   - { userMsg, userId } untuk audit log
   * @returns {Promise<{ output: string, success: boolean, needsConfirmation?: boolean, confirmationReason?: string }>}
   */
  async runCommand(commandName, args = {}, context = {}) {
    const commandRegistry = this.serviceManager.get('CommandRegistry');
    const auditLogService = this.serviceManager.get('AuditLogService');

    // Fallback: jika CommandRegistry belum siap (boot timing), pakai electronAPI langsung
    if (!commandRegistry) {
      console.warn('[AssistantService] CommandRegistry tidak tersedia, fallback ke electronAPI langsung');
      return this._runCommandLegacy(commandName, context);
    }

    // 1. Prepare: cek whitelist + boundary
    const preparation = commandRegistry.prepareExecution(commandName, args);

    if (!preparation.canProceed) {
      // Command tidak ada di whitelist — tolak
      return { output: preparation.reason, success: false };
    }

    if (preparation.needsConfirmation) {
      // Emit ke EventBus — UI yang menampilkan dialog, bukan service
      // Setelah user konfirmasi, UI memanggil assistantService.confirmAndRunCommand()
      const eventBus = this.serviceManager.get('EventBus');
      if (eventBus) {
        eventBus.emit('Command:ConfirmationRequired', {
          commandName,
          args,
          isDestructive: preparation.isDestructive,
          inWorkspace: preparation.inWorkspace,
          reason: preparation.reason,
          context
        });
      }
      return {
        output: '',
        success: false,
        needsConfirmation: true,
        isDestructive: preparation.isDestructive,
        inWorkspace: preparation.inWorkspace,
        confirmationReason: preparation.reason,
        _pendingCommand: { commandName, args }
      };
    }

    // 2. Eksekusi langsung (tidak perlu konfirmasi)
    return this._executeAndLog({ commandName, args, preparation, context, commandRegistry, auditLogService });
  }

  /**
   * Eksekusi command setelah konfirmasi user (dipanggil dari UI).
   *
   * @param {string} commandName
   * @param {Object} args
   * @param {Object} [context] - { userMsg, userId }
   * @returns {Promise<{ output: string, success: boolean }>}
   */
  async confirmAndRunCommand(commandName, args = {}, context = {}) {
    const commandRegistry = this.serviceManager.get('CommandRegistry');
    const auditLogService = this.serviceManager.get('AuditLogService');

    if (!commandRegistry) {
      return this._runCommandLegacy(commandName, context);
    }

    const preparation = commandRegistry.prepareExecution(commandName, args);
    return this._executeAndLog({ commandName, args, preparation, context, commandRegistry, auditLogService });
  }

  /**
   * @private Eksekusi + log audit.
   */
  async _executeAndLog({ commandName, args, preparation, context, commandRegistry, auditLogService }) {
    const result = await commandRegistry.executeConfirmed(commandName, args);

    // Audit log (async, tidak blocking)
    auditLogService?.logCommand({
      userMsg:      context.userMsg    || '',
      commandName,
      targetPath:   args.path || args.targetPath || '',
      inWorkspace:  preparation.inWorkspace  ?? true,
      isDestructive: preparation.isDestructive ?? false,
      success:      result.success,
      output:       result.output || result.error || '',
      userId:       context.userId || null
    }).catch(err => console.warn('[AssistantService] Audit log gagal:', err));

    // Emit audit trail ke Engineer SessionArtifact
    try {
      const eventBus = this.serviceManager.get('EventBus');
      eventBus?.emit('Engineer:CommandExecuted', {
        command: commandName,
        status: result.success ? 'success' : 'error',
        output: result.output || result.error || ''
      });
    } catch (_) {}

    return { output: result.output || result.error || '', success: result.success };
  }

  /**
   * @private Fallback ke electronAPI langsung (backward compat saat boot).
   */
  async _runCommandLegacy(rawCmd, context = {}) {
    if (!window.electronAPI) {
      return { output: 'Electron API tidak tersedia (bukan desktop mode).', success: false };
    }
    try {
      const result = await window.electronAPI.runTerminalCommand(rawCmd);
      const output = result?.output || result?.error || 'Command selesai (tidak ada output).';
      const success = !!result?.success;
      try {
        const eventBus = this.serviceManager.get('EventBus');
        eventBus?.emit('Engineer:CommandExecuted', { command: rawCmd, status: success ? 'success' : 'error', output });
      } catch (_) {}
      return { output, success };
    } catch (err) {
      return { output: err?.message || String(err), success: false };
    }
  }

  /**
   * Rollback patch via git stash.
   * @param {string|null} checkpointRef
   * @returns {Promise<{ success: boolean, output?: string, error?: string, cancelled?: boolean }>}
   */
  async rollback(checkpointRef) {
    if (!window.electronAPI?.gitRollback) {
      return { success: false, error: 'Rollback tidak tersedia (bukan desktop mode).' };
    }
    try {
      const result = await window.electronAPI.gitRollback(checkpointRef);
      return result;
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  /**
   * Refresh memory untuk query tertentu.
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async refreshMemory(query) {
    const memoryService = this.serviceManager.get('MemoryService');
    if (!memoryService || !query) return [];
    try {
      return await memoryService.getMemory(query) || [];
    } catch (err) {
      console.warn('[AssistantService] refreshMemory gagal:', err);
      return [];
    }
  }
}
