import React, { useState, useEffect, useRef } from 'react';
import { Search, Upload, Send, User, Bot, Loader2, LogOut, Globe, BookOpen, Lock, Plus, MessageSquare, Trash2, Copy, Check } from 'lucide-react';
import { supabase } from './lib/supabase';
import { callAgentSimple, parseSSEStream } from './lib/callAgentSimple';

// Custom lightweight Markdown parser to avoid React 19 crashes with react-markdown
const parseMarkdown = (text) => {
  if (!text) return { __html: '' };
  
  // Normalize HTML-escaped tags
  let normalizedText = text
    .replace(/(?:&lt;|<)think(?:&gt;|>)/gi, '<think>')
    .replace(/(?:&lt;|<)\/think(?:&gt;|>)/gi, '</think>');
  
  // Handle case where text starts with "think " or "think\n" without angle brackets
  if (normalizedText.trim().toLowerCase().startsWith('think ') || normalizedText.trim().toLowerCase().startsWith('think\n')) {
    const idx = normalizedText.toLowerCase().indexOf('think');
    normalizedText = normalizedText.slice(0, idx) + '<think>' + normalizedText.slice(idx + 5);
  }
  
  // If think tag is opened but never closed, try to find a natural split point
  if (normalizedText.includes('<think>') && !normalizedText.includes('</think>')) {
    let splitIdx = normalizedText.indexOf('\n\n');
    if (splitIdx === -1) {
      const greetingMatch = normalizedText.match(/(?:\bhalo\b|\bhai\b|\bhi\b|selamat pagi|selamat siang|selamat sore|selamat malam|assalamualaikum)/i);
      if (greetingMatch && greetingMatch.index > 10) {
        splitIdx = greetingMatch.index;
      }
    }
    
    if (splitIdx !== -1) {
      normalizedText = normalizedText.slice(0, splitIdx) + '</think>\n\n' + normalizedText.slice(splitIdx);
    }
  }
  
  let html = normalizedText
    // Parse <think> tags first (even if unclosed during streaming)
    .replace(/<think>([\s\S]*?)(?:<\/think>|$)/g, '<div class="text-xs text-slate-500 italic border-l-2 border-slate-700 pl-3 my-2 py-1">$1</div>')
    // Escape remaining HTML to prevent XSS (but don't escape our injected divs)
    .replace(/<(?!div|\/div|img|a|\/a|strong|\/strong|em|\/em|br\/?)([^>]+)>/g, '&lt;$1&gt;')
    // Parse Images: ![alt](url)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-xs rounded-lg mt-2 mb-2 shadow-sm" />')
    // Parse Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">$1</a>')
    // Parse Bold: **text**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Parse Italic: *text*
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Parse Newlines
    .replace(/\n/g, '<br/>');
    
  return { __html: html };
};

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="text-slate-400 hover:text-emerald-400 transition-colors p-1.5 rounded hover:bg-slate-700/80 cursor-pointer flex items-center justify-center" title="Salin Jawaban AI">
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(true);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [activeModes, setActiveModes] = useState({ rag: true, websearch: false, research: false });

  // Chat History State
  const [conversations, setConversations] = useState(() => {
    const saved = localStorage.getItem('mametlite_conversations');
    if (saved) return JSON.parse(saved);
    return [{ id: 1, title: 'Percakapan Baru', messages: [{ role: 'assistant', content: 'Halo! Saya **Mamet Lite**. Anda bisa mencari data di database internal (RAG), atau mengaktifkan fitur pencarian Web di bawah.' }] }];
  });
  const [currentConvId, setCurrentConvId] = useState(() => conversations[0]?.id || 1);

  const currentConversation = conversations.find(c => c.id === currentConvId) || conversations[0];
  const messages = currentConversation?.messages || [];

  useEffect(() => {
    localStorage.setItem('mametlite_conversations', JSON.stringify(conversations));
  }, [conversations]);

  const updateMessages = (updater) => {
    setConversations(prev => prev.map(c => {
      if (c.id === currentConvId) {
        const updatedMsgs = typeof updater === 'function' ? updater(c.messages) : updater;
        let newTitle = c.title;
        // Auto-generate title based on first user message
        if (c.title === 'Percakapan Baru' && updatedMsgs.length > 1 && updatedMsgs[1].role === 'user') {
          newTitle = updatedMsgs[1].content.substring(0, 25) + '...';
        }
        return { ...c, title: newTitle, messages: updatedMsgs };
      }
      return c;
    }));
  };

  const toggleMode = (mode) => {
    setActiveModes(prev => ({ ...prev, [mode]: !prev[mode] }));
  };

  const handleNewChat = () => {
    const newId = Date.now();
    const newConv = { id: newId, title: 'Percakapan Baru', messages: [{ role: 'assistant', content: 'Halo! Saya **Mamet Lite**. Anda bisa mencari data di database internal (RAG), atau mengaktifkan fitur pencarian Web di bawah.' }] };
    setConversations(prev => [newConv, ...prev]);
    setCurrentConvId(newId);
  };

  const handleDeleteChat = (e, id) => {
    e.stopPropagation();
    const filtered = conversations.filter(c => c.id !== id);
    if (filtered.length === 0) {
      const newId = Date.now();
      setConversations([{ id: newId, title: 'Percakapan Baru', messages: [{ role: 'assistant', content: 'Halo! Saya **Mamet Lite**.' }] }]);
      setCurrentConvId(newId);
    } else {
      setConversations(filtered);
      if (currentConvId === id) setCurrentConvId(filtered[0].id);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchDocuments(session.user.id);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchDocuments(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchDocuments = async (userId) => {
    const { data, error } = await supabase.from('documents').select('id, title').eq('user_id', userId).order('created_at', { ascending: false });
    if (!error && data) {
      setDocuments(data);
    }
  };

  const handleDeleteDocument = async (id) => {
    const confirmDelete = window.confirm('Apakah Anda yakin ingin menghapus dokumen RAG ini? Otak AI akan melupakan isinya.');
    if (!confirmDelete) return;

    try {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      setDocuments(prev => prev.filter(doc => doc.id !== id));
    } catch (err) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const fileInputRef = useRef(null);
  
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Filter dokumen ganda / Update dokumen
    const existingDoc = documents.find(doc => doc.title === file.name);
    if (existingDoc) {
      const confirmUpdate = window.confirm(`Dokumen bernama "${file.name}" sudah ada. Apakah Anda ingin menimpanya (memperbarui data)?`);
      if (!confirmUpdate) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      // Jika setuju menimpa, hapus diam-diam dari Supabase dulu
      await supabase.from('documents').delete().eq('id', existingDoc.id);
      setDocuments(prev => prev.filter(doc => doc.id !== existingDoc.id));
    }

    setIsUploading(true);
    
    // Memberikan waktu singkat agar browser (React) merender animasi putaran (spinner) sebelum memproses file berat
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      let extractedText = '';
      if (file.name.endsWith('.txt')) {
        extractedText = await file.text();
      } else {
        extractedText = await file.text(); 
      }

      const { error } = await supabase.functions.invoke('rag-process', {
        body: { title: file.name, text: extractedText, userId: session.user.id }
      });

      if (error) throw new Error(error.message);
      
      setDocuments(prev => [{ id: Date.now(), title: file.name }, ...prev]); // Optimistic update, exact ID doesn't matter much until refresh
      fetchDocuments(session.user.id); // Refresh to get real ID

    } catch (err) {
      alert(`Gagal mengunggah: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', content: input };
    updateMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      // Build tools array HANYA berdasarkan tombol yang aktif
      let tools = [];
      
      // RAG Search - jika tombol RAG aktif
      if (activeModes.rag) {
        tools.push('rag_search');
      }
      
      // Web Search - HANYA jika tombol Web Search aktif
      if (activeModes.websearch) {
        tools.push('web_search');
      }
      
      // Deep Research - HANYA jika tombol Research aktif
      if (activeModes.research) {
        tools.push('deep_research');
      }

      // Fallback: jika semua tombol OFF, gunakan default RAG + Web Search
      if (tools.length === 0) {
        tools = ['rag_search', 'web_search'];
      }

      // Build chat history untuk context
      const chatHistory = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      // Kumpulkan BYOK keys dari localStorage
      const byokKeys = {
        'x-byok-gemini': localStorage.getItem('x-byok-gemini') || '',
        'x-byok-groq': localStorage.getItem('x-byok-groq') || '',
        'x-byok-openai': localStorage.getItem('x-byok-openai') || '',
        'x-byok-openrouter': localStorage.getItem('x-byok-openrouter') || ''
      };

      // Panggil agent backend dengan fungsi simple
      const response = await callAgentSimple(
        currentInput,
        tools,
        session.user.id,
        (session?.user?.email || 'user').split('@')[0],
        chatHistory,
        activeModes.rag,
        byokKeys
      );

      // Tambah placeholder untuk assistant message
      updateMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      // Parse SSE stream dan update message secara real-time
      const contentType = response.headers.get('Content-Type') || '';
      
      if (contentType.includes('text/event-stream')) {
        // Stream SSE
        await parseSSEStream(response, (chunk, fullContent) => {
          updateMessages(prev => {
            const newArr = [...prev];
            newArr[newArr.length - 1].content = fullContent;
            return newArr;
          });
        });
      } else if (contentType.includes('application/json')) {
        // Fallback ke JSON response
        const data = await response.json();
        const textContent = data.content || data.text || data.message || JSON.stringify(data);
        updateMessages(prev => {
          const newArr = [...prev];
          newArr[newArr.length - 1].content = textContent;
          return newArr;
        });
      } else {
        throw new Error('Unexpected response format');
      }
    } catch(err) {
      updateMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <div className="h-screen bg-slate-900 flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;

  if (!session) {
    return (
      <div className="flex h-screen bg-slate-900 text-slate-200 items-center justify-center">
        <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-xl">
          <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-2xl mb-8">
            <Search className="w-8 h-8" /> Mamet Lite
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Email ASN / Admin</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 focus:outline-none" />
            </div>
            <button type="submit" disabled={authLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 mt-4 transition-all">
              <Lock className="w-4 h-4" /> Masuk ke Sistem
            </button>
          </form>
          <div className="mt-8 text-center text-xs text-slate-500">Created by <span className="font-semibold text-slate-400">mametdev@tm</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200">
      
      {/* Sidebar */}
      <div className="w-80 bg-slate-800 border-r border-slate-700 p-4 flex flex-col">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xl">
            <Search className="w-6 h-6" /> Mamet Lite
          </div>
        </div>

        <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept=".pdf,.txt,.docx" />
        <button 
          onClick={handleUploadClick} 
          disabled={isUploading}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shrink-0"
        >
          {isUploading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Memproses AI...</>
          ) : (
            <><Upload className="w-5 h-5" /> Unggah Dokumen (RAG)</>
          )}
        </button>

        {/* RAG Documents List */}
        {documents.length > 0 && (
          <div className="mt-4 shrink-0">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Dokumen Aktif</h3>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
              {documents.map((doc) => (
                <div key={doc.id} className="group text-[11px] text-slate-300 bg-slate-700/50 px-2 py-1.5 rounded flex items-center justify-between border border-slate-600/50 hover:bg-slate-700 transition-colors">
                  <div className="flex items-center gap-2 truncate">
                    <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span className="truncate">{doc.title}</span>
                  </div>
                  <button onClick={() => handleDeleteDocument(doc.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 transition-opacity shrink-0">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex-1 flex flex-col min-h-0">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 shrink-0">Riwayat Percakapan</h3>
          <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
            {conversations.map(conv => (
              <div 
                key={conv.id} 
                onClick={() => setCurrentConvId(conv.id)}
                className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${currentConvId === conv.id ? 'bg-slate-700 text-emerald-400' : 'hover:bg-slate-700/50 text-slate-300'}`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="text-sm truncate">{conv.title}</span>
                </div>
                <button onClick={(e) => handleDeleteChat(e, conv.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Token stats dihapus - menggunakan callAgentSimple tanpa optimization */}

        <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-2 truncate">
            <User className="w-4 h-4" />
            <span className="truncate">{session.user.email}</span>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-slate-700 text-slate-400 hover:text-red-400 rounded-lg transition-all" title="Keluar">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 text-center text-[10px] text-slate-500 shrink-0">Created by <span className="font-semibold text-slate-400">mametdev@tm</span></div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <div className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-slate-300">Pusat Riset ASN</h2>
            <button onClick={handleNewChat} className="flex items-center gap-1 text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 border border-slate-700 rounded-md transition-all">
              <Plus className="w-3 h-3" /> Percakapan Baru
            </button>
          </div>
          
          <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button onClick={() => toggleMode('rag')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeModes.rag ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
              <BookOpen className="w-4 h-4" /> Database RAG
            </button>
            <button onClick={() => toggleMode('websearch')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeModes.websearch ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
              <Globe className="w-4 h-4" /> Web Search
            </button>
            <button onClick={() => toggleMode('research')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeModes.research ? 'bg-purple-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
              <Search className="w-4 h-4" /> Deep Research
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-indigo-500' : 'bg-emerald-600'}`}>
                {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
              </div>
              <div className={`p-4 rounded-2xl max-w-[80%] overflow-x-auto relative group ${msg.role === 'user' ? 'bg-indigo-600/20 text-indigo-100 rounded-tr-none border border-indigo-500/30' : 'bg-slate-800 rounded-tl-none border border-slate-700'}`}>
                {msg.role === 'assistant' && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 rounded border border-slate-600 shadow-sm z-10">
                    <CopyButton text={msg.content} />
                  </div>
                )}
                <div className={`text-sm leading-relaxed ${msg.role === 'assistant' ? 'mt-4' : ''}`} dangerouslySetInnerHTML={parseMarkdown(msg.content)} />
              </div>
            </div>
          ))}
          {loading && (
             <div className="flex gap-4 max-w-4xl mx-auto">
               <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                 <Loader2 className="w-5 h-5 text-white animate-spin" />
               </div>
               <div className="p-4 rounded-2xl bg-slate-800 rounded-tl-none border border-slate-700 flex items-center">
                 <span className="text-slate-400 text-sm animate-pulse">Sedang mencari data...</span>
               </div>
             </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
          <div className="max-w-4xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={activeModes.rag && !activeModes.websearch && !activeModes.research ? "Cari informasi di dokumen yang diunggah..." : "Cari dokumen atau riset web..."}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl py-4 pl-4 pr-14 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-slate-200 placeholder-slate-500 shadow-inner"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg flex items-center justify-center transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
