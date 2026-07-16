import React from 'react';
import { Menu, Plus, Zap } from 'lucide-react';

/**
 * ChatHeader — Compact header untuk chat area
 *
 * Props:
 *  - onToggleHistory : () => void  — membuka/tutup sidebar/history
 *  - onNewChat       : () => void  — mulai percakapan baru
 *  - workspaceId     : string      — label workspace aktif
 *  - activeAgent     : string      — 'assistant' | 'engineer'
 */
export default function ChatHeader({ onToggleHistory, onNewChat, workspaceId = 'ws-assistant', activeAgent }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 bg-[#0A0A0A] shrink-0 min-h-[48px]">
      
      {/* Kiri: tombol menu & new chat */}
      <div className="flex items-center gap-1">
        {/* Tombol ☰ — buka/tutup sidebar riwayat */}
        <button
          type="button"
          onClick={onToggleHistory}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
          title="Buka/Tutup Riwayat"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Tombol + — percakapan baru */}
        <button
          type="button"
          onClick={onNewChat}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
          title="Percakapan Baru"
          aria-label="Percakapan baru"
        >
          <Plus className="w-5 h-5" />
        </button>

        <div className="w-px h-5 bg-slate-700/50 mx-1 hidden sm:block" />

        {/* Nama agent */}
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <div className="flex flex-col">
            <span className="font-semibold text-slate-100 text-sm leading-tight">
              {activeAgent === 'engineer' ? 'Engineer Mode' : 'Mamet OS'}
            </span>
            <span className="text-[9px] text-slate-500 tracking-wider font-medium hidden sm:block">
              {activeAgent === 'engineer' ? 'ENGINEER CORE' : 'MAEF ENGINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Kanan: workspace ID badge */}
      <div className="text-[9px] text-slate-600 font-mono bg-slate-800/40 px-2 py-1 rounded border border-slate-700/30 truncate max-w-[80px] sm:max-w-none">
        {workspaceId}
      </div>
    </div>
  );
}