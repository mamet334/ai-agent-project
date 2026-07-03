import React, { useState, useEffect, useRef } from 'react';
import { Send, Terminal, Loader2, RefreshCw } from 'lucide-react';
import { useWorkspace } from '../../core/workspace/WorkspaceContext';
import { supabase } from '../../supabase';
import { kernel } from '../../core/runtime/Kernel';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
  // Jika tidak ada tag think, seluruh teks adalah answer
  return { thinking: '', answer: text, isThinkingComplete: true };
};

export default function ConversationEngine({ sessionId }) {
  const { manager: workspaceManager, osState } = useWorkspace();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle Event Flow (Integrasi UI Event ke Right Workbench)
  const openLifecycleInspector = (stepName, logs) => {
    // 1. Dapatkan referensi Widget Registry dari event
    workspaceManager.openWidgetInWorkbench('right', 'widget:maef-monitor', {
      focusStep: stepName,
      logs: logs
    });
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
          // Extract the content to remember (remove the trigger word)
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
      
      // --- AI Brain Injection (OS Layer Integration) ---
      let aiProvider = 'gemini';
      let formattedModel = '';
      let aiKey = '';
      let localContext = '';
      let semanticContext = '';   // ✅ Dideklarasikan di sini agar bisa diakses di luar blok if/else
      let memoryService = null;

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

        // --- Memory Injection (Layer 2) ---
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
      }

      const activeWorkspace = workspaceManager?.activeWorkspaceId || 'ASSISTANT';
      
      let resolvedMode = 'OWNER';
      let resolvedAppSource = 'assistant';
      
      if (activeWorkspace === 'ENGINEER') {
        resolvedMode = 'ENGINEER';
        resolvedAppSource = 'engineer';
      } else if (activeWorkspace === 'ASSISTANT' || activeWorkspace === 'OWNER') {
        resolvedMode = 'OWNER';
        resolvedAppSource = 'assistant';
      } else if (activeWorkspace === 'MAMETLITE' || activeWorkspace === 'LITE') {
        resolvedMode = 'LITE';
        resolvedAppSource = 'mametlite';
      }

      const payload = {
        message: userMsg,
        mode: resolvedMode,
        appSource: resolvedAppSource,
        workspaceTarget: workspaceManager.activeWorkspaceId,
        history: newMessages.slice(-10),
        globalMemory: localContext,
        semanticContext: semanticContext,   // ✅ Sekarang variabel ini sudah dikenali
        stream: false,
        ragEnabled: true,
        model: formattedModel || undefined,
      };
      
      console.log('[ConversationEngine] Workspace:', activeWorkspace, 'Mode:', resolvedMode, 'AppSource:', resolvedAppSource);

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      if (aiKey) {
        if (aiProvider === 'openrouter') headers['x-byok-openrouter'] = aiKey;
        else if (aiProvider === 'openai') headers['x-byok-openai'] = aiKey;
        else if (aiProvider === 'groq') headers['x-byok-groq'] = aiKey;
        else if (aiProvider === 'gemini') headers['x-byok-gemini'] = aiKey;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      console.log(`[LIFECYCLE] LLM response received (HTTP Status: ${response.status})`);
      
      if (!response.ok) {
        let errorText = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorText = errorData.error || errorText;
        } catch (_) {
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
        
        // Automatically push the trace to the adjacent layer
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
                if (parsed.step) {
                   processingSteps.push(parsed.step);
                }
                // Parsing format dari edge function: { choices: [{ delta: { content: "teks" } }] }
                let chunkText = '';
                if (parsed.text) {
                  chunkText = parsed.text;
                } else if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                  chunkText = parsed.choices[0].delta.content;
                }
                
                if (chunkText) {
                  aiResponseText += chunkText;
                }
                
                console.log("[LIFECYCLE] Stream chunk received:", dataStr, "Extracted text:", chunkText);
                
                setMessages(prev => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    role: 'model',
                    content: aiResponseText,
                    steps: [...processingSteps],
                    isStreaming: !done
                  };
                  return next;
                });
                console.log("[LIFECYCLE] Bubble updated");
              } catch (err) {
                 console.error("[LIFECYCLE] Exception during chunk processing:", err);
                 aiResponseText += `\n\n[System Error: Gagal memproses aliran data. Root Cause: ${err.message}]`;
                 setMessages(prev => {
                   const next = [...prev];
                   next[next.length - 1] = {
                     role: 'model',
                     content: aiResponseText,
                     steps: [...processingSteps],
                     isStreaming: false
                   };
                   return next;
                 });
                 done = true; // Architecturally stop the stream on unrecoverable parsing error
              }
            }
          }
        }
      }
      
      // Finalize
      console.log("[LIFECYCLE] Stream completed");
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1].isStreaming = false;
        return next;
      });
      
      // Populate aiResponseText for OS Execution Interceptor
      const finalAiResponseText = aiResponseText;

      // === OS EXECUTION INTERCEPTOR (Local Sandbox Execution) ===
      if (window.electronAPI && osState.capabilities.includes('cap:code-execution')) {
        let interceptHit = false;
        let autoReply = '';

        // 1. Terminal parsing (<terminal>...</terminal>)
        const termMatch = finalAiResponseText.match(/<terminal>([\s\S]*?)<\/terminal>/i);
        const mdTermMatch = finalAiResponseText.match(/```(?:bash|sh|cmd|powershell|ps1)?\n([\s\S]*?)```/i);
        let rawCmd = null;

        if (termMatch) {
          rawCmd = termMatch[1].trim();
        } else if (mdTermMatch) {
          // Hanya tangkap command pendek yang aman jika bukan XML tag formal
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
           } catch(err) {
             autoReply += `\n[SYSTEM: TERMINAL ERROR]\n${err.message}\n`;
           }
        }

        // 2. File Editing (<edit_file path="...">...</edit_file>)
        const fileMatch = finalAiResponseText.match(/<edit_file\s+path=["']([^"']+)["'][^>]*>([\s\S]*?)<\/edit_file>/i);
        if (fileMatch) {
           interceptHit = true;
           const filePath = fileMatch[1].trim();
           const fileContent = fileMatch[2].trim();
           try {
             const res = await window.electronAPI.editFileSurgical(filePath, fileContent);
             autoReply += `\n[SYSTEM: FILE EDIT RESULT for "${filePath}"]\n${res.success ? 'Berhasil disimpan' : 'Gagal: ' + (res.error || res.message)}\n`;
           } catch(err) {
             autoReply += `\n[SYSTEM: FILE EDIT ERROR]\n${err.message}\n`;
           }
        }

        // 3. Docker Sandbox Interceptor (Isolated Code Execution)
        if (window.electronAPI.runDockerSandbox && !interceptHit) {
          const codeBlockMatch = finalAiResponseText.match(/```(python|py|javascript|js)\n([\s\S]*?)```/i);
          if (codeBlockMatch) {
            try {
              const dockerStatus = await window.electronAPI.checkDockerStatus();
              if (dockerStatus.available) {
                const codeLang = codeBlockMatch[1].toLowerCase();
                const codeContent = codeBlockMatch[2].trim();
                const language = (codeLang === 'py' || codeLang === 'python') ? 'python' : 'javascript';
                
                // Hanya eksekusi jika kode terlihat aman dan bermakna
                if (codeContent.length > 10 && codeContent.length < 50000 && 
                    (codeContent.includes('print(') || codeContent.includes('console.log'))) {
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
            } catch (dockerErr) {
              console.warn('[Docker Sandbox] Interceptor error:', dockerErr.message);
            }
          }
        }

        if (interceptHit) {
           setTimeout(() => {
              handleSend(null, `[OS EXECUTION REPORT]\nBerikut adalah hasil eksekusi dari tindakan otomatis Anda di sistem operasi lokal user.\n${autoReply}`);
           }, 1000);
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
    <div className="flex flex-col h-full bg-slate-950">
      
      {/* Messages */}
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
          // Fallback: jika parsed.answer kosong, gunakan m.content langsung
          const displayText = parsed.answer || m.content || '';
          
          return (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 ${m.role === 'user' ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-500/30' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}>
                
                {/* Final Response Output */}
                <div className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                  {displayText}
                  {m.isStreaming && parsed.isThinkingComplete && <span className="animate-pulse"> ▍</span>}
                </div>
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

      {/* Input Base */}
      <div className="p-4 bg-slate-950 border-t border-slate-900 shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-900 border border-slate-800 rounded-xl p-2 focus-within:border-emerald-500/50 transition-colors shadow-lg">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e, null);
              }
            }}
            placeholder="Ketik instruksi atau mulai percakapan dengan OS..."
            className="flex-1 max-h-48 min-h-[44px] bg-transparent resize-none py-2.5 px-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none custom-scrollbar"
            rows="1"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-3 mb-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white transition-all shadow-md"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="text-center mt-2 text-[10px] text-slate-500 font-mono">
          MAEF Conversation Engine v2.0 • Workspace: {workspaceManager.activeWorkspaceId}
        </div>
      </div>
    </div>
  );
}

// Temporary CheckCircle icon component
const CheckCircle = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);