import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../supabase';
import MainOrchestrator from '../../lib/mainOrchestrator';
import { BrainCircuit } from 'lucide-react';
import { kernel } from '../../core/runtime/Kernel';

// Komponen-komponen baru yang sudah dipecah
import Sidebar from '../layout/Sidebar';
import ChatHeader from '../chat/ChatHeader';
import ChatMessages from '../chat/ChatMessages';
import ChatInput from '../chat/ChatInput';

// --- PERBAIKAN: Tambahkan WorkspaceProvider ---
import { WorkspaceProvider } from '../../core/workspace/WorkspaceContext';

export default function AIAgent() {
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // --- ORCHESTRATOR & STATE DARI LAMA ---
  const [orchestrator] = useState(() => new MainOrchestrator());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [attachedFile, setAttachedFile] = useState(null);
  const [workspaceHandle, setWorkspaceHandle] = useState(null);
  const [desktopWorkspacePath, setDesktopWorkspacePath] = useState(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const thinkingStartRef = useRef(null);
  const [user, setUser] = useState(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [conversations, setConversations] = useState([{ id: 'default', title: 'Percakapan Baru', messages: [], updated_at: new Date().toISOString() }]);
  const [currentConversationId, setCurrentConversationId] = useState('default');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalMemory, setGlobalMemory] = useState('');
  const [selectedTools, setSelectedTools] = useState([]);
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // --- STATE AGEN & PANEL RIWAYAT ---
  const [activeAgent, setActiveAgent] = useState('assistant');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Deteksi ukuran layar untuk responsivitas
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false); // tutup drawer saat resize ke desktop
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // --- LOGIN/AUTH CHECK ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- FETCH CHATS ---
  useEffect(() => {
    if (!user) return;
    const fetchChats = async () => {
      const { data, error } = await supabase.from('chats').select('*').order('updated_at', { ascending: false });
      
      // --- PERBAIKAN BARU 2: PASTIKAN CHAT LAMA DIISI DEFAULT AGENT ---
      const processedData = data?.map(chat => ({
        ...chat,
        agentType: chat.agentType || 'assistant' // Jika data lama belum punya agentType, isi default 'assistant'
      })) || [];

      if (processedData.length > 0) setConversations(processedData);
    };
    fetchChats();
  }, [user]);

  // --- PERBAIKAN BARU 3: LOGIKA SWITCH AGEN & TOGGLE RIWAYAT ---
  const handleSwitchAgent = (agent) => {
    setActiveAgent(agent);
    setIsHistoryOpen(false); // Tutup panel riwayat saat pindah agen
  };

  const toggleHistory = () => {
    setIsHistoryOpen(!isHistoryOpen); // Buka/tutup panel riwayat dengan tombol ☰
  };
  // --------------------------------------------------------------

  // --- LOGIKA PENGIRIMAN PESAN ---
  const handleSendMessage = async () => {
    if (!input.trim() && !attachedFile) return;
    const messageText = input.trim();
    setInput('');
    setLoading(true);
    thinkingStartRef.current = Date.now();
    setLogs(['🔍 Memulai proses...']);
    
    // Tambahkan pesan user ke conversation
    const userMsg = { id: Date.now(), type: 'user', role: 'user', content: messageText, timestamp: new Date() };
    setConversations(prev => prev.map(c => {
      if (c.id !== currentConversationId) return c;
      return { ...c, messages: [...(c.messages || []), userMsg] };
    }));

    try {
      // Ambil konfigurasi AI dari Kernel services (yang diisi via Settings UI)
      const brainService = kernel.serviceManager?.get('BrainService');
      const vaultService = kernel.serviceManager?.get('VaultService');
      
      const brainConfig = brainService?.getBrainConfig() || {};
      const provider = brainConfig.provider || 'openrouter';
      const model = brainConfig.model || 'anthropic/claude-3.5-sonnet';
      const apiKey = vaultService?.getKey(provider) || '';

      // Bangun history dari messages sebelumnya
      const activeConv = conversations.find(c => c.id === currentConversationId);
      const history = (activeConv?.messages || [])
        .filter(m => m.content)
        .map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }))
        .slice(-20); // Ambil 20 pesan terakhir

      setLogs(prev => [...prev, `🤖 Mengirim ke ${provider} (${model})...`]);

      const endpoint = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          provider,
          model,
          apiKey,
          history,
          userId: user?.id || 'guest',
          userName: user?.user_metadata?.name || user?.email || 'User',
          globalMemory
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const agentMsg = {
        id: Date.now() + 1,
        type: 'agent',
        role: 'assistant',
        content: data.message || 'Tidak ada respons.',
        timestamp: new Date()
      };

      setConversations(prev => prev.map(c => {
        if (c.id !== currentConversationId) return c;
        return { ...c, messages: [...(c.messages || []), agentMsg] };
      }));
      setLogs(prev => [...prev, '✅ Selesai.']);

    } catch (err) {
      console.error('[AIAgent] handleSendMessage error:', err);
      const errMsg = err.message || 'Terjadi kesalahan tidak diketahui.';
      setLogs(prev => [...prev, `❌ Error: ${errMsg}`]);
      
      const errAgentMsg = {
        id: Date.now() + 2,
        type: 'agent',
        role: 'assistant',
        content: `⚠️ **Koneksi AI Gagal**\n\n${errMsg}\n\n**Cek:**\n- Pastikan API Key sudah diisi di Settings → API Key lalu klik Save\n- Pastikan model yang dipilih valid (contoh: \`openai/gpt-4o-mini\` untuk OpenRouter)\n- Pastikan backend server berjalan`,
        timestamp: new Date()
      };
      setConversations(prev => prev.map(c => {
        if (c.id !== currentConversationId) return c;
        return { ...c, messages: [...(c.messages || []), errAgentMsg] };
      }));
    } finally {
      setLoading(false);
    }
  };


  // --- STATE MESSAGES & FUNGSI NAVIGASI ---
  // --- PERBAIKAN BARU 4: FILTER RIWAYAT CHAT AGAR TIDAK TERCAMPUR ---
  const activeConversation = conversations.find(c => c.id === currentConversationId) || conversations[0];
  // Gunakan filteredConversations saat mengoper data ke Sidebar untuk menu riwayat
  const filteredConversations = conversations.filter(c => c.agentType === activeAgent);
  // ----------------------------------------------------------------
  const messages = activeConversation.messages;

  const handleNewChat = () => {
    const newId = generateUUID();
    // --- PERBAIKAN BARU 5: TANDAI CHAT BARU DENGAN AGEN YANG SEDANG AKTIF ---
    setConversations(prev => [
      { 
        id: newId, 
        title: 'Percakapan Baru', 
        messages: [], 
        updated_at: new Date().toISOString(),
        agentType: activeAgent // Penting: Simpan jenis agennya!
      }, 
      ...prev
    ]);
    // ----------------------------------------------------------------------
    setCurrentConversationId(newId);
  };

  const handleSelectChat = (id) => {
    setCurrentConversationId(id);
  };

  const handleDeleteChat = (id) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) setCurrentConversationId('default');
  };

  const startResizing = (e) => {
    const container = document.getElementById('mamet-workspace-container');
    if (!container) return;
    const startY = e.clientY;
    const currentHeight = parseInt(container.style.getPropertyValue('--input-height') || '20px', 10);
    const onPointerMove = (moveEvent) => {
      const deltaY = startY - moveEvent.clientY;
      let newHeight = Math.max(20, Math.min(400, currentHeight + deltaY));
      container.style.setProperty('--input-height', `${newHeight}px`);
    };
    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  const resetWidth = () => {
    const container = document.getElementById('mamet-workspace-container');
    if (container) container.style.setProperty('--input-height', '20px');
  };

  const handleSelectWorkspace = async () => {
    if (workspaceHandle || desktopWorkspacePath) {
      setWorkspaceHandle(null);
      setDesktopWorkspacePath(null);
      return;
    }
    try {
      if (window.electronAPI) {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) setDesktopWorkspacePath(folderPath);
      } else {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        setWorkspaceHandle(handle);
      }
    } catch (e) { console.log('Batal memilih workspace'); }
  };

  // --- RENDER LAYOUT RESPONSIVE ---
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200">
      <div
        id="mamet-workspace-container"
        className="relative flex h-screen overflow-hidden"
        style={{ '--left-width': '288px', '--right-width': '260px' }}
      >
        <WorkspaceProvider>

          {/* ── SIDEBAR CHAT ── */}
          {/* Collapsible di semua ukuran: toggle via tombol ☰ di ChatHeader */}
          <Sidebar
            user={user}
            conversations={filteredConversations}
            currentConversationId={currentConversationId}
            onNewChat={handleNewChat}
            onSelectChat={(id) => { handleSelectChat(id); setSidebarOpen(false); }}
            onDeleteChat={handleDeleteChat}
            onToggleDeveloperMode={() => setIsDeveloperMode(!isDeveloperMode)}
            isDeveloperMode={isDeveloperMode}
            onOpenSettings={() => {}}
            isMobile={isMobile}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onSwitchAgent={handleSwitchAgent}
            activeAgent={activeAgent}
            onToggleHistory={toggleHistory}
          />

          {/* ── MAIN CHAT AREA ── */}
          <div className="flex-1 flex flex-col overflow-hidden w-full relative min-w-0">

            {/* Header — tombol ☰ membuka/menutup sidebar riwayat di semua perangkat */}
            <ChatHeader
              activeAgent={activeAgent}
              onToggleHistory={() => setSidebarOpen(prev => !prev)}
              onNewChat={handleNewChat}
              workspaceId={activeAgent === 'engineer' ? 'ws-engineer' : 'ws-assistant'}
            />

            {/* Messages */}
            <ChatMessages
              messages={messages}
              loading={loading}
              logs={logs}
              currentlyTypingId={null}
              workspaceHandle={workspaceHandle}
              messagesEndRef={messagesEndRef}
              onOpenInspector={() => {}}
            />

            {/* Input */}
            <ChatInput
              input={input}
              setInput={setInput}
              handleSend={handleSendMessage}
              loading={loading}
              attachedFile={attachedFile}
              setAttachedFile={setAttachedFile}
              fileInputRef={fileInputRef}
              handleSelectWorkspace={handleSelectWorkspace}
              workspaceHandle={workspaceHandle}
              desktopWorkspacePath={desktopWorkspacePath}
              selectedTools={selectedTools}
              onStartResize={isMobile ? null : startResizing}
              onResetWidth={isMobile ? null : resetWidth}
              isDesktopMode={!!window.electronAPI}
            />
          </div>

          {/* ── RIGHT INSPECTOR PANEL ── hanya di layar xl+ (≥1280px) */}
          <div className="hidden xl:flex w-[260px] shrink-0 bg-[#0A0A0A] border-l border-white/5 flex-col overflow-hidden z-30 font-sans text-slate-300">
            <div className="h-14 px-4 border-b border-white/5 flex items-center bg-[#0A0A0A] shrink-0">
              <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Inspector</h2>
            </div>
            <div className="flex-1 overflow-y-auto bg-[#0A0A0A] flex flex-col items-center justify-center text-slate-500">
              <p className="text-[11px] text-center px-4">Panel Inspector<br/>tersedia di desktop.</p>
            </div>
          </div>

        </WorkspaceProvider>
      </div>
    </div>
  );
}