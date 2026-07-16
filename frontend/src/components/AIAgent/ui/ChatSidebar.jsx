/**
 * ChatSidebar.jsx
 *
 * Sidebar kiri: daftar percakapan, tools, memori, cron, developer menu, user settings.
 * Diekstrak dari AIAgent.jsx (baris 903-1336).
 *
 * Props:
 *   - user: Supabase User object
 *   - sidebarOpen: boolean (mobile)
 *   - setSidebarOpen: React setState function
 *   - conversations: Conversation[]
 *   - currentConversationId: string
 *   - setCurrentConversationId: React setState function
 *   - onNewChat: () => void
 *   - onDeleteConversation: (id) => void
 *   - ragEnabled: boolean
 *   - setRagEnabled: React setState function
 *   - globalMemory: string
 *   - setGlobalMemory: React setState function
 *   - selectedTools: string[]
 *   - availableTools: string[]
 *   - toolIcons: Record<string, JSX.Element>
 *   - toolDescriptions: Record<string, string>
 *   - onToggleTool: (tool) => void
 *   - scheduledTasks: Task[]
 *   - isDeveloperMode: boolean
 *   - setIsDeveloperMode: React setState function
 *   - activeView: string
 *   - setActiveView: React setState function
 *   - updateStatus: object | null
 *   - onOpenRagModal: () => void
 *   - onOpenSettings: () => void
 *   - onOpenCronModal: () => void
 *   - onSignOut: () => void
 *
 * DEBUG POINTS:
 *   - conversations.filter: pastikan conversation dengan title '[AUTO]' tidak
 *     muncul di section utama
 *   - selectedTools: state tools aktif — jika tidak tersimpan cek localStorage
 *   - globalMemory: pastikan onChange di-debounce jika boros re-render
 */
import React from 'react';
import {
  Zap, Plus, BrainCircuit, MessageCircle, Clock, Activity, Download,
  DollarSign, ShoppingBag, Briefcase, Terminal, Settings, User, LogOut, X
} from 'lucide-react';

