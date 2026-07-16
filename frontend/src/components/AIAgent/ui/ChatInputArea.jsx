/**
 * ChatInputArea.jsx
 *
 * Area input pesan + tombol send + attachment + workspace connector.
 * Diekstrak dari AIAgent.jsx (baris 1780-1883).
 *
 * Props:
 *   - input: string
 *   - setInput: React setState function
 *   - loading: boolean
 *   - attachedFile: File | null
 *   - setAttachedFile: React setState function
 *   - workspaceHandle: FileSystemDirectoryHandle | null
 *   - desktopWorkspacePath: string | null
 *   - selectedTools: string[]
 *   - onSend: () => void
 *   - onSelectWorkspace: () => void
 *   - fileInputRef: React.RefObject
 *   - onStartResizing: (target, event) => void
 *   - onResetWidth: (target) => void
 *
 * DEBUG POINTS:
 *   - onSend: cek disabled condition jika tombol tidak bisa diklik
 *   - onSelectWorkspace: cek electronAPI.selectDirectory jika workspace tidak terbuka
 *   - fileInputRef: cek accept types jika file tidak bisa dipilih
 */
import React from 'react';
import { Send, Paperclip, FolderOpen, X, FileText, Image as ImageIcon } from 'lucide-react';

export default function ChatInputArea({
  input,
  setInput,
  loading,
  attachedFile,
  setAttachedFile,
  workspaceHandle,
  desktopWorkspacePath,
  selectedTools,
  onSend,
  onSelectWorkspace,
  fileInputRef,
  onStartResizing,
  onResetWidth
}) {
  const isWorkspaceConnected = !!(workspaceHandle || desktopWorkspacePath);

  return (
    <div className="relative shrink-0 w-full border-t border-purple-500/30 bg-slate-900/80 backdrop-blur-md p-2 md:py-3 md:px-4 z-20">
      <div className="max-w-6xl mx-auto w-full">

        {/* File Attachment Preview */}
        {attachedFile && (
          <div className="mb-3 flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-2 w-max animate-in fade-in slide-in-from-bottom-2">
            {attachedFile.type.startsWith('image/')
              ? <ImageIcon className="w-4 h-4 text-purple-400" />
              : <FileText className="w-4 h-4 text-purple-400" />
            }
            <span className="text-xs text-purple-200 truncate max-w-[200px]">{attachedFile.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              className="ml-2 text-slate-400 hover:text-red-400 p-0.5 rounded-full hover:bg-slate-800/50 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Input Box */}
        <div className="bg-slate-800/50 border border-purple-500/30 rounded-2xl p-1.5 md:py-2 md:px-3 transition-all focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 shadow-lg relative flex flex-col">

          {/* Resizer Handle */}
          <div
            className="w-16 h-1 mx-auto bg-white/5 hover:bg-white/20 active:bg-white/30 rounded-full cursor-row-resize transition-colors mb-1 shrink-0"
            onPointerDown={(e) => onStartResizing('input', e)}
            onDoubleClick={() => onResetWidth('input')}
          />

          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".zip,.pdf,.txt,.md,.csv,.xlsx,.xls,.docx,image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                setAttachedFile(e.target.files[0]);
              }
            }}
          />

          {/* Textarea */}
          <textarea
            id="chat-input"
            value={input}
            onChange={e => {
              setInput(e.target.value);
              const target = e.target;
              setTimeout(() => {
                target.style.height = '20px';
                target.style.height = `${target.scrollHeight}px`;
              }, 0);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Ketik permintaan atau pertanyaan... (Shift+Enter untuk baris baru)"
            className="w-full bg-transparent border-none outline-none text-white placeholder-slate-500 resize-none overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500/30 px-2 py-0 mb-0"
            style={{
              height: input === '' ? 'var(--input-height, 24px)' : undefined,
              minHeight: 'var(--input-height)',
              maxHeight: 'max(180px, var(--input-height))'
            }}
            disabled={loading}
            rows="1"
          />

          {/* Taskbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">

              {/* Attach file */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="p-2 text-slate-400 hover:text-purple-400 hover:bg-slate-700/50 rounded-xl transition-colors focus:outline-none disabled:opacity-50"
                title="Lampirkan Dokumen (PDF, TXT, DOCX)"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Connect workspace */}
              <button
                onClick={onSelectWorkspace}
                disabled={loading}
                className={`p-2 rounded-xl transition-colors focus:outline-none disabled:opacity-50 ${
                  isWorkspaceConnected
                    ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                    : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-700/50'
                }`}
                title={isWorkspaceConnected
                  ? 'Workspace Terhubung! Klik untuk memutuskan sambungan'
                  : 'Hubungkan Folder Kerja (Workspace)'
                }
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </div>

            {/* Send button */}
            <button
              onClick={onSend}
              disabled={loading || (!input.trim() && !attachedFile)}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl px-5 py-2 font-medium flex items-center gap-2 transition-all shadow-lg shadow-purple-500/20 disabled:shadow-none border border-white/10"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>

        {/* Active Tools Info */}
        <p className="text-xs text-slate-500 mt-3">
          Active tools: {selectedTools.length > 0 ? selectedTools.join(', ') : 'none selected'}
        </p>

      </div>
    </div>
  );
}
