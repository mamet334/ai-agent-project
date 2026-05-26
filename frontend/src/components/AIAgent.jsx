import React, { useState, useRef, useEffect } from 'react';
import { Send, Code2, Zap, GitBranch, MessageCircle, Settings, Plus, Menu, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const renderMessageContent = (text) => {
  if (!text) return null;

  const lines = text.split('\n');

  return (
    <div className="space-y-1">
      {lines.map((line, index) => {
        let processedLine = line;

        // Convert bold markdown **bold** to <strong>bold</strong>
        const boldRegex = /\*\*(.*?)\*\*/g;
        processedLine = processedLine.replace(boldRegex, '<strong>$1</strong>');

        // Check if it's a bullet point: starting with "* " or "- "
        const isBullet = processedLine.trim().startsWith('* ') || processedLine.trim().startsWith('- ');
        if (isBullet) {
          const content = processedLine.trim().replace(/^[\*\-]\s+/, '');
          return (
            <ul key={index} className="list-disc pl-5 my-0.5">
              <li 
                className="text-sm leading-relaxed" 
                dangerouslySetInnerHTML={{ __html: content }} 
              />
            </ul>
          );
        }

        // Check if it's a numbered list item
        const numberedRegex = /^(\d+)\.\s+(.*)/;
        if (numberedRegex.test(processedLine.trim())) {
          const match = processedLine.trim().match(numberedRegex);
          const num = match[1];
          const content = match[2];
          return (
            <ol key={index} className="list-decimal pl-5 my-0.5" start={num}>
              <li 
                className="text-sm leading-relaxed" 
                dangerouslySetInnerHTML={{ __html: content }} 
              />
            </ol>
          );
        }

        // Empty lines
        if (processedLine.trim() === '') {
          return <div key={index} className="h-2" />;
        }

        // Standard paragraph
        return (
          <p 
            key={index} 
            className="text-sm leading-relaxed mb-0.5" 
            dangerouslySetInnerHTML={{ __html: processedLine }} 
          />
        );
      })}
    </div>
  );
};

export default function AIAgent() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState(['web_search', 'code_executor', 'api_caller']);
  const [selectedTools, setSelectedTools] = useState(['web_search']);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toolIcons = {
    web_search: <Zap className="w-4 h-4" />,
    code_executor: <Code2 className="w-4 h-4" />,
    api_caller: <GitBranch className="w-4 h-4" />,
    slack_integration: <MessageCircle className="w-4 h-4" />,
  };

  const toolDescriptions = {
    web_search: 'Search & research web content',
    code_executor: 'Execute & analyze code',
    api_caller: 'Call & integrate APIs',
    slack_integration: 'Send Slack messages & get updates',
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/agent/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: currentInput,
          tools: selectedTools,
          userId: 'user-123'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server responded with an error');
      }

      const data = await response.json();

      const agentMessage = {
        id: Date.now() + 1,
        type: 'agent',
        content: data.message,
        tools: data.toolsUsed || [],
        timestamp: new Date(data.timestamp || Date.now()),
      };

      setMessages(prev => [...prev, agentMessage]);
    } catch (error) {
      console.error('Error contacting backend:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'agent',
        content: `Error: Gagal memproses permintaan. ${error.message}. Pastikan server backend Anda berjalan.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
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

  const availableTools = ['web_search', 'code_executor', 'api_caller', 'slack_integration'];

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

          {/* Tools Selection */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4">
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

          {/* Settings */}
          <div className="p-4 border-t border-purple-500/20">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-700/50 text-slate-300 transition-all text-sm">
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden w-full">
          {/* Mobile Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-900/30 border-b border-purple-500/20 md:hidden">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              <span className="font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">AI Agent</span>
            </div>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800/40 border border-purple-500/20"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

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
                      className={`max-w-[85%] md:max-w-2xl ${
                        message.type === 'user'
                          ? 'bg-gradient-to-r from-purple-600 to-blue-600 rounded-3xl rounded-tr-lg'
                          : 'bg-slate-800/50 backdrop-blur rounded-3xl rounded-tl-lg border border-purple-500/30'
                      } px-4 md:px-6 py-3 md:py-4`}
                    >
                      {renderMessageContent(message.content)}
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
                      <div className="text-xs opacity-50 mt-2">
                        {message.timestamp.toLocaleTimeString('id-ID')}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-800/50 backdrop-blur rounded-3xl rounded-tl-lg border border-purple-500/30 px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-100"></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce delay-200"></div>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">Processing...</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-purple-500/20 bg-slate-900/50 backdrop-blur-md p-6">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ketik permintaan Anda di sini..."
                className="flex-1 bg-slate-800/50 border border-purple-500/30 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all text-white placeholder-slate-500"
                disabled={loading}
              />
              <button
                onClick={handleSendMessage}
                disabled={loading || !input.trim()}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-slate-600 disabled:to-slate-600 text-white rounded-xl px-6 py-3 font-medium flex items-center gap-2 transition-all shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 disabled:shadow-none"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Active tools: {selectedTools.length > 0 ? selectedTools.join(', ') : 'none selected'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}