export default function ChatSidebar({
  user,
  sidebarOpen,
  setSidebarOpen,
  conversations,
  currentConversationId,
  setCurrentConversationId,
  onNewChat,
  onDeleteConversation,
  ragEnabled,
  setRagEnabled,
  globalMemory,
  setGlobalMemory,
  selectedTools,
  availableTools,
  toolIcons,
  toolDescriptions,
  onToggleTool,
  isDeveloperMode,
  setIsDeveloperMode,
  activeView,
  setActiveView,
  updateStatus,
  onOpenRagModal,
  onOpenSettings,
  onSignOut
}) {
  const navBtn = (view, label, icon, colorClass = 'blue') => {
    const activeMap = {
      blue: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
      emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
      orange: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
      purple: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
      indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50',
    };
    return (
      <button
        onClick={() => setActiveView(view)}
        className={`w-full py-2 border rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
          activeView === view
            ? activeMap[colorClass] || activeMap.blue
            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-600 hover:text-white'
        }`}
      >
        {icon} {label}
      </button>
    );
  };

  return (
    <div className={`
      fixed inset-y-0 left-0 z-50 w-[280px] md:w-[var(--left-width)] shrink-0
      bg-[#0A0A0A] border-r border-white/5 flex flex-col overflow-hidden
      transition-transform duration-300 ease-in-out
      md:relative md:translate-x-0 md:bg-[#0A0A0A] md:z-auto
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>

      {/* ── Header ── */}
      <div className="p-6 border-b border-purple-500/20 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-slate-800/80 border border-white/10 rounded-lg flex items-center justify-center text-purple-400">
              <Zap className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-100">AI Agent</h1>
          </div>
          <p className="text-xs text-slate-400">Multi-tool integration platform</p>
        </div>
        {/* Mobile close */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-2 text-slate-400 hover:text-white md:hidden rounded-lg hover:bg-slate-800/50"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Action Buttons ── */}
      <div className="p-4 border-b border-purple-500/20 space-y-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-lg shadow-purple-500/20 text-sm border border-white/10"
        >
          <Plus className="w-4 h-4" /> Percakapan Baru
        </button>

        <div className="flex items-center gap-2 w-full">
          <button
            onClick={onOpenRagModal}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 hover:bg-emerald-600/20 text-emerald-400 font-semibold transition-all text-sm truncate"
          >
            <BrainCircuit className="w-4 h-4 shrink-0" /> Knowledge Base
          </button>
          <button
            type="button"
            onClick={() => setRagEnabled(!ragEnabled)}
            className={`px-3 py-2.5 rounded-xl border transition-all text-sm font-semibold flex items-center gap-1.5 ${
              ragEnabled
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/5'
                : 'bg-slate-800/40 border-slate-700/50 text-slate-500 hover:text-slate-400'
            }`}
            title={ragEnabled ? 'RAG Aktif (Klik untuk menonaktifkan)' : 'RAG Non-aktif (Klik untuk mengaktifkan)'}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${ragEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            {ragEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* Conversations */}
        <div>
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Riwayat Chat</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {conversations.filter(c => !c.title.startsWith('[AUTO]')).map(conv => (
              <div key={conv.id} className="relative group flex items-center">
                <button
                  onClick={() => {
                    setCurrentConversationId(conv.id);
                    setSidebarOpen(false);
                    setActiveView('chat');
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
                    onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
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

        {/* Auto Reports */}
        {conversations.some(c => c.title.startsWith('[AUTO]')) && (
          <div className="pt-4 border-t border-slate-700/50">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Laporan Otomatis
            </h3>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {conversations.filter(c => c.title.startsWith('[AUTO]')).map(conv => (
                <div key={conv.id} className="relative group flex items-center">
                  <button
                    onClick={() => {
                      setCurrentConversationId(conv.id);
                      setSidebarOpen(false);
                      setActiveView('chat');
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all truncate pr-8 ${
                      conv.id === currentConversationId
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium'
                        : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                    }`}
                  >
                    <Clock className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span className="truncate">{conv.title.replace('[AUTO] ', '')}</span>
                  </button>
                  {conversations.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
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
        )}

        {/* Auto-Update (Electron only) */}
        {window.electronAPI && (
          <div className="border-t border-purple-500/20 pt-4 mb-4">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-blue-400" /> Auto-Update
            </h3>
            <button
              onClick={async () => {
                if (window.electronAPI?.checkForUpdates) {
                  const result = await window.electronAPI.checkForUpdates();
                  if (result.status === 'error') alert('Gagal memeriksa update: ' + result.message);
                  else if (result.status === 'dev-mode') alert(result.message);
                }
              }}
              className="w-full text-[10px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 py-2 rounded-lg border border-blue-500/30 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-3.5 h-3.5" /> Cek Update
            </button>
          </div>
        )}

        {/* Global Memory (Jangka Panjang) */}
        <div className="border-t border-purple-500/20 pt-4 mb-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <BrainCircuit className="w-3.5 h-3.5 text-purple-400" /> Memori Jangka Panjang
          </h3>
          <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
            Tulis aturan, sifat, atau instruksi permanen yang harus selalu dipatuhi Mamet.
          </p>
          <textarea
            value={globalMemory}
            onChange={(e) => setGlobalMemory(e.target.value)}
            placeholder="Cth: Kamu adalah asisten pajak. Selalu panggil saya Bos. Jangan pakai emoji."
            className="w-full bg-slate-900/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all resize-none min-h-[80px]"
          />
        </div>

        {/* Tools Selection */}
        <div className="border-t border-purple-500/20 pt-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Active Tools</h3>
          <div className="space-y-2">
            {availableTools.map(tool => (
              <button
                key={tool}
                onClick={() => onToggleTool(tool)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
                  selectedTools.includes(tool)
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30 border border-white/10'
                    : 'bg-slate-800/40 text-slate-400 hover:bg-slate-700/50'
                }`}
              >
                {toolIcons[tool] || <Plus className="w-4 h-4" />}
                <div className="text-left flex-1">
                  <div className="font-medium">{tool.replace('_', ' ')}</div>
                  <div className="text-xs opacity-75">{toolDescriptions[tool]}</div>
                </div>
                <div className={`w-2 h-2 rounded-full transition-all ${
                  selectedTools.includes(tool) ? 'bg-green-400 shadow-lg shadow-green-500/50' : 'bg-slate-600'
                }`} />
              </button>
            ))}
          </div>
        </div>

        {/* Cron Tasks */}
        <div className="border-t border-purple-500/20 pt-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            ⏰ Tugas Otomatis (Cron)
          </h3>
          <p className="text-[10px] text-slate-400 mb-3 leading-tight">
            Mamet akan mengerjakan riset/tugas secara mandiri di belakang layar sesuai jadwal.
          </p>
          {navBtn('cron', 'Dashboard Automasi', <Clock className="w-3.5 h-3.5" />, 'emerald')}
        </div>

        {/* Developer Mode Sections */}
        {isDeveloperMode && (
          <>
            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                📈 Server Monitoring
              </h3>
              {navBtn('monitoring', 'Dashboard Monitoring', <Activity className="w-3.5 h-3.5" />, 'blue')}
            </div>

            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                💳 Billing &amp; Quota
              </h3>
              {navBtn('billing', 'Quota Token AI', <DollarSign className="w-3.5 h-3.5" />, 'emerald')}
            </div>

            <div className="border-t border-purple-500/20 pt-4">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                🛍️ Shopee Affiliate
              </h3>
              <div className="flex flex-col gap-2">
                {navBtn('shopee',       'Shopee Ninja',        <ShoppingBag className="w-3.5 h-3.5" />, 'orange')}
                {navBtn('observability','Observability',       <Activity className="w-4 h-4" />,        'purple')}
                {navBtn('memoryhealth', 'Mem Health',          <Activity className="w-4 h-4" />,        'blue')}
                {navBtn('work',         'Work Track',          <Briefcase className="w-4 h-4" />,       'indigo')}
                {navBtn('engineer',     'Engineer',            <Terminal className="w-4 h-4" />,        'emerald')}
              </div>
            </div>
          </>
        )}

        {/* Examples */}
        <div className="border-t border-purple-500/20 pt-4">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Examples</h3>
          <div className="space-y-2">
            {[
              'Cari info terbaru tentang AI',
              'Jalankan tugas otomasi',
              'Integrasikan dengan Slack',
              'Call REST API',
            ].map((example, i) => (
              <button
                key={i}
                onClick={() => {/* setInput handled by parent */}}
                className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-purple-400 rounded-lg hover:bg-slate-800/40 transition-all"
              >
                → {example}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ── Footer: User & Settings ── */}
      <div className="p-4 border-t border-purple-500/20 space-y-2">
        <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 truncate">
            <User className="w-4 h-4 shrink-0" />
            <span className="truncate">{user?.email}</span>
          </div>
          <button
            onClick={() => setIsDeveloperMode(!isDeveloperMode)}
            className={`p-1 rounded transition-colors ${isDeveloperMode ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-slate-800'}`}
            title="Toggle Developer Mode"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onOpenSettings}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-700/50 transition-all text-sm font-medium"
          >
            <Settings className="w-4 h-4" /> Settings
          </button>
          <button
            onClick={onSignOut}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-sm font-medium"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

    </div>
  );
}
