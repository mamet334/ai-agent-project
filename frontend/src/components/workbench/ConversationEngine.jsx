import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Terminal, Loader2, Copy, Check, Activity } from 'lucide-react';
import { useWorkspace } from '../../core/workspace/WorkspaceContext';
import { supabase } from '../../supabase';
import { kernel } from '../../core/runtime/Kernel';
import FolderSelector from '../FolderSelector';
import ChatHistory from './ChatHistory';

const parseThinkingContent = (text) => {
  if (!text) return { thinking: '', answer: '', isThinkingComplete: false };
  const startIndex = text.indexOf('<think>');
  const endIndex = text.indexOf('</think>');

  if (startIndex !== -1) {
    if (endIndex !== -1) {
      return {
        thinking: text.substring(startIndex + 7, endIndex).trim(),
        answer: text.substring(endIndex + 8).trim(),
        isThinkingComplete: true
      };
    } else {
      return {
        thinking: text.substring(startIndex + 7).trim(),
        answer: '',
        isThinkingComplete: false
      };
    }
  }
  return { thinking: '', answer: text, isThinkingComplete: true };
};

export default function ConversationEngine({ sessionId }) {
  const { manager: workspaceManager, osState } = useWorkspace();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [currentChatId, setCurrentChatId] = useState(() => {
    // Restore currentChatId dari localStorage saat mount
    const saved = localStorage.getItem('mamet_v4_current_chat_id');
    return saved || null;
  });
  const [initialRestoreDone, setInitialRestoreDone] = useState(false);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attachedFile, setAttachedFile] = useState(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Guard untuk handleNewChat: prevent auto-trigger dari lifecycle
  const isNewChatInitiatedByUser = useRef(false);
  const isInitialMount = useRef(true);
  const prevSessionIdRef = useRef(sessionId);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 192)}px`;
    }
  }, [input]);

  // Auto-scroll
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Update browser window layout when chat history toggles
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [isSidebarOpen]);

  // =============================================
  // PERSISTENSI CHAT KE SUPABASE + LOCALSTORAGE
  // =============================================
  const saveChatToDB = useCallback(async (msgs, chatId = currentChatId) => {
    if (!msgs || msgs.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const title = msgs[0]?.content?.substring(0, 50) || 'Percakapan Baru';
    const payload = {
      user_id: session.user.id,
      title: title,
      messages: msgs,
      updated_at: new Date().toISOString(),
      workspace_type: osState?.workspaceId || 'ws-assistant'
    };

    let result;
    if (chatId) {
      result = await supabase.from('chats').update(payload).eq('id', chatId);
    } else {
      result = await supabase.from('chats').insert(payload).select('id').single();
      if (result.data?.id) {
        setCurrentChatId(result.data.id);
        // Simpan ke localStorage setelah INSERT sukses
        localStorage.setItem('mamet_v4_current_chat_id', result.data.id);
      }
    }

    if (result.error) {
      console.error('[ConversationEngine] Gagal menyimpan chat:', result.error);
    }
  }, [currentChatId, osState]);

  // Auto-save setiap kali messages berubah (Debounced untuk mencegah race condition)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentChatId || messages.length > 0) {
        saveChatToDB(messages);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, currentChatId, saveChatToDB]);

  // Persist currentChatId ke localStorage setiap kali berubah
  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem('mamet_v4_current_chat_id', currentChatId);
    } else {
      localStorage.removeItem('mamet_v4_current_chat_id');
    }
  }, [currentChatId]);

  // Restore chat dari localStorage saat mount
  useEffect(() => {
    if (!initialRestoreDone && currentChatId) {
      const loadSavedChat = async () => {
        const { data, error } = await supabase
          .from('chats')
          .select('*')
          .eq('id', currentChatId)
          .single();
        if (!error && data) {
          setMessages(data.messages || []);
        } else {
          // Chat ID tidak valid di DB, reset
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

  // Sinkronasi sessionId: jika sessionId berubah, jangan reset chat
  // tapi pastikan kita tidak membuat chat baru otomatis
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  const handleNewChat = () => {
    // Hanya user action yang bisa memicu ini
    isNewChatInitiatedByUser.current = true;
    setMessages([]);
    setCurrentChatId(null);
    localStorage.removeItem('mamet_v4_current_chat_id');
  };

  const handleLoadChat = async (chatId) => {
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single();
    if (error) { console.error(error); return; }
    setMessages(data.messages || []);
    setCurrentChatId(chatId);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  /**
   * Extract file path dari pesan user untuk Engineer mode
   * Contoh: "Tambahkan console.log di file ConversationEngine.jsx" → "ConversationEngine.jsx"
   */
  const _extractFilePathFromMessage = (message) => {
    if (!message) return null;
    
    // Pattern 1: "di file [path]"
    const pattern1 = /(?:di\s+)?(?:file|berkas)\s+([a-zA-Z0-9_\-\/\.]+\.(jsx?|tsx?|ts|js))/i;
    const match1 = message.match(pattern1);
    if (match1) return match1[1];
    
    // Pattern 2: "[filename]" langsung
    const pattern2 = /([a-zA-Z0-9_\-\/]+\.(jsx?|tsx?))/g;
    const match2 = message.match(pattern2);
    if (match2 && match2.length > 0) {
      // Ambil yang paling spesifik (mengandung /)
      const withSlash = match2.find(m => m.includes('/'));
      return withSlash || match2[0];
    }
    
    return null;
  };

  // Handle Event Flow (Integrasi UI Event ke Right Workbench)
  const openLifecycleInspector = (stepName, logs) => {
    workspaceManager.openWidgetInWorkbench('right', 'widget:maef-monitor', {
      focusStep: stepName,
      logs: logs
    });
  };

  const handleCopy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.warn('[ConversationEngine] Gagal menyalin:', err);
    }
  };

  const handleSend = async (e, autoOverrideMsg = null) => {
    if (e) e.preventDefault();
    const userMsg = autoOverrideMsg || input.trim();
    if (!userMsg || isLoading) return;

    if (!autoOverrideMsg) setInput('');
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    console.log("[LIFECYCLE] Chat request sent");
    setIsLoading(true);

    // ✅ DEKLARASI formattedModel DULU (sebelum delegasi)
    let formattedModel = '';
    try {
      const brainService = kernel.serviceManager.get('BrainService');
      if (brainService) {
        const context = await brainService.getActiveBrainContext();
        formattedModel = context.model || '';
      }
    } catch (e) {
      console.warn('[ConversationEngine] BrainService not available:', e);
    }

    // =============================================
    // ✅ ENGINEER MODE DELEGATION (UPGRADE 1)
    // =============================================
    const activeWorkspace = workspaceManager?.activeWorkspaceId || 'ws-assistant';
    const isEngineerMode = activeWorkspace === 'ws-engineer' || activeWorkspace === 'ENGINEER';
    
    console.log(`[ConversationEngine] Mode check: workspace=${activeWorkspace}, isEngineerMode=${isEngineerMode}, kernelStatus=${kernel.status}`);
    
    if (isEngineerMode && kernel.status === 'RUNNING') {
      try {
        const engineer = kernel.serviceManager.get('Engineer');
        const eventBus = kernel.serviceManager.get('EventBus');
        
        console.log(`[ConversationEngine] Services check: engineer=${!!engineer}, eventBus=${!!eventBus}`);
        
        if (engineer && eventBus) {
          console.log('[ConversationEngine] 🎯 Delegating to Engineer frontend...');
          console.log('[ConversationEngine] 📌 Model yang akan digunakan:', formattedModel || 'default');
          
          // Emit event untuk trigger Engineer
          eventBus.emit('Engineer:GeneratePatch', {
            id: `TASK-${Date.now()}`,
            title: userMsg.substring(0, 100),
            description: userMsg,
            files: [],
            requestedModel: formattedModel,
            requestedFilePath: _extractFilePathFromMessage(userMsg)
          });
          
          setMessages(prev => [...prev, {
            role: 'model',
            content: `🔧 **Engineer sedang menyiapkan patch menggunakan model ${formattedModel || 'default'}...**\n\nMohon tunggu, approval dialog akan muncul setelah patch siap.`
          }]);
          
          setIsLoading(false);
          return; // ⛔ JANGAN lanjut ke fetch backend
        } else {
          console.warn('[ConversationEngine] Engineer or EventBus not available, falling back to backend');
        }
      } catch (err) {
        console.error('[ConversationEngine] Engineer delegation failed:', err);
      }
    }

    // =============================================
    // FALLBACK: Normal backend flow (untuk ASSISTANT & LITE)
    // =============================================
    
    // --- Natural Language Memory Trigger ---
    const memoryKeywords = ['ingat', 'simpan', 'catat', 'remember', 'save', 'store'];
    const lowerMsg = userMsg.toLowerCase();
    const hasMemoryKeyword = memoryKeywords.some(keyword => lowerMsg.includes(keyword));

    if (hasMemoryKeyword && kernel.status === 'RUNNING') {
      try {
        const memoryService = kernel.serviceManager.get('MemoryService');
        if (memoryService) {
          const contentToRemember = userMsg
            .replace(/(ingat|simpan|catat|remember|save|store)/gi, '')
            .trim();

          if (contentToRemember.length > 0) {
            console.log('[ConversationEngine] Memory trigger detected, storing:', contentToRemember);
            const stored = await memoryService.storeMemory(contentToRemember, contentToRemember);
            if (stored) {
              setMessages(prev => [...prev, {
                role: 'model',
                content: `✅ Saya telah menyimpan: "${contentToRemember}" ke memori.`
              }]);
              setIsLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('[ConversationEngine] Memory trigger failed:', err);
      }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const endpoint = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process';

      let aiProvider = 'gemini';
      // let formattedModel = '';  // SUDAH dideklarasikan di atas (ENGINEER DELEGATION)
      let aiKey = '';
      let localContext = '';
      let semanticContext = '';
      let memoryService = null;

      const activeWorkspace = workspaceManager?.activeWorkspaceId || 'ws-assistant';

      let resolvedMode = 'ASSISTANT';
      let resolvedAppSource = 'assistant';

      if (activeWorkspace === 'ws-engineer' || activeWorkspace === 'ENGINEER') {
        resolvedMode = 'ENGINEER';
        resolvedAppSource = 'engineer';
      } else if (activeWorkspace === 'ws-lite' || activeWorkspace === 'MAMETLITE' || activeWorkspace === 'LITE') {
        resolvedMode = 'LITE';
        resolvedAppSource = 'mametlite';
      } else {
        // ws-assistant, ASSISTANT — semua fallback ke ASSISTANT
        resolvedMode = 'ASSISTANT';
        resolvedAppSource = 'assistant';
      }

      if (kernel.status !== 'RUNNING') {
        console.warn('[ConversationEngine] Kernel belum siap, skip service injection');
      } else {
        const brainService = kernel.serviceManager.get('BrainService');
        if (brainService) {
          const context = await brainService.getActiveBrainContext();
          aiProvider = context.provider || 'gemini';
          formattedModel = context.model || '';
          aiKey = context.key || '';
        }

        // --- Memory Injection (Layer 2) — dilewati untuk mode LITE ---
        if (resolvedMode !== 'LITE') {
          try {
            memoryService = kernel.serviceManager.get('MemoryService');
            console.log('[ConversationEngine] MemoryService tersedia?', !!memoryService);
            console.log('[ConversationEngine] Kernel status:', kernel?.status);
            console.log('[ConversationEngine] ServiceManager ada?', !!kernel?.serviceManager);

            if (!memoryService) {
              await new Promise(r => setTimeout(r, 1000));
              const memoryServiceRetry = kernel.serviceManager.get('MemoryService');
              console.log('[ConversationEngine] Setelah retry:', !!memoryServiceRetry);
              memoryService = memoryServiceRetry;
            }
          } catch (err) {
            console.warn('[ConversationEngine] ⚠️ Gagal mengakses ServiceManager:', err);
          }

          if (memoryService) {
            try {
              console.log('[ConversationEngine] 🔍 Mencari memori untuk:', userMsg);
              const memories = await memoryService.getMemory(userMsg);
              console.log('[ConversationEngine] 📋 Hasil memori:', JSON.stringify(memories));
              if (memories && memories.length > 0) {
                localContext = memories.map(m => m.summary || m.content || '').filter(Boolean).join('\n');
              }
              console.log('[ConversationEngine] 📝 GlobalMemory yang dikirim:', localContext);
            } catch (e) {
              console.warn('[ConversationEngine] MemoryService query failed:', e);
            }
          }

          // --- Semantic Context Injection (Layer 2) ---
          try {
            const semanticContextService = kernel.serviceManager.get('SemanticContextService');
            if (semanticContextService) {
              console.log('[ConversationEngine] 🔍 Parsing semantic intent untuk:', userMsg);
              const intentResult = semanticContextService.parseIntent(userMsg);
              console.log('[ConversationEngine] 📋 Intent result:', intentResult);

              if (intentResult.entities && intentResult.entities.length > 0) {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = session?.user?.id;

                if (userId) {
                  semanticContextService.updateGraph(userId, intentResult.entities);
                  const contextResult = semanticContextService.getContext(userId, userMsg);
                  semanticContext = contextResult.context;
                  console.log('[ConversationEngine] 📝 SemanticContext yang dikirim:', semanticContext);
                }
              }
            }
          } catch (e) {
            console.warn('[ConversationEngine] SemanticContextService failed:', e);
          }
        } else {
          console.log('[ConversationEngine] Mode LITE — Memory & Semantic injection dilewati.');
        }
      }

      const isLiteMode = resolvedMode === 'LITE';
      
      // Proses file attachment jika ada
      let fileData = null;
      if (attachedFile) {
        // Konversi file ke format base64
        const buffer = await attachedFile.arrayBuffer();
        const base64String = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        fileData = {
          name: attachedFile.name,
          type: attachedFile.type,
          size: attachedFile.size,
          data: base64String
        };
      }

      const payload = {
        message: userMsg,
        mode: resolvedMode,
        appSource: resolvedAppSource,
        workspaceTarget: workspaceManager.activeWorkspaceId,
        history: newMessages.slice(isLiteMode ? -5 : -10),
        globalMemory: localContext,
        semanticContext: semanticContext,
        stream: false, // Stream false
        ragEnabled: true, // AKTIFKAN RAG untuk semua mode, termasuk LITE
        tools: isLiteMode ? ['rag_search', 'web_search', 'deep_research'] : undefined, // LITE: tools terbatas
        model: formattedModel || undefined,
        file: fileData, // Sertakan file attachment jika ada
        // ✅ TAMBAHKAN: Target file untuk Engineer mode
        requestedFilePath: resolvedMode === 'ENGINEER' ? _extractFilePathFromMessage(userMsg) : undefined
      };

      // Reset file attachment setelah dikirim
      setAttachedFile(null);

      // Hapus key undefined agar payload bersih
      if (payload.tools === undefined) delete payload.tools;
      if (payload.model === undefined) delete payload.model;

      console.log('[ConversationEngine] Workspace:', activeWorkspace, 'Mode:', resolvedMode, 'AppSource:', resolvedAppSource);

      // Headers dengan pembersihan karakter non-ASCII
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

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      console.log(`[LIFECYCLE] LLM response received (HTTP Status: ${response.status})`);

      if (!response.ok) {
        let errorText = `HTTP error! status: ${response.status}`;
        try { const errorData = await response.json(); errorText = errorData.error || errorText; } catch (_) {
          errorText = await response.text() || errorText;
        }
        console.error("[LIFECYCLE] Edge Function Error:", errorText);
        setMessages(prev => [...prev, { role: 'model', content: `⚠️ Error: ${errorText}` }]);
        setIsLoading(false);
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        console.log("[LIFECYCLE] Received JSON response (DIRECT mode)");
        const jsonData = await response.json();
        const messageContent = jsonData.message || jsonData;
        setMessages(prev => [...prev, {
          role: 'model',
          content: messageContent,
          steps: jsonData.processingSteps || [],
          metadata: jsonData
        }]);

        openLifecycleInspector('execution', jsonData);
        setIsLoading(false);
        return;
      }

      let reader;
      let decoder;
      try {
        reader = response.body.getReader();
        decoder = new TextDecoder('utf-8');
      } catch (streamErr) {
        console.error("[LIFECYCLE] Failed to get stream reader:", streamErr);
        setMessages(prev => [...prev, { role: 'model', content: `⚠️ Error: Gagal membaca aliran data.` }]);
        setIsLoading(false);
        return;
      }
      let done = false;
      let aiResponseText = '';
      let processingSteps = [];
      let buffer = '';

      console.log("[LIFECYCLE] Stream started");
      setMessages(prev => [...prev, { role: 'model', content: '', steps: [], isStreaming: true }]);

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
                if (parsed.text) { chunkText = parsed.text; }
                else if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                  chunkText = parsed.choices[0].delta.content;
                }
                if (chunkText) aiResponseText += chunkText;
                console.log("[LIFECYCLE] Stream chunk received:", dataStr, "Extracted text:", chunkText);
                setMessages(prev => { const next = [...prev]; next[next.length - 1] = { role: 'model', content: aiResponseText, steps: [...processingSteps], isStreaming: !done }; return next; });
                console.log("[LIFECYCLE] Bubble updated");
              } catch (err) {
                console.error("[LIFECYCLE] Exception during chunk processing:", err);
                aiResponseText += `\n\n[System Error: Gagal memproses aliran data. Root Cause: ${err.message}]`;
                setMessages(prev => { const next = [...prev]; next[next.length - 1] = { role: 'model', content: aiResponseText, steps: [...processingSteps], isStreaming: false }; return next; });
                done = true;
              }
            }
          }
        }
      }

      console.log("[LIFECYCLE] Stream completed");
      setMessages(prev => { const next = [...prev]; next[next.length - 1].isStreaming = false; return next; });
      const finalAiResponseText = aiResponseText;

      // === OS EXECUTION INTERCEPTOR (Local Sandbox Execution) ===
      if (window.electronAPI && osState.capabilities.includes('cap:code-execution')) {
        let interceptHit = false;
        let autoReply = '';

        const termMatch = finalAiResponseText.match(/<terminal>([\s\S]*?)<\/terminal>/i);
        const mdTermMatch = finalAiResponseText.match(/```(?:bash|sh|cmd|powershell|ps1)?\n([\s\S]*?)```/i);
        let rawCmd = null;

        if (termMatch) { rawCmd = termMatch[1].trim(); }
        else if (mdTermMatch) {
          const cmdCandidate = mdTermMatch[1].trim();
          if (cmdCandidate && !cmdCandidate.includes('import ') && !cmdCandidate.includes('function ') && cmdCandidate.length < 200) {
            rawCmd = cmdCandidate;
          }
        }

        if (rawCmd) {
          interceptHit = true;
          rawCmd = rawCmd.split('\n').map(l => l.replace(/^\$\s*/, '').replace(/^>\s*/, '').trim()).filter(l => l && !l.startsWith('#')).join(' && ');
          try {
            const res = await window.electronAPI.runTerminalCommand(rawCmd);
            autoReply += `\n[SYSTEM: TERMINAL RESULT for "${rawCmd}"]\n${res.output || 'Sukses (Tidak ada output)'}\n`;
          } catch (err) { autoReply += `\n[SYSTEM: TERMINAL ERROR]\n${err.message}\n`; }
        }

        const fileMatch = finalAiResponseText.match(/<edit_file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/edit_file>/i);
        if (fileMatch) {
          interceptHit = true;
          const filePath = fileMatch[1].trim();
          const fileContent = fileMatch[2].trim();
          try {
            const res = await window.electronAPI.editFileSurgical(filePath, fileContent);
            autoReply += `\n[SYSTEM: FILE EDIT RESULT for "${filePath}"]\n${res.success ? 'Berhasil disimpan' : 'Gagal: ' + (res.error || res.message)}\n`;
          } catch (err) { autoReply += `\n[SYSTEM: FILE EDIT ERROR]\n${err.message}\n`; }
        }

        if (window.electronAPI.runDockerSandbox && !interceptHit) {
          const codeBlockMatch = finalAiResponseText.match(/```(python|py|javascript|js)\n([\s\S]*?)```/i);
          if (codeBlockMatch) {
            try {
              const dockerStatus = await window.electronAPI.checkDockerStatus();
              if (dockerStatus.available) {
                const codeLang = codeBlockMatch[1].toLowerCase();
                const codeContent = codeBlockMatch[2].trim();
                const language = (codeLang === 'py' || codeLang === 'python') ? 'python' : 'javascript';
                if (codeContent.length > 10 && codeContent.length < 50000 && (codeContent.includes('print(') || codeContent.includes('console.log'))) {
                  console.log(`[Docker Sandbox] Mengeksekusi ulang kode ${language} via Docker...`);
                  const dockerResult = await window.electronAPI.runDockerSandbox(codeContent, language);
                  if (dockerResult.success) {
                    interceptHit = true;
                    autoReply += `\n[SYSTEM: DOCKER SANDBOX EXECUTION (${language.toUpperCase()})]\nStatus: ✅ Berhasil\nOutput:\n${dockerResult.output}\n`;
                  } else if (dockerResult.error && !dockerResult.error.includes('DOCKER_NOT_AVAILABLE') && !dockerResult.error.includes('DITOLAK')) {
                    interceptHit = true;
                    autoReply += `\n[SYSTEM: DOCKER SANDBOX EXECUTION (${language.toUpperCase()})]\nStatus: ❌ Gagal\nError:\n${dockerResult.error}\n`;
                  }
                }
              }
            } catch (dockerErr) { console.warn('[Docker Sandbox] Interceptor error:', dockerErr.message); }
          }
        }

        if (interceptHit) {
          setTimeout(() => handleSend(null, `[OS EXECUTION REPORT]\nBerikut adalah hasil eksekusi dari tindakan otomatis Anda di sistem operasi lokal user.\n${autoReply}`), 1000);
        }
      }

    } catch (err) {
      console.error("Engine error:", err);
      setMessages(prev => [...prev, { role: 'model', content: `⚠️ Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-1 min-w-0 min-h-0 h-full w-full bg-background font-body-base text-on-surface">
      {/* Sidebar Riwayat Chat (Toggleable) */}
      <div className={`transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'} shrink-0 z-50 md:relative absolute left-0 top-0 h-full bg-background border-r border-outline-variant`}>
        <ChatHistory
          onSelectChat={handleLoadChat}
          onNewChat={handleNewChat}
          activeChatId={currentChatId}
          activeWorkspace={osState?.workspaceId || 'ws-assistant'}
          collapsed={false}
        />
      </div>

      {/* Overlay Backdrop for Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Area Chat Utama (Outer Wrapper, No Overflow) */}
      <div className="flex-1 flex flex-col relative min-w-0 min-h-0">

        {/* SessionToolbar Layer (Absolute to Outer Wrapper) */}
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

        {/* Inner Wrapper (Holds overflow-hidden and glows) */}
        <div className="flex-1 flex flex-col relative overflow-hidden pt-4 min-h-0">
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
                      {/* Deep Link 1: AI Reasoning / Thinking */}
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

                      {/* Deep Link 2: System & Execution Reports */}
                      {(() => {
                        if (!displayText) return null;
                        const parts = displayText.split(/(\[OS EXECUTION REPORT\]|\[SYSTEM:[^\]]+\])/g);

                        return parts.map((part, i) => {
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

                    {/* Tombol Copy */}
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
              )
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

          {/* Compact Input Area */}
          <div className="px-3 pt-3 pb-2 bg-gradient-to-t from-background via-background to-transparent z-10 flex flex-col items-center w-full">
            {(workspaceManager?.activeWorkspaceId === 'ws-engineer' || workspaceManager?.activeWorkspaceId === 'ws-assistant') && (
              <div className="w-full max-w-3xl mb-2 flex justify-start">
                <FolderSelector onSelect={(path) => setSelectedFolder(path)} currentPath={selectedFolder} showLabel={true} className="scale-90 origin-left" />
              </div>
            )}
            
            {attachedFile && (
              <div className="w-full max-w-3xl mb-2 flex items-center justify-between bg-surface-container border border-outline-variant rounded-lg px-3 py-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 text-body-sm text-on-surface">
                  <span className="material-symbols-outlined text-[16px] text-primary">attach_file</span>
                  <span className="truncate max-w-[200px]">{attachedFile.name}</span>
                </div>
                <button type="button" onClick={() => setAttachedFile(null)} className="text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            )}
            <form onSubmit={handleSend} className="w-full max-w-3xl relative flex items-end gap-2 bg-surface-container-low border border-outline-variant rounded-2xl p-2 focus-within:border-primary transition-all shadow-lg pulse-focus">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e, null); } }}
                placeholder="Ketik instruksi atau mulai percakapan dengan OS..."
                className="flex-1 max-h-48 min-h-[44px] bg-transparent resize-none py-3 px-4 text-body-base text-on-surface placeholder-on-surface-variant focus:outline-none custom-scrollbar overflow-y-auto"
                rows="1"
              />
              {workspaceManager?.activeWorkspaceId === 'ws-lite' && (
                <>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={(e) => { if (e.target.files && e.target.files[0]) setAttachedFile(e.target.files[0]); }} 
                  />
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    className="p-3 mb-1 mr-1 rounded-xl bg-surface-container-high hover:bg-surface-variant text-on-surface-variant transition-all"
                    title="Upload Dokumen RAG"
                  >
                    <span className="material-symbols-outlined text-[20px]">attach_file</span>
                  </button>
                </>
              )}
              <button type="submit" disabled={(!input.trim() && !attachedFile) || isLoading} className="p-3 mb-1 mr-1 rounded-xl bg-primary hover:bg-primary-fixed text-on-primary disabled:opacity-50 disabled:hover:bg-primary transition-all shadow-md">
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            </form>
            <div className="text-center mt-1 text-[9px] text-on-surface-variant tracking-widest uppercase opacity-50">
              CE v2.0 • {workspaceManager.activeWorkspaceId}
            </div>
          </div>

          {/* Atmospheric Background Glow */}
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-primary/5 blur-[120px] rounded-full pointer-events-none z-0"></div>
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-secondary/5 blur-[120px] rounded-full pointer-events-none z-0"></div>

        </div>
      </div>
    </div>
  );
}