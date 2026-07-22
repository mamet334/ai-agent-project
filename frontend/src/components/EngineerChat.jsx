import React, { useState, useEffect, useRef } from 'react';
import { Send, Terminal, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';

export default function EngineerChat({ userId }) {
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

  // Load chat history for ENGINEER workspace
  useEffect(() => {
    if (!userId) return;
    const fetchChat = async () => {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', userId)
        .eq('workspace_type', 'ENGINEER')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        setMessages(data[0].messages || []);
      }
    };
    fetchChat();
  }, [userId]);

  const saveToDb = async (newMessages) => {
    if (!userId) return;
    try {
      // Find existing chat
      const { data: existing } = await supabase
        .from('chats')
        .select('id')
        .eq('user_id', userId)
        .eq('workspace_type', 'ENGINEER')
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('chats')
          .update({ messages: newMessages, updated_at: new Date().toISOString() })
          .eq('id', existing[0].id);
      } else {
        await supabase
          .from('chats')
          .insert([{
            user_id: userId,
            title: 'Engineer Workspace Chat',
            messages: newMessages,
            workspace_type: 'ENGINEER',
            workspace_id: null,
            updated_at: new Date().toISOString()
          }]);
      }
    } catch (err) {
      console.error("Failed to save engineer chat:", err);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !userId) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);
    await saveToDb(newMessages);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const endpoint = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process';

      const payload = {
        message: userMsg,
        mode: 'ENGINEER',
        workspaceTarget: 'ENGINEER',
        tools: ['web_search', 'code_executor', 'api_caller'],
        history: newMessages.slice(-10),
        auditMode: 'FULL',
        localWorkspaceEnabled: false,
        desktopOSMode: false
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read response
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let aiResponseText = '';

      // Create initial AI message
      setMessages(prev => [...prev, { role: 'model', content: '' }]);

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6).trim();
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  aiResponseText += parsed.text;
                  setMessages(prev => {
                    const next = [...prev];
                    next[next.length - 1].content = aiResponseText;
                    return next;
                  });
                }
              } catch (err) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }

      // Final save
      const finalMessages = [...newMessages, { role: 'model', content: aiResponseText }];
      await saveToDb(finalMessages);

    } catch (err) {
      console.error("Chat error:", err);
      const errorMessages = [...newMessages, { role: 'model', content: `⚠️ Error: ${err.message}` }];
      setMessages(errorMessages);
      await saveToDb(errorMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = async () => {
    if (confirm('Clear Engineer Chat History?')) {
      setMessages([]);
      await saveToDb([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <h3 className="font-semibold text-slate-200">Engineer Console</h3>
        </div>
        <button onClick={clearChat} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors" title="Clear Chat">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center px-4">
            <Terminal className="w-8 h-8 mb-3 opacity-50" />
            <p className="text-sm">Engineer Workspace terisolasi.<br/>Konteks tidak akan bocor ke User.</p>
          </div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap font-sans ${m.role === 'user' ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 text-emerald-400 px-4 py-2.5 rounded-xl border border-slate-700 text-xs flex items-center gap-2 font-mono">
              <RefreshCw className="w-3 h-3 animate-spin" /> Processing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-800 bg-slate-950">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Command / Chat Engineer..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
