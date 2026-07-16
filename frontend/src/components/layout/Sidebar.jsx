import React, { useState } from 'react';
import { MessageCircle, Plus, Menu, X, Zap, Settings, LogOut, User, Terminal, Clock, BrainCircuit } from 'lucide-react';
import { supabase } from '../../supabase';
import { useWorkspace } from '../../core/workspace/WorkspaceContext';

export default function Sidebar({
  user,
  conversations,
  currentConversationId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onToggleDeveloperMode,
  isDeveloperMode,
  onOpenSettings,
  isMobile,
  isOpen,
  onClose,
}) {
  const { manager: workspaceManager } = useWorkspace();
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- PERBAIKAN: Gunakan fallback (conversations || []) agar tidak crash saat data masih undefined ---
  const sortedConversations = [...(conversations || [])].sort((a, b) => 
    new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  );

  const menuItems = [
    { id: 'app:home', label: 'Home', icon: Zap },
    { id: 'app:assistant', label: 'Assistant', icon: MessageCircle },
    { id: 'app:mametlite', label: 'Lite', icon: Zap },
    { id: 'app:engineer', label: 'Engineer', icon: Terminal },
  ];

  const handleNavigate = (appId) => {
    if (workspaceManager) {
      workspaceManager.setActiveAppId(appId);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}

      <div className={`
        fixed inset-y-0 left-0 z-50 w-[280px] md:w-[var(--left-width)] shrink-0 bg-[#0A0A0A] border-r border-white/5 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:bg-[#0A0A0A] md:z-auto
        ${isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'}
      `}>
        {/* Header */}
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
          {isMobile && (
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/50">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-b border-purple-500/20 space-y-2">
          <button onClick={onNewChat} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-lg shadow-purple-500/20 text-sm border border-white/10">
            <Plus className="w-4 h-4" />
            Percakapan Baru
          </button>
        </div>

        {/* Conversations list & Navigation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {/* Conversation History */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Riwayat Chat</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {/* --- PERBAIKAN: Aman karena sortedConversations sudah di-fallback dengan array kosong --- */}
              {sortedConversations.filter(c => !c.title?.startsWith('[AUTO]')).map(conv => (
                <div key={conv.id} className="relative group flex items-center">
                  <button
                    onClick={() => { onSelectChat(conv.id); if (isMobile) onClose(); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all truncate pr-8 ${
                      conv.id === currentConversationId
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium'
                        : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                    }`}
                  >
                    <MessageCircle className="w-4 h-4 shrink-0 text-purple-400" />
                    <span className="truncate">{conv.title || 'Percakapan'}</span>
                  </button>
                  {sortedConversations.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteChat(conv.id); }}
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

          {/* Navigation Menu */}
          <div className="border-t border-slate-700/50 pt-4">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Navigation</h3>
            <div className="space-y-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-purple-400 hover:bg-slate-800/40 transition-all"
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer: Settings & User */}
        <div className="p-4 border-t border-purple-500/20 space-y-2">
          <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-400">
            <div className="flex items-center gap-2 truncate">
              <User className="w-4 h-4 shrink-0" />
              <span className="truncate">{user?.email || 'User'}</span>
            </div>
            <button onClick={onToggleDeveloperMode} className={`p-1 rounded transition-colors ${isDeveloperMode ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-slate-800'}`} title="Toggle Developer Mode">
              <Terminal className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={onOpenSettings} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-700/50 transition-all text-sm font-medium">
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <button onClick={handleLogout} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all text-sm font-medium">
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}