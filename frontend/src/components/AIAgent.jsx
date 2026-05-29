import React, { useState, useRef, useEffect } from 'react';
import { Send, Code2, Zap, GitBranch, MessageCircle, Settings, Plus, Menu, X, LogOut, User, Lock, Mail, Paperclip, FileText, Image as ImageIcon, Globe, Clock } from 'lucide-react';
import { supabase } from '../supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';

const Mermaid = ({ chart }) => {
  const chartRef = useRef(null);

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    if (chartRef.current) {
      try {
        const uniqueId = `mermaid-${Math.random().toString(36).substring(2)}`;
        mermaid.render(uniqueId, chart).then(({ svg }) => {
          if (chartRef.current) {
            chartRef.current.innerHTML = svg;
          }
        }).catch(e => {
          console.error("Mermaid parsing error:", e);
          if (chartRef.current) {
            chartRef.current.innerHTML = `<div class="text-red-400 p-2 text-xs">Error rendering chart: ${e.message}</div>`;
          }
        });
      } catch (err) {
        console.error(err);
      }
    }
  }, [chart]);

  return <div ref={chartRef} className="mermaid flex justify-center my-6 bg-slate-900/60 p-6 rounded-xl border border-purple-500/20 w-full overflow-x-auto shadow-inner shadow-black/50" />;
};

