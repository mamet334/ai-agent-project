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
  const [currentChatId, setCurrentChatId] = useState(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // =============================================
  // PERSISTENSI CHAT KE SUPABASE
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
      workspace_type: osState?.workspaceId || 'OWNER'
    };

    let result;
    if (chatId) {
      result = await supabase.from('chats').update(payload).eq('id', chatId);
    } else {
      result = await supabase.from('chats').insert(payload).select('id').single();
      if (result.data?.id) setCurrentChatId(result.data.id);
    }

    if (result.error) {
      console.error('[ConversationEngine] Gagal menyimpan chat:', result.error);
    }
  }, [currentChatId, osState]);

  // Auto-save setiap kali messages berubah
  useEffect(() => {
    if (currentChatId || messages.length > 0) {
      saveChatToDB(messages);
    }
  }, [messages, currentChatId, saveChatToDB]);

  const handleNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
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
      let formattedModel = '';
      let aiKey = '';
      let localContext = '';
      let semanticContext = '';
      let memoryService = null;

      const activeWorkspace = workspaceManager?.activeWorkspaceId || 'ASSISTANT';
      
      let resolvedMode = 'OWNER';
      let resolvedAppSource = 'assistant';
      
      if (activeWorkspace === 'ws-engineer' || activeWorkspace === 'ENGINEER') {
        resolvedMode = 'ENGINEER';
        resolvedAppSource = 'engineer';
      } else if (activeWorkspace === 'ws-lite' || activeWorkspace === 'MAMETLITE' || activeWorkspace === 'LITE') {
        resolvedMode = 'LITE';
        resolvedAppSource = 'mametlite';
      } else {
        // ws-owner, ASSISTANT, OWNER — semua fallback ke OWNER
        resolvedMode = 'OWNER';
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

      // Bangun payload — LITE menggunakan konfigurasi ringan
      const isLiteMode = resolvedMode === 'LITE';
      const payload = {
        message: userMsg,
        mode: resolvedMode,
        appSource: resolvedAppSource,
        workspaceTarget: workspaceManager.activeWorkspaceId,
        history: newMessages.slice(isLiteMode ? -5 : -10),
        globalMemory: localContext,
        semanticContext: semanticContext,
        stream: false, // Stream false
        ragEnabled: isLiteMode ? false : true, // LITE: ragEnabled false by default
        tools: isLiteMode ? ['rag_search', 'web_search', 'deep_research'] : undefined, // LITE: tools terbatas
        model: formattedModel || undefined,
      };
      
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
           } catch(err) { autoReply += `\n[SYSTEM: TERMINAL ERROR]\n${err.message}\n`; }
        }

        const fileMatch = finalAiResponseText.match(/<edit_file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/edit_file>/i);
        if (fileMatch) {
           interceptHit = true;
           const filePath = fileMatch[1].trim();
           const fileContent = fileMatch[2].trim();
           try {
             const res = await window.electronAPI.editFileSurgical(filePath, fileContent);
             autoReply += `\n[SYSTEM: FILE EDIT RESULT for "${filePath}"]\n${res.success ? 'Berhasil disimpan' : 'Gagal: ' + (res.error || res.message)}\n`;
           } catch(err) { autoReply += `\n[SYSTEM: FILE EDIT ERROR]\n${err.message}\n`; }
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
    <div className="flex h-full bg-slate-950">
      {/* Sidebar Riwayat Chat */}
      <ChatHistory 
        onSelectChat={handleLoadChat} 
        onNewChat={handleNewChat} 
        activeChatId={currentChatId} 
      />
      
      {/* Area Chat Utama */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar relative">
          {messages.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 pointer-events-none">
              <Terminal className="w-16 h-16 mb-4" />
              <div className="font-mono text-sm tracking-widest text-emerald-500">CONVERSATION ENGINE</div>
              <div className="text-xs text-slate-500 mt-2">Waiting for input...</div>
            </div>
          )}

          {messages.map((m, idx) => {
            const parsed = parseThinkingContent(m.content);
            const displayText = parsed.answer || m.content || '';
            
            return (
              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`relative group max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 ${m.role === 'user' ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-500/30' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}>
                  <div className="text-sm font-sans leading-relaxed">
                    {/* Deep Link 1: AI Reasoning / Thinking */}
                    {parsed.thinking && (
                      <div 
                        onClick={() => openLifecycleInspector('AI_REASONING', parsed.thinking)}
                        className="mb-3 inline-flex items-center gap-2 px-2.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono rounded-md cursor-pointer hover:bg-indigo-500/20 hover:text-indigo-300 transition-all shadow-sm"
                        title="Open AI thought trace in Right Workbench"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        [Deep Link] View AI Reasoning Trace
                      </div>
                    )}
                    
                    {/* Deep Link 2: System & Execution Reports */}
                    {(() => {
                      if (!displayText) return null;
                      // Pisahkan teks berdasarkan pola [OS EXECUTION REPORT] atau [SYSTEM: ...]
                      const parts = displayText.split(/(\[OS EXECUTION REPORT\]|\[SYSTEM:[^\]]+\])/g);
                      
                      return parts.map((part, i) => {
                        if (part === '[OS EXECUTION REPORT]') {
                           return (
                             <div key={i} className="my-2 block w-max items-center px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono rounded cursor-pointer hover:bg-emerald-500/20 transition-colors shadow-sm"
                                  onClick={() => openLifecycleInspector('OS_EXECUTION', displayText)}>
                                <Activity className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
                                OS EXECUTION REPORT (Click to Inspect)
                             </div>
                           );
                        }
                        
                        if (part.startsWith('[SYSTEM:')) {
                           const title = part.replace('[SYSTEM: ', '').replace(']', '');
                           return (
                             <div key={i} className="my-2 block w-max items-center px-3 py-2 bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold font-mono rounded cursor-pointer hover:bg-slate-700 transition-colors shadow-sm"
                                  onClick={() => openLifecycleInspector(title, displayText)}>
                                <Terminal className="w-3.5 h-3.5 inline-block mr-2 -mt-0.5" />
                                {title} (Inspect Context)
                             </div>
                           );
                        }
                        
                        return <span key={i} className="whitespace-pre-wrap">{part}</span>;
                      });
                    })()}
                    
                    {m.isStreaming && parsed.isThinkingComplete && <span className="animate-pulse"> ▍</span>}
                  </div>
                  
                  {/* Tombol Copy */}
                  {m.role === 'model' && !m.isStreaming && displayText && (
                    <button
                      onClick={() => handleCopy(displayText, idx)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Salin ke clipboard"
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {isLoading && messages[messages.length - 1]?.role !== 'model' && (
             <div className="flex justify-start">
              <div className="bg-slate-900 px-5 py-3 rounded-2xl border border-slate-800 text-slate-400 text-xs flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> Awaiting Intent Dispatch...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Folder Selector — hanya untuk workspace Engineer */}
        {workspaceManager?.activeWorkspaceId === 'ws-engineer' && (
          <div className="px-4 py-2 border-t border-slate-800">
            <FolderSelector onSelect={(path) => setSelectedFolder(path)} currentPath={selectedFolder} showLabel={true} />
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 bg-slate-950 border-t border-slate-900 shrink-0">
          <form onSubmit={handleSend} className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-900 border border-slate-800 rounded-xl p-2 focus-within:border-emerald-500/50 transition-colors shadow-lg">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e, null); } }}
              placeholder="Ketik instruksi atau mulai percakapan dengan OS..."
              className="flex-1 max-h-48 min-h-[44px] bg-transparent resize-none py-2.5 px-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none custom-scrollbar"
              rows="1"
            />
            <button type="submit" disabled={!input.trim() || isLoading} className="p-3 mb-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white transition-all shadow-md">
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-center mt-2 text-[10px] text-slate-500 font-mono">
            MAEF Conversation Engine v2.0 • Workspace: {workspaceManager.activeWorkspaceId}
          </div>
        </div>
      </div>
    </div>
  );
}