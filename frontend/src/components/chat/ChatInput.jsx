import React from 'react';
import { Send, Paperclip, X, FolderOpen, FileText, Image as ImageIcon } from 'lucide-react';

/**
 * ChatInput — Compact & Responsive
 *
 * Design goals:
 * - Minimum tinggi (single-line default), auto-grow saat user mengetik
 * - Toolbar kecil (ikon saja) agar tidak makan ruang
 * - Di mobile: hapus resize handle (tidak relevan), hide label "Send"
 * - Hapus baris "Active tools" yang makan ruang di bawah
 */
export default function ChatInput({
  input,
  setInput,
  handleSend,
  loading,
  attachedFile,
  setAttachedFile,
  fileInputRef,
  handleSelectWorkspace,
  workspaceHandle,
  desktopWorkspacePath,
  selectedTools,
  onStartResize,
  onResetWidth,
  isDesktopMode,
}) {
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFile(e.target.files[0]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    // Auto-resize textarea: reset dulu, lalu set ke scrollHeight
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const hasContent = input.trim().length > 0 || !!attachedFile;

  return (
    <div className="shrink-0 w-full border-t border-white/5 bg-[#0A0A0A]/95 backdrop-blur-md px-3 py-2 z-20">
      <div className="max-w-3xl mx-auto w-full space-y-1.5">

        {/* Lampiran file (tampil hanya jika ada file dipilih) */}
        {attachedFile && (
          <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-1.5 w-max max-w-full animate-in fade-in slide-in-from-bottom-2">
            {attachedFile.type.startsWith('image/')
              ? <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              : <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            }
            <span className="text-xs text-purple-200 truncate max-w-[200px]">{attachedFile.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="ml-1 text-slate-400 hover:text-red-400 transition-colors"
              title="Hapus lampiran"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Input container */}
        <div className="flex items-end gap-2 bg-slate-800/60 border border-white/10 rounded-2xl px-3 py-2
          focus-within:border-purple-500/60 focus-within:ring-1 focus-within:ring-purple-500/20 transition-all">

          {/* Resize handle — HANYA di desktop */}
          {onStartResize && (
            <div
              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/10 hover:bg-white/25 rounded-full cursor-row-resize transition-colors"
              onPointerDown={onStartResize}
              onDoubleClick={onResetWidth}
            />
          )}

          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".zip,.pdf,.txt,.md,.csv,.xlsx,.xls,.docx,image/*"
            onChange={handleFileChange}
          />

          {/* Tombol Lampiran */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="Lampirkan file (PDF, gambar, dll)"
            className="p-1.5 text-slate-500 hover:text-purple-400 hover:bg-slate-700/50 rounded-xl transition-colors disabled:opacity-40 shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Tombol Workspace */}
          <button
            type="button"
            onClick={handleSelectWorkspace}
            disabled={loading}
            title={(workspaceHandle || desktopWorkspacePath)
              ? 'Workspace terhubung — klik untuk putuskan'
              : 'Hubungkan folder kerja (workspace)'}
            className={`p-1.5 rounded-xl transition-colors disabled:opacity-40 shrink-0 ${
              (workspaceHandle || desktopWorkspacePath)
                ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-700/50'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          {/* Textarea — auto-grow, single line default */}
          <textarea
            id="chat-input"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ketik pesan... (Shift+Enter untuk baris baru)"
            disabled={loading}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-200 placeholder-slate-500 resize-none overflow-y-auto leading-5 py-0.5 min-h-[20px]"
            style={{ height: '20px', maxHeight: '160px' }}
          />

          {/* Tombol Kirim */}
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !hasContent}
            title="Kirim pesan (Enter)"
            className={`p-2 rounded-xl transition-all shrink-0 ${
              hasContent && !loading
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Info tools — compact, hanya tampil jika ada tools aktif */}
        {selectedTools && selectedTools.length > 0 && (
          <p className="text-[10px] text-slate-600 px-1">
            Tools: {selectedTools.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}