const MessageContent = ({ text }) => {
  if (!text) return null;
  return (
    <div className="prose prose-sm prose-invert prose-purple max-w-none leading-normal prose-pre:bg-slate-950/80 prose-pre:border prose-pre:border-purple-500/20 prose-code:text-purple-300 prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-td:border-purple-500/20 prose-th:border-purple-500/20 prose-tr:border-purple-500/20">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({node, inline, className, children, ...props}) {
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            if (!inline && lang === 'mermaid') {
              return <Mermaid chart={String(children).replace(/\n$/, '')} />
            }
            return !inline ? (
              <div className="relative group rounded-xl overflow-hidden my-4 border border-purple-500/20 shadow-lg shadow-purple-500/10">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-purple-500/20">
                  <span className="text-[10px] text-purple-400 font-mono uppercase tracking-wider">{lang || 'Code'}</span>
                </div>
                <pre className="p-4 overflow-x-auto text-sm text-slate-300" {...props}>
                  <code className={className}>{children}</code>
                </pre>
              </div>
            ) : (
              <code className="bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded-md text-xs border border-purple-500/20" {...props}>
                {children}
              </code>
            )
          },
          table({node, ...props}) {
             return <div className="overflow-x-auto my-4 rounded-xl border border-purple-500/20"><table className="w-full text-left" {...props} /></div>
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

const TypewriterText = ({ text, onComplete }) => {
  const [displayed, setDisplayed] = React.useState('');
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (!text) return;
    let i = 0;
    const speed = 12;
    const chars = 3;
    const interval = setInterval(() => {
      i += chars;
      if (i >= text.length) {
        setDisplayed(text);
        setDone(true);
        clearInterval(interval);
        if (onComplete) onComplete();
      } else {
        setDisplayed(text.substring(0, i));
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text]);

  return <MessageContent text={done ? text : displayed + ' ▍'} />;
};

export default function AIAgent() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState(['web_search', 'code_executor', 'api_caller']);
  const [selectedTools, setSelectedTools] = useState(['web_search']);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [attachedFile, setAttachedFile] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [conversations, setConversations] = useState([{ id: 'default', title: 'Percakapan Baru', messages: [] }]);
  const [currentConversationId, setCurrentConversationId] = useState('default');
  const [currentlyTypingId, setCurrentlyTypingId] = useState(null);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('ai_agent_selected_model') || 'gemini-2.5-flash');
  const [globalMemory, setGlobalMemory] = useState('');

  // Supabase Auth State
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Cron State
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [isCronModalOpen, setIsCronModalOpen] = useState(false);
  const [cronForm, setCronForm] = useState({ title: '', prompt: '', interval_hours: 24 });
  const [cronLoading, setCronLoading] = useState(false);
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'cron'

  // Check auth & listen to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch chats when user changes
  useEffect(() => {
    const userKey = user ? user.id : 'anon';
    const localChats = localStorage.getItem(`ai_agent_conversations_${userKey}`);
    const localMemory = localStorage.getItem(`ai_agent_global_memory_${userKey}`);
    const localCurrentChat = localStorage.getItem(`ai_agent_current_chat_${userKey}`);

    if (localMemory) setGlobalMemory(localMemory);
    else if (user?.user_metadata?.global_memory) setGlobalMemory(user.user_metadata.global_memory);
    else setGlobalMemory('');

    if (localChats) {
      try {
        const parsed = JSON.parse(localChats);
        const restored = parsed.map(c => ({
          ...c,
          messages: (c.messages || []).map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
        setConversations(restored);
        if (localCurrentChat) setCurrentConversationId(localCurrentChat);
      } catch (e) {
        setConversations([{ id: 'default', title: 'Percakapan Baru', messages: [] }]);
        setCurrentConversationId('default');
      }
    } else {
      setConversations([{ id: 'default', title: 'Percakapan Baru', messages: [] }]);
      setCurrentConversationId('default');
    }

    if (user) {
      const fetchChats = async () => {
        const { data, error } = await supabase.from('chats').select('*').order('updated_at', { ascending: false });
        if (data && data.length > 0) {
          const parsedChats = data.map(c => ({
            ...c,
            messages: (c.messages || []).map(m => ({
              ...m,
              timestamp: new Date(m.timestamp)
            }))
          }));
          
          setConversations(parsedChats);
          if (!parsedChats.find(c => c.id === localCurrentChat)) {
            setCurrentConversationId(parsedChats[0].id);
          }
        }
      };
      
      const fetchCron = async () => {
        const { data, error } = await supabase.from('scheduled_tasks').select('*').order('created_at', { ascending: false });
        if (data) setScheduledTasks(data);
      };

      fetchChats();
      fetchCron();
    }
  }, [user]);

  // Sync conversations to localStorage
  useEffect(() => {
    const userKey = user ? user.id : 'anon';
    localStorage.setItem(`ai_agent_conversations_${userKey}`, JSON.stringify(conversations));
    localStorage.setItem(`ai_agent_current_chat_${userKey}`, currentConversationId);
  }, [conversations, currentConversationId, user]);

  // Sync state that doesn't go to Supabase
  useEffect(() => {
    localStorage.setItem('ai_agent_selected_model', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    const userKey = user ? user.id : 'anon';
    localStorage.setItem(`ai_agent_global_memory_${userKey}`, globalMemory);
    
    // Save to DB metadata dynamically with debounce to avoid spamming
    if (user && globalMemory !== (user.user_metadata?.global_memory || '')) {
      const timeoutId = setTimeout(() => {
        supabase.auth.updateUser({
          data: { global_memory: globalMemory }
        });
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [globalMemory, user]);

  // Supabase Sync Helper
  const syncConversationToDB = async (conv) => {
    if (!user) return conv;
    try {
      if (conv.id === 'default' || String(conv.id).startsWith('temp-')) {
        const { data, error } = await supabase.from('chats')
          .insert({ user_id: user.id, title: conv.title, messages: conv.messages })
          .select().single();
        if (data) {
          const syncedConv = { ...data, messages: (data.messages || []).map(m => ({...m, timestamp: new Date(m.timestamp)})) };
          
          // Update the local state with the real UUID from Supabase
          setConversations(prev => prev.map(c => c.id === conv.id ? syncedConv : c));
          setCurrentConversationId(syncedConv.id);
          
          return syncedConv;
        }
      } else {
        await supabase.from('chats').update({ title: conv.title, messages: conv.messages, updated_at: new Date() }).eq('id', conv.id);
      }
    } catch (e) {
      console.error('Error syncing to DB:', e);
    }
    return conv;
  };

  const activeConversation = conversations.find(c => c.id === currentConversationId) || conversations[0];
  const messages = activeConversation.messages;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleNewChat = () => {
    const newId = `temp-${Date.now()}`;
    const newConv = { id: newId, title: 'Percakapan Baru', messages: [] };
    setConversations(prev => [newConv, ...prev]);
    setCurrentConversationId(newId);
    setSidebarOpen(false);
  };

  const handleDeleteConversation = async (id) => {
    if (user && id !== 'default' && !String(id).startsWith('temp-')) {
      await supabase.from('chats').delete().eq('id', id);
    }
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (filtered.length === 0) return [{ id: 'default', title: 'Percakapan Baru', messages: [] }];
      return filtered;
    });
    if (currentConversationId === id) setCurrentConversationId('default');
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const { error } = isLoginMode 
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    else { setAuthEmail(''); setAuthPassword(''); }
    setAuthLoading(false);
  };

  const handleCronSubmit = async (e) => {
    e.preventDefault();
    if (!cronForm.title || !cronForm.prompt) return;
    setCronLoading(true);
    const { data, error } = await supabase.from('scheduled_tasks').insert([{
      user_id: user.id,
      title: cronForm.title,
      prompt: cronForm.prompt,
      interval_hours: parseInt(cronForm.interval_hours),
      tools: selectedTools
    }]).select();
    
    if (data) {
      setScheduledTasks(prev => [data[0], ...prev]);
      setIsCronModalOpen(false);
      setCronForm({ title: '', prompt: '', interval_hours: 24 });
    }
    setCronLoading(false);
  };

  const handleDeleteCron = async (id) => {
    await supabase.from('scheduled_tasks').delete().eq('id', id);
    setScheduledTasks(prev => prev.filter(t => t.id !== id));
  };

  const toolIcons = {
    web_search: <Zap className="w-4 h-4" />,
    deep_research: <Globe className="w-4 h-4 text-emerald-400" />,
    youtube_analyst: <Globe className="w-4 h-4 text-red-500" />,
    web_scraper: <Globe className="w-4 h-4" />,
    code_executor: <Code2 className="w-4 h-4" />,
    api_caller: <GitBranch className="w-4 h-4" />,
    slack_integration: <MessageCircle className="w-4 h-4" />,
    logika: <Zap className="w-4 h-4 text-yellow-400" />,
    bahasa: <MessageCircle className="w-4 h-4 text-pink-400" />,
    debate: <User className="w-4 h-4 text-cyan-400" />
  };

  const toolDescriptions = {
    web_search: 'Sub-Agent Riset Internet',
    deep_research: 'Sub-Agent Riset Mendalam (Multi-Web Scraping)',
    youtube_analyst: 'Sub-Agent Pengekstrak & Perangkum YouTube',
    web_scraper: 'Sub-Agent Web Scraper (URL)',
    code_executor: 'Sub-Agent Penulis & Eksekutor Kode',
    api_caller: 'Sub-Agent Integrasi API',
    slack_integration: 'Sub-Agent Notifikasi Slack',
    logika: 'Sub-Agent Analisis & Penalaran Kompleks',
    bahasa: 'Sub-Agent Nuansa & Gaya Bahasa',
    debate: 'Mode Diskusi Agent (Logika vs Kritikus)'
  };

  const handleSendMessage = async () => {
    if ((!input.trim() && !attachedFile) || loading) return;

    const displayInput = input || 'Tolong pelajari dokumen ini.';
    let apiInput = displayInput;
    const currentFile = attachedFile;
    const currentFileName = currentFile ? currentFile.name : null;

    setInput('');
    setAttachedFile(null); // Clear early
    setLoading(true);
    setLogs(['🔍 Memulai proses...']);

    let filePayload = null;
    if (currentFileName) {
      setLogs(prev => [...prev, `📁 Membaca file: ${currentFileName}...`]);
      try {
        const base64Data = await new Promise((resolve, reject) => {
          if (currentFile.type && currentFile.type.startsWith('image/')) {
            const img = new window.Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const maxDim = 1200;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              resolve(dataUrl.split(',')[1]);
            };
            img.onerror = () => reject(new Error('Gagal memproses gambar'));
            img.src = URL.createObjectURL(currentFile);
          } else {
            const reader = new FileReader();
            reader.readAsDataURL(currentFile);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
          }
        });

        filePayload = {
          name: currentFile.name,
          mimeType: currentFile.type && currentFile.type.startsWith('image/') ? 'image/jpeg' : (currentFile.type || 'application/octet-stream'),
          data: base64Data
        };
      } catch (err) {
        setLogs(prev => [...prev, `❌ Gagal membaca file: ${err.message}`]);
        setLoading(false);
        return;
      }
    }

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: currentFileName ? `${displayInput}\n\n*(File/Gambar Terlampir: ${currentFileName})*` : displayInput,
      timestamp: new Date(),
    };

    // Update active conversation's messages
    let syncedConvId = currentConversationId;
    setConversations(prev => prev.map(c => {
      if (c.id === currentConversationId) {
        const updatedMessages = [...c.messages, userMessage];
        const title = c.title === 'Percakapan Baru' && c.messages.length === 0
          ? (displayInput.length > 25 ? displayInput.substring(0, 25) + '...' : displayInput)
          : c.title;
        const newC = { ...c, title, messages: updatedMessages };
        syncConversationToDB(newC).then(synced => {
          if (synced.id !== c.id) {
            setConversations(curr => curr.map(cc => cc.id === c.id ? synced : cc));
            setCurrentConversationId(synced.id);
            syncedConvId = synced.id;
          }
        });
        return newC;
      }
      return c;
    }));

    setLogs(prev => [...prev, 
      '🔍 Menganalisis permintaan...',
      '🛠️ Mempersiapkan tools: ' + (selectedTools.length > 0 ? selectedTools.join(', ') : 'none')
    ]);

    // Simulate logs stream
    const logIntervals = [
      setTimeout(() => setLogs(p => [...p, '⚡ Menghubungi Model AI (LLM)...']), 600),
      setTimeout(() => setLogs(p => [...p, '🧠 AI sedang merumuskan jawaban terbaik...']), 1300),
    ];

    try {
      // Hardcode ke Supabase Edge Function agar tidak terganggu oleh konfigurasi Vercel yang salah
      const endpoint = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process';
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      };
      
      const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Teman';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          message: apiInput,
          file: filePayload,
          tools: selectedTools,
          model: selectedModel,
          userId: user?.id || 'anonymous',
          userName: userName,
          globalMemory: globalMemory,
          stream: true,
          history: messages.map(m => ({ role: m.type === 'user' ? 'user' : 'model', content: m.content })).slice(-10)
        })
      });

      // Clear pending mock logs timeouts
      logIntervals.forEach(clearTimeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server responded with an error');
      }

      if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
        const metadataHeader = response.headers.get('X-Agent-Metadata');
        const meta = metadataHeader ? JSON.parse(metadataHeader) : {};
        
        const agentMessage = {
          id: Date.now() + 1,
          type: 'agent',
          content: '',
          tools: meta.toolsUsed || selectedTools,
          groundingSources: meta.groundingSources || [],
          toolExecution: meta.toolExecution || null,
          subagentRuns: meta.subagentRuns || [],
          timestamp: new Date(),
          isStreaming: true
        };

        // setCurrentlyTypingId(agentMessage.id); // Disabled for streaming so it doesn't re-typewrite
        
        // Push initial empty message
        setConversations(prev => prev.map(c => {
          if (c.id === currentConversationId || c.id === syncedConvId) {
            return { ...c, messages: [...c.messages, agentMessage] };
          }
          return c;
        }));

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let streamedContent = '';

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                    streamedContent += data.choices[0].delta.content;
                    
                    // Update state with new chunk
                    setConversations(prev => prev.map(c => {
                      if (c.id === currentConversationId || c.id === syncedConvId) {
                        const updatedMessages = c.messages.map(m => 
                          m.id === agentMessage.id ? { ...m, content: streamedContent } : m
                        );
                        return { ...c, messages: updatedMessages };
                      }
                      return c;
                    }));
                  }
                } catch(e) {}
              }
            }
          }
        }
        
        // Streaming finished, sync to DB
        setCurrentlyTypingId(null);
        setConversations(prev => {
          const updatedPrev = prev.map(c => {
            if (c.id === currentConversationId || c.id === syncedConvId) {
              const updatedMessages = c.messages.map(m => 
                m.id === agentMessage.id ? { ...m, isStreaming: false } : m
              );
              const newC = { ...c, messages: updatedMessages };
              syncConversationToDB(newC);
              return newC;
            }
            return c;
          });
          return updatedPrev;
        });

      } else {
        const data = await response.json();
        const agentMessage = {
          id: Date.now() + 1,
          type: 'agent',
          content: data.message,
          tools: data.toolsUsed || [],
          groundingSources: data.groundingSources || [],
          toolExecution: data.toolExecution || null,
          subagentRuns: data.subagentRuns || [],
          timestamp: new Date(data.timestamp || Date.now()),
        };

        setCurrentlyTypingId(agentMessage.id);

        setConversations(prev => prev.map(c => {
          if (c.id === currentConversationId || c.id === syncedConvId) {
            const newC = { ...c, messages: [...c.messages, agentMessage] };
            syncConversationToDB(newC);
            return newC;
          }
          return c;
        }));
      }
    } catch (error) {
      console.error('Error contacting backend:', error);
      // Clear pending mock logs timeouts
      logIntervals.forEach(clearTimeout);

      const errorMessage = {
        id: Date.now() + 1,
        type: 'agent',
        content: `Error: Gagal memproses permintaan. ${error.message}. Pastikan server backend Anda berjalan.`,
        timestamp: new Date(),
      };
      setConversations(prev => prev.map(c => {
        if (c.id === currentConversationId) {
          return { ...c, messages: [...c.messages, errorMessage] };
        }
        return c;
      }));
    } finally {
      setLoading(false);
      setLogs([]);
    }
  };

  const generateResponse = (query, toolsUsed) => {
    const responses = {
      search: 'Saya menemukan informasi terkait dari web. Data menunjukkan tren positif dalam domain yang Anda tanyakan.',
      code: 'Kode telah dianalisis dan dieksekusi. Hasilnya menunjukkan output yang sesuai dengan ekspektasi.',
      api: 'API berhasil dipanggil. Response diterima dengan status 200 dan data telah diproses.',
      slack: 'Pesan telah dikirim ke channel Slack yang ditentukan.',
    };

    let result = '';
    if (toolsUsed.includes('web_search')) result += responses.search + ' ';
    if (toolsUsed.includes('code_executor')) result += responses.code + ' ';
    if (toolsUsed.includes('api_caller')) result += responses.api + ' ';
    if (toolsUsed.includes('slack_integration')) result += responses.slack + ' ';

    return result || 'Tugas telah diproses dengan sukses.';
  };

  const toggleTool = (tool) => {
    setSelectedTools(prev =>
      prev.includes(tool)
        ? prev.filter(t => t !== tool)
        : [...prev, tool]
    );
  };

  const availableTools = ['web_search', 'deep_research', 'youtube_analyst', 'code_executor', 'api_caller', 'slack_integration', 'logika', 'bahasa', 'debate'];

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden text-white">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-40 right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"></div>
        <div className="z-10 bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl border border-purple-500/30 w-full max-w-md shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Zap className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-2 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">AI Agent Platform</h2>
          <p className="text-center text-slate-400 mb-8 text-sm">{isLoginMode ? 'Login untuk menyimpan memori AI Anda' : 'Buat akun untuk memulai'}</p>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-purple-500 transition-all text-white" placeholder="nama@email.com" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="password" required value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-purple-500 transition-all text-white" placeholder="••••••••" />
              </div>
            </div>
            {authError && <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">{authError}</div>}
            <button type="submit" disabled={authLoading} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold text-sm transition-all shadow-lg shadow-purple-500/30">
              {authLoading ? 'Memproses...' : (isLoginMode ? 'Sign In' : 'Sign Up')}
            </button>
          </form>
          <div className="mt-6 text-center text-sm text-slate-400">
            {isLoginMode ? 'Belum punya akun? ' : 'Sudah punya akun? '}
            <button onClick={() => setIsLoginMode(!isLoginMode)} className="text-purple-400 hover:text-purple-300 font-medium transition-colors">
              {isLoginMode ? 'Daftar sekarang' : 'Login di sini'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-900 to-slate-950 text-white">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-40 right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-700"></div>
      </div>

      <div className="relative flex h-screen overflow-hidden">
        {/* Sidebar Overlay (Mobile only) */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-slate-950 border-r border-purple-500/20 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:bg-slate-900/50 md:backdrop-blur-md md:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          {/* Header */}
          <div className="p-6 border-b border-purple-500/20 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <Zap className="w-6 h-6" />
                </div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  AI Agent
                </h1>
              </div>
              <p className="text-xs text-slate-400">Multi-tool integration platform</p>
            </div>
            
            {/* Close button for Mobile */}
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-slate-400 hover:text-white md:hidden rounded-lg hover:bg-slate-800/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* New Chat Button */}
          <div className="p-4 border-b border-purple-500/20">
            <button 
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 text-sm"
            >
              <Plus className="w-4 h-4" />
              Percakapan Baru
            </button>
          </div>

          {/* Conversations list & Tools Selection */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Conversations Section */}
            <div>
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Riwayat Chat
              </h3>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {conversations.map(conv => (
                  <div key={conv.id} className="relative group flex items-center">
                    <button
                      onClick={() => {
                        setCurrentConversationId(conv.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all truncate pr-8 ${
                        conv.id === currentConversationId
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium'
                          : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                      }`}
                    >
                      <MessageCircle className="w-4 h-4 shrink-0 text-purple-400" />
                      <span className="truncate">{conv.title}</span>
                    </button>
                    {conversations.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.id);
                        }}
                        className="absolute right-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                        title="Hapus percakapan"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tools Selection Section */}
            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Active Tools
              </h3>
              <div className="space-y-2">
                {availableTools.map(tool => (
                  <button
                    key={tool}
                    onClick={() => toggleTool(tool)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
                      selectedTools.includes(tool)
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/50'
                        : 'bg-slate-800/40 text-slate-400 hover:bg-slate-700/50'
                    }`}
                  >
                    {toolIcons[tool] || <Plus className="w-4 h-4" />}
                    <div className="text-left flex-1">
                      <div className="font-medium">{tool.replace('_', ' ')}</div>
                      <div className="text-xs opacity-75">{toolDescriptions[tool]}</div>
                    </div>
                    <div
                      className={`w-2 h-2 rounded-full transition-all ${
                        selectedTools.includes(tool)
                          ? 'bg-green-400 shadow-lg shadow-green-500/50'
                          : 'bg-slate-600'
                      }`}
                    ></div>
                  </button>
                ))}
              </div>
            </div>

            {/* Global Memory Section */}
            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                🧠 Memori Global Mamet
              </h3>
              <p className="text-[10px] text-slate-400 mb-2 leading-tight">
                Tuliskan preferensi, konteks proyek, atau gaya bicara. Mamet akan SELALU mengingat ini di setiap percakapan.
              </p>
              <textarea
                value={globalMemory}
                onChange={(e) => setGlobalMemory(e.target.value)}
                placeholder="Contoh: Saya adalah programmer JS. Selalu jawab dengan singkat. Panggil saya Bos."
                className="w-full h-24 bg-slate-900/50 border border-purple-500/30 rounded-lg p-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500/60 resize-none transition-all"
              />
            </div>

            {/* Scheduled Tasks (Cron) Section */}
            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                ⏰ Tugas Otomatis (Cron)
              </h3>
              <p className="text-[10px] text-slate-400 mb-3 leading-tight">
                Mamet akan mengerjakan riset/tugas secara mandiri di belakang layar sesuai jadwal.
              </p>
              
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => setActiveView('cron')}
                  className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${activeView === 'cron' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'}`}
                >
                  <Clock className="w-3.5 h-3.5" /> Dashboard Automasi
                </button>
              </div>
            </div>

            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Examples
              </h3>
              <div className="space-y-2">
                {[
                  'Cari info terbaru tentang AI',
                  'Jalankan tugas otomasi',
                  'Integrasikan dengan Slack',
                  'Call REST API',
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(example)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-purple-400 rounded-lg hover:bg-slate-800/40 transition-all"
                  >
                    → {example}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Settings & User */}
          <div className="p-4 border-t border-purple-500/20 space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 truncate">
              <User className="w-4 h-4 shrink-0" />
              <span className="truncate">{user?.email}</span>
            </div>
            <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-sm font-medium">
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden w-full">
          {/* Top Bar Header (Desktop & Mobile) */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900/40 backdrop-blur border-b border-purple-500/20">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800/40 border border-purple-500/20 md:hidden mr-1"
              >
                <Menu className="w-5 h-5" />
              </button>
              <Zap className="w-5 h-5 text-purple-400 font-semibold" />
              <span className="font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">AI Agent</span>
            </div>

            {/* Model Selector Dropdown */}
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-slate-400">Brain Model:</span>
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="bg-slate-800 border border-purple-500/30 text-purple-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-purple-500 transition-all font-medium cursor-pointer"
              >
                <option value="coordinator-agent">Kepala Agent (Multi-Agent Orchestrator)</option>
                <option value="gpt-4o">ChatGPT-4o (OpenAI - Sangat Pintar)</option>
                <option value="gpt-4o-mini">ChatGPT-4o Mini (OpenAI - Cepat)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Gratis & Cepat)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Sangat Pintar - Gratis)</option>
                <option value="groq-llama-3.3">Llama 3.3 70B (Groq - Gratis & Cepat)</option>
                <option value="groq-llama-3.1">Llama 3.1 8B (Groq - Instan & Cepat)</option>
                <option value="openrouter-llama-3">Llama 3 8B (Free via OpenRouter)</option>
                <option value="openrouter-deepseek-r1">DeepSeek R1 (Free via OpenRouter)</option>
              </select>
            </div>
          </div>

          {/* Main Content Area */}
          {activeView === 'cron' ? (
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-900/50">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                      <Clock className="w-6 h-6 text-emerald-400" />
                      Dashboard Automasi (Cron)
                    </h2>
                    <p className="text-slate-400 mt-2 text-sm">
                      Kelola jadwal agen AI untuk berjalan otomatis di latar belakang.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsCronModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Tambah Jadwal Baru
                  </button>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                  {scheduledTasks.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-8 h-8 text-slate-500" />
                      </div>
                      <h3 className="text-lg font-medium text-slate-300 mb-2">Belum Ada Tugas Otomatis</h3>
                      <p className="text-slate-500 text-sm">Tambahkan jadwal baru agar Mamet bisa bekerja selagi Anda tidur.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-800/80 border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                          <th className="p-4 font-medium">Tugas & Instruksi</th>
                          <th className="p-4 font-medium">Jadwal</th>
                          <th className="p-4 font-medium text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduledTasks.map(task => (
                          <tr key={task.id} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                            <td className="p-4">
                              <div className="font-medium text-purple-300 mb-1">{task.title}</div>
                              <div className="text-xs text-slate-400 line-clamp-2 max-w-lg">{task.prompt}</div>
                            </td>
                            <td className="p-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Setiap {task.interval_hours} Jam
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <button 
                                onClick={() => handleDeleteCron(task.id)}
                                className="p-2 text-red-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors border border-transparent hover:border-red-500/30"
                                title="Hapus Tugas"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center mb-6 shadow-2xl">
                  <Zap className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-bold mb-2">Selamat datang di AI Agent</h2>
                <p className="text-slate-400 max-w-md mb-8">
                  Pilih tools yang ingin digunakan, kemudian mulai percakapan. Agent akan memproses permintaan menggunakan kombinasi tools yang Anda aktifkan.
                </p>
                <div className="flex gap-2">
                  {selectedTools.map(tool => (
                    <div key={tool} className="flex items-center gap-2 px-3 py-1 bg-purple-500/20 rounded-full text-sm text-purple-300">
                      {toolIcons[tool]}
                      {tool.replace('_', ' ')}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}
                  >
                    <div
                      className={`max-w-[95%] md:max-w-xl ${
                        message.type === 'user'
                          ? 'bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl rounded-tr-sm'
                          : 'bg-slate-800/50 backdrop-blur rounded-2xl rounded-tl-sm border border-purple-500/30'
                      } px-3 md:px-5 py-2.5 md:py-3.5`}
                    >
                      {message.type === 'agent' && currentlyTypingId === message.id && !message.isStreaming
                        ? <TypewriterText text={message.content} onComplete={() => setCurrentlyTypingId(null)} />
                        : <MessageContent text={message.content || (message.isStreaming ? ' ▍' : '')} />
                      }
                      {message.response && (
                        <div className="mt-3 p-3 bg-slate-900/50 rounded-lg text-xs text-slate-300 border border-slate-700/50">
                          {message.response}
                        </div>
                      )}
                      {message.tools && message.tools.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {message.tools.map(tool => (
                            <span
                              key={tool}
                              className="text-xs px-2 py-1 bg-slate-700/50 rounded-full flex items-center gap-1"
                            >
                              {toolIcons[tool]}
                              {tool.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                      {message.groundingSources && message.groundingSources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-purple-500/10">
                          <p className="text-[10px] text-slate-400 font-semibold mb-1.5 uppercase tracking-wider">Sumber Referensi:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {message.groundingSources.map((source, index) => (
                              <a
                                key={index}
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/25 transition-all truncate max-w-xs inline-flex items-center gap-1"
                              >
                                <Zap className="w-2.5 h-2.5 shrink-0" />
                                {source.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {message.toolExecution && (
                        <div className="mt-3 p-3 bg-slate-900/80 rounded-lg text-[11px] border border-purple-500/20 font-mono">
                          <div className="flex items-center gap-1.5 text-purple-400 font-semibold mb-1.5">
                            <Code2 className="w-3.5 h-3.5" />
                            Eksekusi Tool: {message.toolExecution.name}
                          </div>
                          <div className="text-slate-300 bg-black/40 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {message.toolExecution.name === 'execute_javascript' && (
                              <>
                                <span className="text-slate-500">// Kode yang dijalankan:</span>
                                <pre className="text-blue-300 mt-1">{message.toolExecution.args.code}</pre>
                              </>
                            )}
                            {message.toolExecution.name === 'make_api_call' && (
                              <>
                                <span className="text-slate-500">// HTTP Request:</span>
                                <div className="text-green-300 mt-1">{message.toolExecution.args.method} {message.toolExecution.args.url}</div>
                                {message.toolExecution.args.body && (
                                  <pre className="text-yellow-300 mt-1 text-[10px]">{message.toolExecution.args.body}</pre>
                                )}
                              </>
                            )}
                            {message.toolExecution.name === 'post_to_slack' && (
                              <>
                                <span className="text-slate-500">// Kirim Slack:</span>
                                <div className="text-yellow-300 mt-1">{message.toolExecution.args.message}</div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {message.subagentRuns && message.subagentRuns.length > 0 && (
                        <div className="mt-4 space-y-3">
                          <div className="text-xs font-semibold text-purple-400 flex items-center gap-1">
                            <Zap className="w-3.5 h-3.5 animate-pulse text-purple-400" />
                            Alur Kerja Sub-Agent (Orchestration):
                          </div>
                          <div className="border-l-2 border-purple-500/30 pl-4 space-y-4">
                            {message.subagentRuns.map((run, idx) => (
                              <div key={idx} className="relative">
                                {/* Pip node */}
                                <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-purple-500 border border-slate-950 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                                
                                <div className="bg-slate-950/60 rounded-xl p-3 border border-purple-500/10 text-xs">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="font-bold text-blue-400 capitalize">
                                      🤖 Sub-Agent: {run.subagent}
                                    </span>
                                    <span className="text-[9px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded font-mono">
                                      SUCCESS
                                    </span>
                                  </div>
                                  <div className="text-slate-400 italic mb-1.5">
                                    Tugas: {run.task}
                                  </div>
                                  <div className="text-slate-200 bg-black/40 p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto font-sans leading-relaxed">
                                    {run.output}
                                  </div>
                                  
                                  {/* Grounding sources for the subagent if any */}
                                  {run.sources && run.sources.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-800/40">
                                      <div className="text-[10px] text-slate-400 mb-1">Referensi Web:</div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {run.sources.map((src, sIdx) => (
                                          <a
                                            key={sIdx}
                                            href={src.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-purple-300 hover:text-purple-100 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full transition-all truncate max-w-xs"
                                          >
                                            {src.title}
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Tool execution details for the subagent if any */}
                                  {run.toolExecution && (
                                    <div className="mt-2 pt-2 border-t border-slate-800/40 font-mono text-[9px] text-purple-400 flex items-center gap-1">
                                      <Code2 className="w-3 h-3" />
                                      Eksekusi Tool: {run.toolExecution.name}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="text-xs opacity-50 mt-2">
                        {message.timestamp.toLocaleTimeString('id-ID')}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-800/50 backdrop-blur rounded-3xl rounded-tl-lg border border-purple-500/30 px-5 py-4 max-w-sm w-full">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-100"></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-200"></div>
                        <span className="text-xs text-slate-400 ml-1">Agent is processing...</span>
                      </div>
                      <div className="font-mono text-[10px] text-purple-300 space-y-1 bg-slate-950/70 p-3 rounded-lg border border-purple-500/10 max-h-32 overflow-y-auto">
                        {logs.map((log, index) => (
                          <div key={index} className="flex items-center gap-1.5">
                            <span className="text-green-500 select-none">&gt;</span>
                            <span className="animate-in fade-in slide-in-from-left-2 duration-300">{log}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-purple-500/20 bg-slate-900/50 backdrop-blur-md p-4 md:p-6">
            
            {/* File attachment preview */}
            {attachedFile && (
              <div className="mb-3 flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-2 w-max animate-in fade-in slide-in-from-bottom-2">
                {attachedFile.type.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-purple-400" /> : <FileText className="w-4 h-4 text-purple-400" />}
                <span className="text-xs text-purple-200 truncate max-w-[200px]">{attachedFile.name}</span>
                <button onClick={() => setAttachedFile(null)} className="ml-2 text-slate-400 hover:text-red-400 p-0.5 rounded-full hover:bg-slate-800/50 transition-all">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex gap-2 md:gap-3 items-end">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.txt,.md,.csv,.docx,image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setAttachedFile(e.target.files[0]);
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="p-3.5 bg-slate-800/50 hover:bg-slate-700 border border-purple-500/30 rounded-xl text-slate-400 hover:text-purple-400 transition-all focus:outline-none disabled:opacity-50 h-[50px] flex items-center justify-center"
                title="Lampirkan Dokumen (PDF, TXT, DOCX)"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <div className="flex-1 relative">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ketik permintaan atau pertanyaan..."
                  className="w-full bg-slate-800/50 border border-purple-500/30 rounded-xl px-4 py-3.5 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all text-white placeholder-slate-500 h-[50px]"
                  disabled={loading}
                />
              </div>

              <button
                onClick={handleSendMessage}
                disabled={loading || (!input.trim() && !attachedFile)}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-slate-600 disabled:to-slate-600 text-white rounded-xl px-6 py-3 font-medium flex items-center gap-2 transition-all shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 disabled:shadow-none h-[50px]"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Active tools: {selectedTools.length > 0 ? selectedTools.join(', ') : 'none selected'}
            </p>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Cron Settings Modal */}
      {isCronModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-purple-500/20 flex justify-between items-center bg-slate-800/50">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                Tambah Jadwal Agen (Cron)
              </h2>
              <button onClick={() => setIsCronModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCronSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Judul Tugas</label>
                <input 
                  type="text" 
                  required
                  value={cronForm.title}
                  onChange={e => setCronForm({...cronForm, title: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Cth: Riset Harga Kripto Harian"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Instruksi Prompt</label>
                <textarea 
                  required
                  value={cronForm.prompt}
                  onChange={e => setCronForm({...cronForm, prompt: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 h-24 resize-none focus:outline-none focus:border-emerald-500"
                  placeholder="Ketik prompt lengkap di sini..."
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Jadwal Eksekusi</label>
                <select 
                  value={cronForm.interval_hours}
                  onChange={e => setCronForm({...cronForm, interval_hours: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value={1}>Setiap 1 Jam</option>
                  <option value={6}>Setiap 6 Jam</option>
                  <option value={12}>Setiap 12 Jam</option>
                  <option value={24}>Setiap 24 Jam (Harian)</option>
                  <option value={168}>Setiap 7 Hari (Mingguan)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsCronModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={cronLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {cronLoading ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}