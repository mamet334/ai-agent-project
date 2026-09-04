import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Globe } from 'lucide-react';
import { useWorkspace } from '../../core/workspace/WorkspaceContext';
import { supabase } from '../../supabase';
import { kernel } from '../../core/runtime/Kernel';
import FolderSelector from '../FolderSelector';
import ChatHistory from './ChatHistory';
import MemoryContextPanel from './MemoryContextPanel';

// =============================================
// HELPER: Parse thinking/answer dari respons AI
// =============================================
const parseThinkingContent = (text) => {
  if (!text) return { thinking: '', answer: '', isThinkingComplete: false };
  const startIndex = text.indexOf(' thinking');
  const endIndex = text.indexOf(' response');
  if (startIndex !== -1) {
    if (endIndex !== -1) {
      return {
        thinking: text.substring(startIndex + 7, endIndex).trim(),
        answer: text.substring(endIndex + 8).trim(),
        isThinkingComplete: true
      };
    }
    return { thinking: text.substring(startIndex + 7).trim(), answer: '', isThinkingComplete: false };
  }
  return { thinking: '', answer: text, isThinkingComplete: true };
};

// =============================================
// COMPONENT: ConversationEngine (Thin UI Layer)
//
// Tanggung jawab komponen ini setelah PR#3:
//   - useState untuk state UI (messages, input, loading, dll)
//   - useEffect untuk subscribe EventBus (Engineer events, Memory events)
//   - Delegasi semua logika bisnis ke AssistantService
//   - Rendering JSX
//
// Tidak ada lagi: fetch(), supabase.from(), kernel.serviceManager.get()
// untuk logika bisnis — semua ada di AssistantService.
// =============================================
export default function ConversationEngine({ sessionId }) {
  const { manager: workspaceManager, osState } = useWorkspace();

  // --- UI State ---
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [currentChatId, setCurrentChatId] = useState(() => {
    const saved = localStorage.getItem('mamet_v4_current_chat_id');
    return saved || null;
  });
  const [initialRestoreDone, setInitialRestoreDone] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);

  // --- Memory Context Panel State ---
  const [activeMemories, setActiveMemories] = useState([]);
  const [lastMemoryQuery, setLastMemoryQuery] = useState('');
  const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(true);
  const [isMemoryLoading, setIsMemoryLoading] = useState(false);

  // --- Engineer State ---
  const [engineerCmdStates, setEngineerCmdStates] = useState({});
  const [lastCheckpoint, setLastCheckpoint] = useState(null);
  const [rollbackState, setRollbackState] = useState('idle');

  // --- PR#1: Command Confirmation Dialog State ---
  // null = tidak ada dialog; objek = dialog aktif
  const [commandConfirmation, setCommandConfirmation] = useState(null);

  // --- PR#9: Tier 3 Web Comparison Confirmation State ---
  const [webConfirmation, setWebConfirmation] = useState(null);

  // --- Refs ---
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const isNewChatInitiatedByUser = useRef(false);
  const isInitialMount = useRef(true);
  const prevSessionIdRef = useRef(sessionId);

  // =============================================
  // HELPER: Dapatkan AssistantService & WebComparisonService dari Kernel
  // =============================================
  const getAssistantService = () => kernel.serviceManager?.get('AssistantService');
  const getWebComparisonService = () => kernel.serviceManager?.get('WebComparisonService');

  // =============================================
  // HELPER: Buka Lifecycle Inspector di Right Workbench
  // =============================================
  const openLifecycleInspector = (stepName, logs) => {
    workspaceManager.openWidgetInWorkbench('right', 'widget:maef-monitor', {
      focusStep: stepName,
      logs
    });
  };

  // =============================================
  // HELPER: Minimasi Semua Panel Samping (Mode Luas)
  // =============================================
  const handleMinimizeSidePanels = () => {
    setIsMemoryPanelOpen(false);
    if (workspaceManager?.closeWidget) {
      const rightWidgets = osState?.layout?.right_workbench || [];
      rightWidgets.forEach((wId) => {
        workspaceManager.closeWidget(wId);
      });
    }
  };

  // =============================================
  // HELPER: Toggle MAEF Monitor di Right Workbench
  // =============================================
  const handleToggleMaefMonitor = () => {
    const rightWidgets = osState?.layout?.right_workbench || [];
    if (rightWidgets.includes('widget:maef-monitor')) {
      workspaceManager?.closeWidget?.('widget:maef-monitor');
    } else {
      workspaceManager?.openWidgetInWorkbench?.('right', 'widget:maef-monitor');
    }
  };

  // =============================================
  // AUTO-GROW TEXTAREA
  // =============================================
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 192)}px`;
    }
  }, [input]);

  // =============================================
  // AUTO-SCROLL
  // =============================================
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // =============================================
  // LAYOUT RESIZE ON SIDEBAR TOGGLE
  // =============================================
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [isSidebarOpen]);

  const lastSavedKeyRef = useRef('');
  const isSavingRef = useRef(false);
  const osStateRef = useRef(osState);
  osStateRef.current = osState;

  // =============================================
  // PERSISTENSI: Auto-save messages (debounced & throttled)
  // =============================================
  useEffect(() => {
    // Jangan auto-save jika tidak ada pesan atau sedang streaming
    if (!messages || messages.length === 0 || isLoading) return;

    const currentLength = messages.length;
    const lastMsg = messages[messages.length - 1];
    const lastContentLen = (lastMsg?.content || '').length;
    const saveKey = `${currentChatId || 'new'}_${currentLength}_${lastContentLen}_${lastMsg?.role || ''}`;

    // Lewati jika pesan belum berubah sejak penyimpanan terakhir
    if (saveKey === lastSavedKeyRef.current) {
      return;
    }

    const timer = setTimeout(async () => {
      if (isSavingRef.current) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const assistantService = getAssistantService();
      if (!assistantService) return;

      isSavingRef.current = true;
      try {
        await assistantService.saveChatToDB({
          messages,
          chatId: currentChatId,
          userId: session.user.id,
          workspaceId: osStateRef.current?.workspaceId || 'ws-assistant',
          onNewChatId: (newId) => {
            setCurrentChatId(newId);
            localStorage.setItem('mamet_v4_current_chat_id', newId);
          }
        });
        lastSavedKeyRef.current = saveKey;
      } finally {
        isSavingRef.current = false;
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, currentChatId, isLoading]);

  // =============================================
  // PERSISTENSI: Sync currentChatId ke localStorage
  // =============================================
  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem('mamet_v4_current_chat_id', currentChatId);
    } else {
      localStorage.removeItem('mamet_v4_current_chat_id');
    }
  }, [currentChatId]);

  // =============================================
  // RESTORE: Chat dari localStorage saat mount
  // =============================================
  useEffect(() => {
    if (!initialRestoreDone && currentChatId) {
      const loadSavedChat = async () => {
        const assistantService = getAssistantService();
        // Fallback ke supabase langsung jika service belum ready (boot delay)
        let msgs = null;
        if (assistantService) {
          msgs = await assistantService.loadChat(currentChatId);
        } else {
          const { data, error } = await supabase.from('chats').select('*').eq('id', currentChatId).single();
          if (!error && data) msgs = data.messages;
        }
        if (msgs !== null) {
          setMessages(msgs || []);
        } else {
          console.warn('[ConversationEngine] Saved chatId not found in DB, resetting');
          setCurrentChatId(null);
          localStorage.removeItem('mamet_v4_current_chat_id');
        }
        setInitialRestoreDone(true);
      };
      loadSavedChat();
    } else if (!currentChatId) {
      setInitialRestoreDone(true);
    }
  }, []); // Hanya sekali saat mount

  // =============================================
  // SESSION ID SYNC
  // =============================================
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  // =============================================
  // NEW CHAT
  // =============================================
  const handleNewChat = () => {
    isNewChatInitiatedByUser.current = true;
    setMessages([]);
    setCurrentChatId(null);
    localStorage.removeItem('mamet_v4_current_chat_id');
  };

  // =============================================
  // LOAD CHAT (dari ChatHistory sidebar)
  // =============================================
  const handleLoadChat = async (chatId) => {
    const assistantService = getAssistantService();
    let msgs = null;
    if (assistantService) {
      msgs = await assistantService.loadChat(chatId);
    } else {
      const { data, error } = await supabase.from('chats').select('*').eq('id', chatId).single();
      if (error) { console.error(error); return; }
      msgs = data?.messages;
    }
    if (msgs !== null) setMessages(msgs || []);
    setCurrentChatId(chatId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  // =============================================
  // COPY TO CLIPBOARD
  // =============================================
  const handleCopy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.warn('[ConversationEngine] Gagal menyalin:', err);
    }
  };

  // =============================================
  // EVENTBUS LISTENERS — Engineer Events
  // =============================================
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;

    const handler = (wrappedPayload) => {
      const rec = wrappedPayload?.data || wrappedPayload;
      if (rec.type === 'PATCH_APPLIED') {
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIndex = newMsgs.length - 1;
          if (lastIndex >= 0 && newMsgs[lastIndex].content.includes('Engineer sedang menyiapkan patch')) {
            newMsgs[lastIndex] = { role: 'model', content: `✅ **Patch Berhasil Diterapkan!**\n\n${rec.message}\n\n_File telah dimodifikasi sesuai instruksi Anda._` };
            return newMsgs;
          }
          return [...prev, { role: 'model', content: `✅ **Patch Berhasil Diterapkan!**\n\n${rec.message}\n\n_File telah dimodifikasi sesuai instruksi Anda._` }];
        });
      } else if (rec.type === 'PATCH_REJECTED') {
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIndex = newMsgs.length - 1;
          if (lastIndex >= 0 && newMsgs[lastIndex].content.includes('Engineer sedang menyiapkan patch')) {
            newMsgs[lastIndex] = { role: 'model', content: `❌ **Patch Ditolak**\n\n${rec.message}` };
            return newMsgs;
          }
          return [...prev, { role: 'model', content: `❌ **Patch Ditolak**\n\n${rec.message}` }];
        });
      } else if (rec.type === 'PATCH_VERIFICATION_FAILED' || rec.type === 'ERROR') {
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIndex = newMsgs.length - 1;
          if (lastIndex >= 0 && newMsgs[lastIndex].content.includes('Engineer sedang menyiapkan patch')) {
            newMsgs[lastIndex] = { role: 'model', content: `⚠️ **Patch Gagal**\n\n${rec.message || 'Terjadi kesalahan saat menerapkan patch.'}` };
            return newMsgs;
          }
          return [...prev, { role: 'model', content: `⚠️ **Patch Gagal**\n\n${rec.message || 'Terjadi kesalahan.'}` }];
        });
      } else if (rec.type === 'CAPABILITY_BLOCKED') {
        setMessages(prev => [...prev, { role: 'model', content: rec.message, isReasoningBlock: false }]);
      } else if (rec.type === 'REASONING_REJECTED') {
        setMessages(prev => [...prev, { role: 'model', content: rec.message, isReasoningBlock: false }]);
      } else if (rec.type === 'ASK_CLARIFICATION') {
        setMessages(prev => [...prev, { role: 'model', content: rec.message, isReasoningBlock: false }]);
      } else if (['READ_REPO_RESULT', 'READ_REPO_LISTING', 'READ_REPO_SEARCH_RESULT', 'READ_REPO_CLARIFICATION', 'READ_REPO_NOT_FOUND', 'READ_REPO_ERROR', 'READ_REPO_EMPTY'].includes(rec.type)) {
        setMessages(prev => [...prev, { role: 'model', content: rec.message }]);
      }
    };

    const unsubscribe = eventBus.on('Engineer:Recommendation', handler);
    return unsubscribe;
  }, []);

  // ENGINEER ROLLBACK: Listen Engineer:PatchApplied
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;
    const patchAppliedHandler = (result) => {
      const data = result?.data || result;
      if (data?.checkpointRef) {
        setLastCheckpoint({ ref: data.checkpointRef, patchId: data.patchId, appliedAt: new Date().toLocaleTimeString('id-ID') });
        setRollbackState('idle');
      }
      const files = data?.files?.filter(f => f.status === 'APPLIED').map(f => f.path) || [];
      const successMsg = data?.successCount > 0
        ? `✅ **Patch Berhasil!** ${data.successCount} file diubah${data.skippedCount > 0 ? `, ${data.skippedCount} dilewati` : ''}.${files.length > 0 ? '\n\n📁 ' + files.join('\n📁 ') : ''}${data.checkpointRef ? '\n\n💾 Checkpoint dibuat — Anda bisa rollback.' : ''}`
        : `⚠️ Patch selesai tapi ${data?.failCount || 0} file gagal.`;
      setMessages(prev => [...prev, { role: 'model', content: successMsg, isPatchResult: true, checkpointRef: data?.checkpointRef || null }]);
    };
    const unsubPatch = eventBus.on('Engineer:PatchApplied', patchAppliedHandler);
    return unsubPatch;
  }, []);

  // PERSISTENT PATCH
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;
    const persistedHandler = (wrappedPayload) => {
      const data = wrappedPayload?.data || wrappedPayload;
      setMessages(prev => [...prev, { role: 'model', content: data.message || `📋 Ada patch pending dari sesi sebelumnya (ID: ${data.patchId}).`, isPatchPersisted: true, patchId: data.patchId }]);
    };
    const unsubPersisted = eventBus.on('Engineer:PatchPersisted', persistedHandler);
    return unsubPersisted;
  }, []);

  // READ_REPO: File Content
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;
    const fileContentHandler = (payload) => {
      const data = payload?.data || payload;
      const { path, content, size, backend } = data;
      const ext = path?.split('.').pop()?.toLowerCase() || '';
      const langMap = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', css: 'css', scss: 'scss', html: 'html', json: 'json', md: 'markdown', py: 'python', yaml: 'yaml', yml: 'yaml', sh: 'bash', txt: 'text' };
      const lang = langMap[ext] || ext || 'text';
      const backendLabel = backend === 'github-raw' ? '🌐 GitHub' : backend === 'electron' ? '💻 Electron' : '📦 Cache';
      const message = `📄 **${path}** — ${size?.toLocaleString() || 0} chars | ${backendLabel}\n\n\`\`\`${lang}\n${content}\n\`\`\``;
      setMessages(prev => [...prev, { role: 'model', content: message, isFileContent: true, filePath: path }]);
    };
    const unsubFileContent = eventBus.on('Engineer:FileContent', fileContentHandler);
    return unsubFileContent;
  }, []);

  // REASONING REPORT
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;
    const reasoningReportHandler = (wrappedPayload) => {
      const report = wrappedPayload?.data || wrappedPayload;
      const findingsText = report.findings?.length > 0 ? '\n\n📋 **Temuan Analisis:**\n' + report.findings.join('\n') : '';
      const violationsCount = report.compliance?.violations?.length || 0;
      const warningsCount = report.compliance?.warnings?.length || 0;
      const complianceText = (violationsCount > 0 || warningsCount > 0) ? `\n\n🛡️ **MAEF Compliance:** ${violationsCount} pelanggaran, ${warningsCount} peringatan` : '';
      const confLevel = report.confidence?.level || 'UNKNOWN';
      const confEmoji = confLevel === 'HIGH' ? '🟢' : confLevel === 'MEDIUM' ? '🟡' : '🔴';
      const confidenceText = `\n\n${confEmoji} **Confidence:** ${confLevel} (coverage: ${report.confidence?.coverage || 0}%, evidence: ${report.confidence?.evidence || 0}/100)`;
      const filesText = report.filesAnalyzed?.length > 0 ? `\n\n📁 **File Dianalisis:** ${report.filesAnalyzed.join(', ')}` : '';
      const modelText = `\n\n🤖 **Model:** ${report.modelName || 'unknown'}`;
      const recText = report.recommendation ? `\n\n💡 **Rekomendasi:** ${report.recommendation}` : '';
      const adrText = report.adrReferenced && report.adrReferenced !== 'None' ? `\n\n📐 **ADR Dirujuk:** ${report.adrReferenced}` : '';
      const fullMessage = `🧠 **Engineer Reasoning Report**${findingsText}${complianceText}${confidenceText}${filesText}${modelText}${recText}${adrText}\n\n⏳ _Menunggu konfirmasi Anda untuk melanjutkan ke pembuatan patch..._`;
      setMessages(prev => [...prev, { role: 'model', content: fullMessage, isReasoningBlock: true, reasoningReport: report }]);
    };
    const unsubscribeReasoning = eventBus.on('Engineer:ReasoningReport', reasoningReportHandler);
    return unsubscribeReasoning;
  }, []);

  // REQUEST CONFIRMATION
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;
    const confirmationHandler = (wrappedPayload) => {
      const request = wrappedPayload?.data || wrappedPayload;
      setMessages(prev => [...prev, {
        role: 'model',
        content: `🔔 **Konfirmasi Diperlukan**\n\nRingkasan: ${request.summary || 'Analisis selesai.'}\n\nApakah Anda ingin melanjutkan ke pembuatan patch?`,
        isConfirmationRequest: true,
        confirmationId: request.confirmationId,
        _reportForConfirmation: request
      }]);
    };
    const unsubscribeConfirm = eventBus.on('Engineer:RequestConfirmation', confirmationHandler);
    return unsubscribeConfirm;
  }, []);

  // MEMORY RETRIEVED
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;
    const memoryRetrievedHandler = (payload) => {
      const data = payload?.result || payload;
      const query = payload?.query || '';
      setLastMemoryQuery(query || '');
      setActiveMemories(Array.isArray(data) ? data : []);
      setIsMemoryLoading(false);
    };
    const unsubscribeMemory = eventBus.on('Memory:Retrieved', memoryRetrievedHandler);
    return unsubscribeMemory;
  }, []);

  // PR#1: COMMAND CONFIRMATION REQUIRED
  // Listener ini menangkap event dari AssistantService.runCommand() saat command butuh konfirmasi user.
  // UI bertanggung jawab menampilkan dialog yang sesuai berdasarkan tipe command.
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;
    const commandConfirmHandler = (payload) => {
      // Simpan detail command pending — dialog akan render berdasarkan ini
      setCommandConfirmation({
        commandName: payload.commandName,
        args: payload.args || {},
        isDestructive: payload.isDestructive || false,
        inWorkspace: payload.inWorkspace !== false, // default true jika tidak ada
        reason: payload.reason || 'Konfirmasi diperlukan untuk melanjutkan.',
        context: payload.context || {}
      });
    };
    const unsubscribeCmd = eventBus.on('Command:ConfirmationRequired', commandConfirmHandler);
    return unsubscribeCmd;
  }, []);

  // PR#9: TIER 3 WEB RETRIEVAL CONFIRMATION (Human-in-Command)
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;

    const requestHandler = (payload) => {
      setWebConfirmation(payload);
    };

    const clearHandler = () => {
      setWebConfirmation(null);
    };

    const unsubReq = eventBus.on('Retrieval:RequestWebConfirmation', requestHandler);
    const unsubApp = eventBus.on('Retrieval:WebConfirmationApproved', clearHandler);
    const unsubRej = eventBus.on('Retrieval:WebConfirmationRejected', clearHandler);
    const unsubTimeout = eventBus.on('Retrieval:WebConfirmationTimeout', clearHandler);

    return () => {
      unsubReq?.();
      unsubApp?.();
      unsubRej?.();
      unsubTimeout?.();
    };
  }, []);

  // PR#9: Handle resolusi izin pencarian web (Setujui / Tolak)
  const handleResolveWebConfirmation = useCallback((requestId, isApproved) => {
    const webService = getWebComparisonService();
    if (webService && typeof webService.resolveConfirmation === 'function') {
      webService.resolveConfirmation(requestId, isApproved);
    }
    setWebConfirmation(null);
  }, []);

  // MEMORY: Listen Memory:OpenConflicts to ensure memory panel opens
  useEffect(() => {
    const eventBus = kernel.serviceManager?.get('EventBus');
    if (!eventBus) return;
    const openConflictsHandler = () => {
      setIsMemoryPanelOpen(true);
    };
    const unsub = eventBus.on('Memory:OpenConflicts', openConflictsHandler);
    return () => unsub?.();
  }, []);

  // PR#1: Handle konfirmasi (user klik "Izinkan" / "Jalankan")
  const handleCommandConfirm = useCallback(async () => {
    if (!commandConfirmation) return;
    const { commandName, args, context } = commandConfirmation;
    setCommandConfirmation(null); // tutup dialog dulu

    const assistantService = getAssistantService();
    if (!assistantService) return;

    const result = await assistantService.confirmAndRunCommand(commandName, args, context);
    const msg = result?.success
      ? `✅ **Command Berhasil:** \`${commandName}\`\n\n${result.output || ''}`
      : `❌ **Command Gagal:** \`${commandName}\`\n\n${result?.output || 'Terjadi kesalahan.'}`;
    setMessages(prev => [...prev, { role: 'model', content: msg }]);
  }, [commandConfirmation]);

  // PR#1: Handle batal (user klik "Batalkan")
  const handleCommandCancel = useCallback(() => {
    if (!commandConfirmation) return;
    const { commandName } = commandConfirmation;
    setCommandConfirmation(null);
    setMessages(prev => [...prev, {
      role: 'model',
      content: `🚫 **Command Dibatalkan:** \`${commandName}\`\n\n_Tidak ada perubahan yang dilakukan._`
    }]);
  }, [commandConfirmation]);

  // =============================================
  // HANDLE REFRESH MEMORY (manual)
  // =============================================
  const handleRefreshMemory = useCallback(async () => {
    if (!lastMemoryQuery) return;
    setIsMemoryLoading(true);
    try {
      const assistantService = getAssistantService();
      if (assistantService) {
        const memories = await assistantService.refreshMemory(lastMemoryQuery);
        setActiveMemories(memories);
      }
    } catch (err) {
      console.warn('[ConversationEngine] Refresh memori gagal:', err);
    } finally {
      setIsMemoryLoading(false);
    }
  }, [lastMemoryQuery]);

  // =============================================
  // HANDLE SEND — delegasi ke AssistantService
  // =============================================
  const handleSend = async (e, autoOverrideMsg = null) => {
    if (e) e.preventDefault();
    const userMsg = autoOverrideMsg || input.trim();
    if (!userMsg || isLoading) return;

    if (!autoOverrideMsg) setInput('');
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);

    const assistantService = getAssistantService();
    if (!assistantService) {
      setMessages(prev => [...prev, { role: 'model', content: '⚠️ AssistantService belum siap. Coba lagi dalam beberapa saat.' }]);
      setIsLoading(false);
      return;
    }

    // Ambil auth session
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
    const userId = session?.user?.id || null;

    // Tambah placeholder streaming
    let streamingStarted = false;

    if (workspaceManager && osState) {
      workspaceManager.osState = osState;
    }

    try {
      await assistantService.processMessage({
        userMsg,
        history: newMessages,
        workspaceId: workspaceManager?.activeWorkspaceId || 'ws-assistant',
        userId,
        token,
        attachedFile,
        workspaceManager,

        onChunk: (chunkText, allText, steps) => {
          if (!streamingStarted) {
            streamingStarted = true;
            setMessages(prev => [...prev, { role: 'model', content: '', steps: [], isStreaming: true }]);
          }
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { role: 'model', content: allText, steps: [...steps], isStreaming: true };
            return next;
          });
        },

        onDone: (finalText, steps, jsonMetadata, extras = {}) => {
          const { hasPatch, patchOriginalTask } = extras;
          if (streamingStarted) {
            setMessages(prev => {
              const next = [...prev];
              next[next.length - 1] = {
                role: 'model',
                content: finalText,
                steps,
                isStreaming: false,
                hasPatchProposal: hasPatch || false,
                patchOriginalTask: hasPatch ? patchOriginalTask : undefined,
                metadata: jsonMetadata
              };
              return next;
            });
          } else {
            // JSON/direct mode — tidak ada streaming frame
            setMessages(prev => [...prev, {
              role: 'model',
              content: finalText,
              steps,
              isStreaming: false,
              hasPatchProposal: hasPatch || false,
              patchOriginalTask: hasPatch ? patchOriginalTask : undefined,
              metadata: jsonMetadata
            }]);
          }
          setIsLoading(false);
          if (jsonMetadata && workspaceManager?.openWidgetInWorkbench) {
            openLifecycleInspector('execution', jsonMetadata);
          }
        },

        onError: (errorMsg) => {
          if (streamingStarted) {
            setMessages(prev => {
              const next = [...prev];
              next[next.length - 1] = { role: 'model', content: errorMsg, isStreaming: false };
              return next;
            });
          } else {
            setMessages(prev => [...prev, { role: 'model', content: errorMsg }]);
          }
          setIsLoading(false);
        }
      });
    } catch (err) {
      console.error('[ConversationEngine] handleSend error:', err);
      setMessages(prev => [...prev, { role: 'model', content: `⚠️ Error: ${err.message}` }]);
      setIsLoading(false);
    }

    // Reset file attachment
    setAttachedFile(null);
  };

  // =============================================
  // HANDLE RUN COMMAND (Engineer Autonomous)
  // Delegasi ke AssistantService.runCommand()
  // =============================================
  const handleRunCommand = async (cmd, cmdKey) => {
    const assistantService = getAssistantService();
    if (!assistantService) {
      setEngineerCmdStates(prev => ({ ...prev, [cmdKey]: { status: 'error', output: 'AssistantService tidak tersedia.' } }));
      return;
    }

    setEngineerCmdStates(prev => ({ ...prev, [cmdKey]: { status: 'running', output: '' } }));

    const { output, success } = await assistantService.runCommand(cmd, (status, out) => {
      // audit callback sudah dihandle di dalam AssistantService
    });

    setEngineerCmdStates(prev => ({
      ...prev,
      [cmdKey]: { status: success ? 'done' : 'error', output }
    }));

    // Auto-feed output ke LLM
    setTimeout(() => handleSend(null, `[TERMINAL OUTPUT for: ${cmd}]\n${output}`), 300);
  };

  // =============================================
  // HANDLE ROLLBACK (Engineer)
  // Delegasi ke AssistantService.rollback()
  // =============================================
  const handleRollback = async () => {
    const assistantService = getAssistantService();
    if (!assistantService) {
      alert('AssistantService tidak tersedia.');
      return;
    }
    setRollbackState('loading');
    try {
      const result = await assistantService.rollback(lastCheckpoint?.ref);
      if (result?.cancelled) { setRollbackState('idle'); return; }
      if (result?.success) {
        setRollbackState('done');
        setLastCheckpoint(null);
        setMessages(prev => [...prev, { role: 'model', content: `↩️ **Rollback Berhasil!** Semua perubahan patch telah dikembalikan.\n\nOutput: ${result.output || 'selesai.'}` }]);
      } else {
        setRollbackState('error');
        setMessages(prev => [...prev, { role: 'model', content: `❌ **Rollback Gagal:** ${result?.error || 'Unknown error'}\n\nCoba jalankan git stash pop secara manual.` }]);
      }
    } catch (err) {
      setRollbackState('error');
    }
  };

  // =============================================
  // RENDER
  // =============================================
  return (
    <div className="flex flex-1 min-w-0 min-h-0 h-full w-full bg-background font-body-base text-on-surface">

      {/* =============================================
          PR#1: COMMAND CONFIRMATION DIALOG
          Tampil sebagai overlay modal ketika AI meminta
          eksekusi command yang butuh persetujuan Owner.
          Tiga varian visual sesuai tingkat risiko.
          ============================================= */}
      {commandConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl border-2 p-6 ${
            commandConfirmation.isDestructive
              ? 'bg-red-950 border-red-500'
              : !commandConfirmation.inWorkspace
              ? 'bg-yellow-950 border-yellow-500'
              : 'bg-surface border-primary'
          }`}>
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <span className="text-2xl">
                {commandConfirmation.isDestructive ? '⚠️' : !commandConfirmation.inWorkspace ? '🔒' : '🖥️'}
              </span>
              <div>
                <h3 className={`font-bold text-lg leading-tight ${
                  commandConfirmation.isDestructive ? 'text-red-300'
                  : !commandConfirmation.inWorkspace ? 'text-yellow-300'
                  : 'text-on-surface'
                }`}>
                  {commandConfirmation.isDestructive
                    ? 'TINDAKAN BERBAHAYA — Konfirmasi Tegas Diperlukan'
                    : !commandConfirmation.inWorkspace
                    ? 'Di Luar Workspace — Izinkan Sekali?'
                    : 'Konfirmasi Command'}
                </h3>
                {!commandConfirmation.inWorkspace && (
                  <p className="text-yellow-400 text-xs mt-1">
                    ⚠️ Izin ini hanya berlaku untuk permintaan ini saja — tidak di-cache.
                  </p>
                )}
              </div>
            </div>

            {/* Detail Command */}
            <div className="bg-black/30 rounded-lg p-3 mb-4 font-mono text-sm">
              <span className="text-on-surface-variant">Command: </span>
              <span className="text-primary font-semibold">{commandConfirmation.commandName}</span>
              {Object.keys(commandConfirmation.args).length > 0 && (
                <div className="mt-1 text-on-surface-variant text-xs">
                  {JSON.stringify(commandConfirmation.args, null, 2)}
                </div>
              )}
            </div>

            {/* Alasan */}
            <p className="text-on-surface-variant text-sm mb-5">
              {commandConfirmation.reason}
            </p>

            {/* Tombol — destruktif butuh extra langkah konfirmasi visual */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCommandCancel}
                className="px-4 py-2 rounded-lg bg-surface-variant text-on-surface-variant hover:bg-surface-variant/80 text-sm font-medium transition-colors"
              >
                Batalkan
              </button>
              <button
                onClick={handleCommandConfirm}
                className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                  commandConfirmation.isDestructive
                    ? 'bg-red-600 hover:bg-red-500 text-white ring-2 ring-red-400'
                    : !commandConfirmation.inWorkspace
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                    : 'bg-primary hover:bg-primary/90 text-on-primary'
                }`}
              >
                {commandConfirmation.isDestructive
                  ? '⚠️ Ya, Saya Yakin — Jalankan'
                  : !commandConfirmation.inWorkspace
                  ? '🔓 Izinkan Sekali'
                  : '✅ Jalankan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Riwayat Chat */}
      <div className={`transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'} shrink-0 z-50 md:relative absolute left-0 top-0 h-full bg-background border-r border-outline-variant`}>
        <ChatHistory
          onSelectChat={handleLoadChat}
          onNewChat={handleNewChat}
          activeChatId={currentChatId}
          activeWorkspace={osState?.workspaceId || 'ws-assistant'}
          collapsed={false}
        />
      </div>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Area Chat Utama */}
      <div className="flex-1 flex flex-col relative min-w-0 min-h-0">

        {/* Session Toolbar */}
        <div className="absolute top-6 left-6 z-50 flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-10 h-10 flex items-center justify-center bg-surface-container-low border border-outline-variant rounded-xl hover:bg-surface-variant text-on-surface transition-all shadow-sm"
            title="Toggle Chat History"
          >
            <span className="material-symbols-outlined text-[20px]">{isSidebarOpen ? 'keyboard_double_arrow_left' : 'menu'}</span>
          </button>
          <button
            onClick={handleNewChat}
            className="w-10 h-10 flex items-center justify-center bg-surface-container-low border border-outline-variant rounded-xl hover:bg-surface-variant text-on-surface transition-all shadow-sm"
            title="Percakapan Baru"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>
        </div>

        {/* Engineer Rollback Banner */}
        {lastCheckpoint && (
          <div className="mx-3 mt-14 mb-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-300 text-xs z-40 shrink-0">
            <span className="material-symbols-outlined text-[15px] text-amber-400 shrink-0">history</span>
            <div className="flex-1 min-w-0 truncate">
              <span className="font-bold">Checkpoint tersedia</span>
              <span className="text-amber-400/60 ml-1.5">{lastCheckpoint.appliedAt} — {lastCheckpoint.ref}</span>
            </div>
            {rollbackState === 'loading' ? (
              <span className="flex items-center gap-1 animate-pulse shrink-0">
                <span className="material-symbols-outlined text-[13px]">hourglass_empty</span>Mengembalikan...
              </span>
            ) : rollbackState === 'done' ? (
              <span className="text-emerald-400 shrink-0">✅ Selesai</span>
            ) : (
              <>
                <button
                  onClick={handleRollback}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all active:scale-95 shrink-0"
                >
                  <span className="material-symbols-outlined text-[13px]">undo</span>
                  Rollback
                </button>
                <button
                  onClick={() => setLastCheckpoint(null)}
                  className="p-0.5 rounded hover:bg-amber-900/40 text-amber-500/50 hover:text-amber-300 transition-colors shrink-0"
                  title="Tutup"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Chat + Memory Context Panel */}
        <div className="flex-1 flex flex-col md:flex-row relative min-h-0 min-w-0">
          <div className="flex-1 flex flex-col relative overflow-hidden pt-4 min-h-0 min-w-0">
            {/* Floating Workspace Controls (Top-Right of Chat Area) */}
            <div className="absolute top-3 right-5 z-30 flex items-center gap-2">
              {/* Toggle Memory Context Pill */}
              <button
                type="button"
                onClick={() => setIsMemoryPanelOpen(!isMemoryPanelOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all shadow-sm cursor-pointer border ${
                  isMemoryPanelOpen
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-surface-container-low/90 backdrop-blur-md border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-variant'
                }`}
                title={isMemoryPanelOpen ? 'Minimize Memory Context' : 'Buka Memory Context'}
              >
                <span className="material-symbols-outlined text-[16px]">psychology</span>
                <span className="hidden sm:inline">Memory</span>
                {activeMemories.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isMemoryPanelOpen ? 'bg-emerald-500/30 text-emerald-200' : 'bg-surface-variant text-on-surface-variant'
                  }`}>
                    {activeMemories.length}
                  </span>
                )}
              </button>

              {/* Toggle MAEF Monitor Pill */}
              <button
                type="button"
                onClick={handleToggleMaefMonitor}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all shadow-sm cursor-pointer border ${
                  (osState?.layout?.right_workbench || []).includes('widget:maef-monitor')
                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-300 hover:bg-blue-500/25'
                    : 'bg-surface-container-low/90 backdrop-blur-md border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-variant'
                }`}
                title="Toggle MAEF Monitor"
              >
                <span className="material-symbols-outlined text-[16px]">shield</span>
                <span className="hidden sm:inline">Monitor</span>
              </button>

              {/* One-Click Minimize All / Fullscreen Chat */}
              {(isMemoryPanelOpen || (osState?.layout?.right_workbench || []).length > 0) && (
                <button
                  type="button"
                  onClick={handleMinimizeSidePanels}
                  className="p-1.5 rounded-xl bg-surface-container-low/90 backdrop-blur-md border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-all shadow-sm cursor-pointer"
                  title="Luaskan Kolom Chat (Minimize Semua Panel Samping)"
                >
                  <span className="material-symbols-outlined text-[18px]">fullscreen</span>
                </button>
              )}
            </div>

            <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4 space-y-3 custom-scrollbar relative z-10">

              {messages.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 pointer-events-none gap-1">
                  <span className="material-symbols-outlined text-[28px] text-primary">chat_bubble</span>
                  <div className="text-[10px] tracking-widest text-primary uppercase font-mono">Conversation Engine</div>
                </div>
              )}

              {messages.map((m, idx) => {
                const parsed = parseThinkingContent(m.content);
                const displayText = parsed.answer || m.content || '';

                return (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`relative group max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 ${m.role === 'user' ? 'bg-primary-container/20 text-on-surface border border-primary/30' : 'glass-panel rim-light text-on-surface border border-outline-variant'}`}>
                      <div className="text-body-base leading-relaxed">
                        {/* AI Reasoning Deep Link */}
                        {parsed.thinking && (
                          <div
                            onClick={() => openLifecycleInspector('AI_REASONING', parsed.thinking)}
                            className="mb-3 inline-flex items-center gap-2 px-3 py-2 bg-surface-container border border-outline-variant text-on-surface-variant text-body-sm rounded-lg cursor-pointer hover:bg-surface-variant hover:text-on-surface transition-all shadow-sm"
                            title="Open AI thought trace in Right Workbench"
                          >
                            <span className="material-symbols-outlined text-[16px]">psychology</span>
                            [Deep Link] View AI Reasoning Trace
                          </div>
                        )}

                        {/* Render konten dengan parser marker Engineer */}
                        {(() => {
                          if (!displayText) return null;
                          const MARKER_RE = /(\[MAMET_CMD:[^\]]+\]|\[MAMET_CRITICAL:[^\]]*\]|\[OS EXECUTION REPORT\]|\[SYSTEM:[^\]]+\])/g;
                          const parts = displayText.split(MARKER_RE);
                          const isEngineer = (workspaceManager?.activeWorkspaceId === 'ws-engineer');

                          return parts.map((part, i) => {
                            if (isEngineer && part.startsWith('[MAMET_CMD:')) {
                              const cmd = part.replace('[MAMET_CMD:', '').replace(']', '').trim();
                              const cmdKey = `${idx}_${cmd}`;
                              const state = engineerCmdStates[cmdKey];
                              return (
                                <div key={i} className="my-2 flex items-center gap-2 flex-wrap">
                                  <code className="px-2 py-1 rounded bg-surface-container-high border border-outline-variant text-body-sm font-mono text-primary">{cmd}</code>
                                  {!state || state.status === 'pending' ? (
                                    <>
                                      <button onClick={() => handleRunCommand(cmd, cmdKey)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm active:scale-95">
                                        <span className="material-symbols-outlined text-[14px]">terminal</span>🖥️ Jalankan
                                      </button>
                                      <button onClick={() => setEngineerCmdStates(prev => ({ ...prev, [cmdKey]: { status: 'skipped', output: '' } }))} className="px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant text-xs hover:bg-surface-variant transition-all">Lewati</button>
                                    </>
                                  ) : state.status === 'running' ? (
                                    <span className="flex items-center gap-1.5 text-xs text-amber-400 animate-pulse"><span className="material-symbols-outlined text-[14px]">hourglass_empty</span>Menjalankan...</span>
                                  ) : state.status === 'done' ? (
                                    <details className="inline">
                                      <summary className="flex items-center gap-1.5 text-xs text-emerald-400 cursor-pointer"><span className="material-symbols-outlined text-[14px]">check_circle</span>Selesai — lihat output</summary>
                                      <pre className="mt-1 p-2 rounded bg-surface-container text-[11px] font-mono text-on-surface-variant overflow-x-auto max-h-40 custom-scrollbar">{state.output}</pre>
                                    </details>
                                  ) : state.status === 'skipped' ? (
                                    <span className="text-xs text-on-surface-variant italic">Dilewati</span>
                                  ) : (
                                    <details className="inline">
                                      <summary className="flex items-center gap-1.5 text-xs text-red-400 cursor-pointer"><span className="material-symbols-outlined text-[14px]">error</span>Error — lihat detail</summary>
                                      <pre className="mt-1 p-2 rounded bg-red-900/20 text-[11px] font-mono text-red-300 overflow-x-auto max-h-40 custom-scrollbar">{state.output}</pre>
                                    </details>
                                  )}
                                </div>
                              );
                            }

                            if (isEngineer && part.startsWith('[MAMET_CRITICAL:')) {
                              const msg = part.replace('[MAMET_CRITICAL:', '').replace(/\]$/, '').trim();
                              return (
                                <div key={i} className="my-3 p-3 rounded-xl border border-red-500/50 bg-red-950/30 text-red-300">
                                  <div className="flex items-center gap-2 font-bold text-sm mb-1"><span className="material-symbols-outlined text-[18px] text-red-400">warning</span>⚠️ CRITICAL — Perlu Analisis User</div>
                                  <p className="text-sm whitespace-pre-wrap">{msg}</p>
                                  <p className="mt-2 text-xs text-red-400 italic">Ketik di chat untuk modifikasi plan atau berikan instruksi lanjutan.</p>
                                </div>
                              );
                            }

                            if (part === '[OS EXECUTION REPORT]') {
                              return (
                                <div key={i} className="my-2 block w-max items-center px-3 py-2 bg-primary/10 border border-primary/30 text-primary text-body-sm font-bold rounded-lg cursor-pointer hover:bg-primary/20 transition-colors shadow-sm"
                                  onClick={() => openLifecycleInspector('OS_EXECUTION', displayText)}>
                                  <span className="material-symbols-outlined inline-block mr-2 text-[16px] align-text-bottom">terminal</span>
                                  OS EXECUTION REPORT (Click to Inspect)
                                </div>
                              );
                            }

                            if (part.startsWith('[SYSTEM:')) {
                              const title = part.replace('[SYSTEM: ', '').replace(']', '');
                              return (
                                <div key={i} className="my-2 block w-max items-center px-3 py-2 bg-surface-container-high border border-outline-variant text-on-surface-variant text-body-sm font-bold rounded-lg cursor-pointer hover:bg-surface-variant transition-colors shadow-sm"
                                  onClick={() => openLifecycleInspector(title, displayText)}>
                                  <span className="material-symbols-outlined inline-block mr-2 text-[16px] align-text-bottom">settings_system_daydream</span>
                                  {title} (Inspect Context)
                                </div>
                              );
                            }

                            return <span key={i} className="whitespace-pre-wrap">{part}</span>;
                          });
                        })()}

                        {m.isStreaming && parsed.isThinkingComplete && <span className="animate-pulse text-primary"> ▍</span>}
                      </div>

                      {/* Critical Backend UI: Tools Used Badges */}
                      {(() => {
                        const tools = m.metadata?.toolsUsed || m.toolsUsed || [];
                        if (!Array.isArray(tools) || tools.length === 0) return null;
                        return (
                          <div className="mt-3 pt-2 border-t border-white/5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mr-1">Tools:</span>
                            {tools.map((tool, tIdx) => (
                              <span
                                key={tIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-slate-300 border border-white/10"
                              >
                                <span className="material-symbols-outlined text-[12px] text-primary">build</span>
                                {String(tool).replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Critical Backend UI: Grounding Sources Chips */}
                      {(() => {
                        const sources = m.metadata?.groundingSources || m.groundingSources || [];
                        if (!Array.isArray(sources) || sources.length === 0) return null;
                        return (
                          <div className="mt-2.5 pt-2 border-t border-white/5">
                            <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1.5 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px] text-purple-400">travel_explore</span>
                              <span>Sumber Referensi:</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {sources.map((s, sIdx) => {
                                const url = s?.uri || s?.url || '#';
                                const title = s?.title || s?.name || (url !== '#' ? url : `Sumber #${sIdx + 1}`);
                                return (
                                  <a
                                    key={sIdx}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 transition-all max-w-xs truncate group/link"
                                    title={title}
                                  >
                                    <span className="truncate">{title}</span>
                                    <span className="material-symbols-outlined text-[11px] text-purple-400 group-hover/link:translate-x-0.5 transition-transform">open_in_new</span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Critical Backend UI: Tool Execution Collapsible Accordion */}
                      {(() => {
                        const execution = m.metadata?.toolExecution || m.toolExecution;
                        if (!execution) return null;
                        const execName = execution.name || execution.tool || 'eksekusi_tool';
                        return (
                          <details className="mt-2.5 pt-2 border-t border-white/5 text-[11px] group/details">
                            <summary className="cursor-pointer text-slate-400 hover:text-slate-200 font-mono text-[10px] flex items-center gap-1 select-none">
                              <span className="material-symbols-outlined text-[13px] transition-transform group-open/details:rotate-90">chevron_right</span>
                              <span>Detail Eksekusi ({execName})</span>
                            </summary>
                            <div className="mt-1.5 p-2 rounded bg-black/40 border border-white/10 font-mono text-[10px] text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
                              {typeof execution === 'string'
                                ? execution
                                : JSON.stringify(execution, null, 2)}
                            </div>
                          </details>
                        );
                      })()}

                      {/* Confirmation Buttons */}
                      {m.isConfirmationRequest && (
                        <div className="mt-4 flex items-center gap-3 border-t border-outline-variant pt-3">
                          <button
                            onClick={() => {
                              const eventBus = kernel.serviceManager?.get('EventBus');
                              if (eventBus && m.confirmationId) {
                                eventBus.emit('Engineer:UserConfirmation', { confirmationId: m.confirmationId, confirmed: true });
                                setMessages(prev => { const next = [...prev]; next[idx] = { ...next[idx], content: `✅ **Konfirmasi Diterima**\n\nMelanjutkan ke pembuatan patch...`, isConfirmationRequest: false }; return next; });
                              }
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors shadow-lg shadow-emerald-500/20"
                          >
                            <span className="material-symbols-outlined text-[18px]">check_circle</span>✅ Lanjutkan ke Patch
                          </button>
                          <button
                            onClick={() => {
                              const eventBus = kernel.serviceManager?.get('EventBus');
                              if (eventBus && m.confirmationId) {
                                eventBus.emit('Engineer:UserConfirmation', { confirmationId: m.confirmationId, confirmed: false });
                                setMessages(prev => { const next = [...prev]; next[idx] = { ...next[idx], content: `❌ **Konfirmasi Ditolak**\n\nPembuatan patch dibatalkan.`, isConfirmationRequest: false }; return next; });
                              }
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-sm font-medium transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px]">cancel</span>❌ Batalkan
                          </button>
                        </div>
                      )}

                      {/* Reasoning Block Detail */}
                      {m.isReasoningBlock && m.reasoningReport && (
                        <div className="mt-3 border-t border-outline-variant pt-3">
                          <button
                            onClick={() => {
                              const report = m.reasoningReport;
                              const detail = `🧠 **Reasoning Report Detail**\n\n**Task ID:** ${report.taskId}\n**Summary:** ${report.summary}\n**Intent:** ${report.intent}\n**Model:** ${report.modelName}\n**Confidence:** ${report.confidence?.level} (${report.confidence?.coverage}% coverage, ${report.confidence?.evidence}/100 evidence)\n**ADR Referenced:** ${report.adrReferenced}\n**Files Analyzed:** ${(report.filesAnalyzed || []).join(', ')}\n**Recommendation:** ${report.recommendation}\n**Compliance:** ${report.compliance?.violations?.length || 0} violations, ${report.compliance?.warnings?.length || 0} warnings\n**Timestamp:** ${report.timestamp}`;
                              openLifecycleInspector('REASONING_DETAIL', detail);
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-surface-container border border-outline-variant text-on-surface-variant text-body-sm rounded-lg hover:bg-surface-variant hover:text-on-surface transition-all shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[16px]">description</span>📋 Lihat Detail Reasoning
                          </button>
                        </div>
                      )}

                      {/* Patch Proposal — Apply Button */}
                      {m.hasPatchProposal && (
                        <div className="mt-4 flex items-center gap-3 border-t border-primary/20 pt-3">
                          <button
                            onClick={() => {
                              const eventBus = kernel.serviceManager?.get('EventBus');
                              if (eventBus) {
                                eventBus.emit('Engineer:GeneratePatch', {
                                  id: `TASK-${Date.now()}`,
                                  title: (m.patchOriginalTask || '').substring(0, 100),
                                  description: m.patchOriginalTask || '',
                                  files: [],
                                  llmProposedContent: m.content
                                });
                                setMessages(prev => { const next = [...prev]; next[idx] = { ...next[idx], hasPatchProposal: false, content: next[idx].content + '\n\n_⚙️ Engineer patch pipeline dimulai — Reasoning Lock aktif..._' }; return next; });
                              }
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-fixed text-on-primary text-sm font-bold transition-all shadow-lg shadow-primary/20 active:scale-95"
                          >
                            <span className="material-symbols-outlined text-[18px]">build</span>⚙️ Apply Patch
                          </button>
                          <span className="text-body-sm text-on-surface-variant italic">Reasoning Lock akan aktif sebelum eksekusi</span>
                        </div>
                      )}

                      {/* Copy Button */}
                      {m.role === 'model' && !m.isStreaming && displayText && (
                        <button
                          onClick={() => handleCopy(displayText, idx)}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-container hover:bg-surface-variant border border-outline-variant opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Salin ke clipboard"
                        >
                          {copiedIndex === idx ? (
                            <span className="material-symbols-outlined text-[16px] text-primary">check</span>
                          ) : (
                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">content_copy</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && messages[messages.length - 1]?.role !== 'model' && (
                <div className="flex justify-start">
                  <div className="glass-panel rim-light px-5 py-3 rounded-2xl border border-outline-variant text-on-surface-variant text-body-sm flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" /> Awaiting Intent Dispatch...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="px-3 pt-2 pb-2 bg-gradient-to-t from-background via-background to-transparent z-10 flex flex-col items-center w-full">
              {attachedFile && (
                <div className="w-full max-w-3xl mb-2 flex items-center justify-between bg-surface-container border border-outline-variant rounded-lg px-3 py-2 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-2 text-body-sm text-on-surface">
                    <span className="material-symbols-outlined text-[16px] text-primary">attach_file</span>
                    <span className="truncate max-w-[200px]">{attachedFile.name}</span>
                  </div>
                  <button type="button" onClick={() => setAttachedFile(null)} className="text-on-surface-variant hover:text-error transition-colors cursor-pointer">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              )}

              {/* PR#9: TIER 3 WEB COMPARISON CONFIRMATION CARD */}
              {webConfirmation && (
                <div className="w-full max-w-3xl mb-2.5 p-3.5 bg-surface-container-high/95 backdrop-blur border border-primary/40 rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-2 z-20">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                        <Globe className="w-4 h-4 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                            Human-in-Command • Tier 3 Web Retrieval
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-medium border border-primary/20">
                            PR#9 Gate
                          </span>
                        </div>
                        <p className="text-xs font-bold text-on-surface mt-0.5">
                          Konfirmasi Akses Web Pembanding
                        </p>
                        <p className="text-[11px] text-on-surface-variant mt-0.5 leading-tight">
                          {webConfirmation.reason || 'Konteks lokal belum memadai untuk menjawab pertanyaan terkini.'}
                        </p>
                        <div className="mt-1.5 text-[11px] font-mono bg-surface-container-lowest/80 px-2 py-1 rounded border border-outline-variant text-on-surface flex items-center gap-1.5">
                          <span className="text-primary font-bold shrink-0">Query:</span>
                          <span className="truncate max-w-[320px] sm:max-w-md">{webConfirmation.query}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end pt-1.5 sm:pt-0 border-t sm:border-t-0 border-outline-variant/50">
                      <button
                        type="button"
                        onClick={() => handleResolveWebConfirmation(webConfirmation.requestId, false)}
                        className="px-3 py-1.5 text-xs font-medium rounded-xl bg-surface-container hover:bg-surface-variant text-on-surface-variant transition-colors cursor-pointer"
                      >
                        Tolak
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveWebConfirmation(webConfirmation.requestId, true)}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-primary hover:bg-primary-fixed text-on-primary transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">public</span>
                        Setujui Pencarian Web
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSend} className="w-full max-w-3xl relative flex items-center gap-1.5 bg-surface-container-low border border-outline-variant rounded-2xl p-1.5 focus-within:border-primary transition-all shadow-lg pulse-focus">
                {/* Compact Folder Picker di dalam baris input */}
                {(workspaceManager?.activeWorkspaceId === 'ws-engineer' || workspaceManager?.activeWorkspaceId === 'ws-assistant') && (
                  <div className="shrink-0 ml-1">
                    <FolderSelector
                      compact={true}
                      onSelect={(path) => setSelectedFolder(path)}
                      currentPath={selectedFolder}
                    />
                  </div>
                )}

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e, null); } }}
                  placeholder="Ketik instruksi atau mulai percakapan dengan OS..."
                  className="flex-1 max-h-40 min-h-[38px] bg-transparent resize-none py-2 px-3 text-sm text-on-surface placeholder-on-surface-variant focus:outline-none custom-scrollbar overflow-y-auto"
                  rows="1"
                />
                {workspaceManager?.activeWorkspaceId === 'ws-lite' && (
                  <>
                    <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => { if (e.target.files?.[0]) setAttachedFile(e.target.files[0]); }} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface-variant transition-all shrink-0" title="Upload Dokumen RAG">
                      <span className="material-symbols-outlined text-[18px]">attach_file</span>
                    </button>
                  </>
                )}
                <button type="submit" disabled={(!input.trim() && !attachedFile) || isLoading} className="p-2.5 mr-0.5 rounded-xl bg-primary hover:bg-primary-fixed text-on-primary disabled:opacity-50 disabled:hover:bg-primary transition-all shadow-md shrink-0 cursor-pointer">
                  <span className="material-symbols-outlined text-[18px]">send</span>
                </button>
              </form>
              <div className="text-center mt-1 text-[9px] text-on-surface-variant tracking-widest uppercase opacity-50">
                CE v3.0 • {workspaceManager.activeWorkspaceId}
              </div>
            </div>

            {/* Atmospheric Glow */}
            <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-primary/5 blur-[120px] rounded-full pointer-events-none z-0"></div>
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-secondary/5 blur-[120px] rounded-full pointer-events-none z-0"></div>
          </div>

          {/* Memory Context Panel (Sidebar Kanan) */}
          {isMemoryPanelOpen && (
            <MemoryContextPanel
              memories={activeMemories}
              query={lastMemoryQuery}
              loading={isMemoryLoading}
              serviceManager={kernel.serviceManager}
              onClose={() => setIsMemoryPanelOpen(false)}
              onMinimize={handleMinimizeSidePanels}
              onRefresh={handleRefreshMemory}
              onResolveConflict={async (memoryId, resolution) => {
                const governor = kernel.serviceManager?.get('MemoryGovernorService');
                if (governor) {
                  await governor.resolveConflict(memoryId, resolution);
                  if (lastMemoryQuery) handleRefreshMemory();
                }
              }}
              onArchiveMemory={async (memoryId) => {
                const governor = kernel.serviceManager?.get('MemoryGovernorService');
                if (governor) {
                  await governor.archiveMemory(memoryId);
                  if (lastMemoryQuery) handleRefreshMemory();
                }
              }}
              onRequestPurge={async (memoryId) => {
                const governor = kernel.serviceManager?.get('MemoryGovernorService');
                if (governor) {
                  await governor.requestPurge(memoryId);
                }
              }}
              onExecutePurge={async (memoryId) => {
                const governor = kernel.serviceManager?.get('MemoryGovernorService');
                if (governor) {
                  await governor.executePurge(memoryId);
                }
              }}
              onRestoreMemory={async (memoryId) => {
                const governor = kernel.serviceManager?.get('MemoryGovernorService');
                if (governor) {
                  await governor.restoreMemory(memoryId);
                  if (lastMemoryQuery) handleRefreshMemory();
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
