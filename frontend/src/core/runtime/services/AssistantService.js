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
  async handleMemoryTrigger(userMsg) {
    const memoryKeywords = ['ingat', 'simpan', 'catat', 'remember', 'save', 'store'];
    const lowerMsg = userMsg.toLowerCase();
    const hasMemoryKeyword = memoryKeywords.some(k => lowerMsg.includes(k));

    if (!hasMemoryKeyword) return { handled: false, responseContent: '' };

    const kernel = this.serviceManager?.get ? null : null; // serviceManager is already the manager
    const memoryService = this.serviceManager.get('MemoryService');
    if (!memoryService) return { handled: false, responseContent: '' };

    const contentToRemember = userMsg
      .replace(/(ingat|simpan|catat|remember|save|store)/gi, '')
      .trim();

    if (contentToRemember.length === 0) return { handled: false, responseContent: '' };

    try {
      const stored = await memoryService.storeMemory(contentToRemember, contentToRemember);
      if (stored) {
        return {
          handled: true,
          responseContent: `✅ Saya telah menyimpan: "${contentToRemember}" ke memori.`
        };
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
   * Proses pesan user — entry point utama dari ConversationEngine.
   *
   * @param {Object} params
   * @param {string} params.userMsg - pesan user
   * @param {Array}  params.history - riwayat pesan sebelumnya (sudah termasuk pesan user baru)
   * @param {string} params.workspaceId - workspace aktif
   * @param {string} params.userId - user ID dari Supabase session
   * @param {string} params.token - Supabase access token
   * @param {File|null} params.attachedFile - file attachment (opsional)
   * @param {Object} params.workspaceManager - untuk openWidgetInWorkbench
   *
   * @param {Function} params.onChunk - callback(chunkText, allText, steps) dipanggil tiap chunk stream
   * @param {Function} params.onDone - callback(finalText, steps, jsonMetadata) dipanggil saat selesai
   * @param {Function} params.onError - callback(errorMessage) dipanggil saat error
   *
   * @returns {Promise<void>}
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
    const isEngineerMode = resolvedMode === 'ENGINEER';
    const isLiteMode = resolvedMode === 'LITE';

    console.log(`[AssistantService] Mode check: workspace=${workspaceId}, resolvedMode=${resolvedMode}`);

    // 2. Memory trigger check (keyword: ingat/simpan/catat)
    const memoryResult = await this.handleMemoryTrigger(userMsg);
    if (memoryResult.handled) {
      onDone?.(memoryResult.responseContent, [], null);
      return;
    }

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

    // 4b. PR#5: Adaptive Retrieval — jika ada RAG context, proses lewat RetrievalStrategy
    let enhancedRagContext = localContext;
    const retrievalService = this.serviceManager.get('RetrievalStrategyService');
    if (retrievalService && localContext) {
      // Jika localContext berupa array of chunks (dari MemoryService), apply strategy
      // Jika sudah string biasa, lewati (backward compat)
      // RetrievalStrategyService.formatAsContext() akan dipakai jika ada chunk object
      // Untuk sekarang: localContext tetap dipakai langsung karena MemoryService
      // mengembalikan array of memory objects bukan raw chunk DB
      // → Integration point ini akan diaktifkan penuh saat KnowledgeService di-refactor
      console.log('[AssistantService] PR#5 RetrievalStrategy: ready, waiting for full RAG chunk integration');
    }

    // 4c. PR#2: Cognitive Memory Governor — validasi memory sebelum dikirim ke LLM
    // runCognitiveMemoryGovernor di-import secara static dari CognitiveMemoryGovernorService.js
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

    // 6. Build payload
    // PR#6: Token efficiency
    //   (a) Prompt caching: provider-specific cache breakpoint ditandai di system prompt
    //       (dikelola di Edge Function — AssistantService mengirim flag cache_hint)
    //   (b) Delegasi operasi berat: webSearch result hanya kirim summary, bukan raw HTML
    const payload = {
      message: userMsg,
      mode: resolvedMode,
      appSource: resolvedAppSource,
      workspaceTarget: workspaceId,
      history: history.slice(isLiteMode ? -5 : -10),
      globalMemory: enhancedRagContext,        // PR#5: mungkin sudah diproses RetrievalStrategy
      semanticContext: semanticContext,
      stream: false,
      ragEnabled: true,
      model: formattedModel || undefined,
      file: fileData || undefined,
      requestedFilePath: isEngineerMode ? this.extractFilePathFromMessage(userMsg) : undefined,
      tools: isLiteMode ? ['rag_search', 'web_search', 'deep_research'] : undefined,
      // PR#6: hint untuk Edge Function agar mengaktifkan prompt caching
      cache_hint: true
    };

    // Bersihkan key undefined
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    // 7. Build headers
    const headers = this.buildHeaders(token, aiProvider, aiKey);

    // 8. Fetch
    let response;
    try {
      response = await fetch(AGENT_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    } catch (fetchErr) {
      onError?.(`Gagal menghubungi server: ${fetchErr.message}`);
      return;
    }

    console.log(`[LIFECYCLE] LLM response received (HTTP Status: ${response.status})`);

    if (!response.ok) {
      let errorText = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorText = errorData.error || errorText;
      } catch (_) {
        errorText = (await response.text()) || errorText;
      }
      console.error('[LIFECYCLE] Edge Function Error:', errorText);
      onError?.(`⚠️ Error: ${errorText}`);
      return;
    }

    // 9. Handle JSON vs Stream response
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

      // Open lifecycle inspector
      if (workspaceManager?.openWidgetInWorkbench) {
        workspaceManager.openWidgetInWorkbench('right', 'widget:maef-monitor', { focusStep: 'execution', logs: jsonData });
      }
      return;
    }

    // 10. Streaming path
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
    onChunk?.('', '', []); // Signal streaming started (empty first frame)

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

    // 11. Detect patch proposal (streaming path)
    const hasPatch = isEngineerMode && aiResponseText.includes('[MAMET_PATCH_READY]');
    const finalText = hasPatch
      ? aiResponseText.replace('[MAMET_PATCH_READY]', '').trim()
      : aiResponseText;

    onDone?.(finalText, processingSteps, null, {
      hasPatch,
      patchOriginalTask: hasPatch ? userMsg : undefined
    });

    // 12. OS Execution Interceptor (Electron only)
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
    }
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
      // Kembalikan ke caller — UI yang akan tampilkan dialog
      // Setelah user konfirmasi, caller memanggil confirmAndRunCommand()
      return {
        output: '',
        success: false,
        needsConfirmation: true,
        isDestructive: preparation.isDestructive,
        inWorkspace: preparation.inWorkspace,
        confirmationReason: preparation.reason,
        // Payload untuk dipakai setelah konfirmasi
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
