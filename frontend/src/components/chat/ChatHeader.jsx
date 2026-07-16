import React from 'react';
import { Menu, Plus, Zap } from 'lucide-react';

export default function ChatHeader({ onToggleHistory, onNewChat, workspaceId = 'ws-assistant', activeAgent }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#0A0A0A] shrink-0 min-h-[56px]">
      <div className="flex items-center gap-2">
        {/* --- TOMBOL MENU SEKARANG MEMANGGIL onToggleHistory --- */}
        <button
          onClick={onToggleHistory}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/50 transition-colors"
          title="Buka/Tutup Riwayat Chat"
        >
          <Menu className="w-5 h-5" />
        </button>
        {/* ----------------------------------------------------- */}
        
        <button
          onClick={onNewChat}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/50 transition-colors"
          title="Percakapan Baru"
        >
          <Plus className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-slate-700/50 mx-1 hidden sm:block"></div>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-400" />
          <div className="flex flex-col">
            {/* --- TAMPILAN HEADER BERUBAH SAAT BERGANTI MODE --- */}
            <span className="font-bold text-slate-100 text-sm leading-tight">
              {activeAgent === 'engineer' ? 'Engineer Mode' : 'Mamet OS'}
            </span>
            <span className="text-[9px] text-slate-500 tracking-wider font-medium hidden sm:block">
              {activeAgent === 'engineer' ? 'ENGINEER CORE' : 'MAEF ENGINE'}
            </span>
            {/* ------------------------------------------------- */}
          </div>
        </div>
      </div>
      <div className="text-[10px] text-slate-500 font-mono bg-slate-800/40 px-2 py-1 rounded border border-slate-700/30">
        {workspaceId}
      </div>
    </div>
  );
}