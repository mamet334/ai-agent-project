/**
 * RagModal.jsx
 *
 * Modal untuk upload dokumen ke Knowledge Base (RAG).
 * Diekstrak dari AIAgent.jsx (baris 2248-2327).
 *
 * Props:
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - ragFile: File | null
 *   - setRagFile: React setState function
 *   - onUpload: (e) => void
 *   - isLoading: boolean
 *   - status: string (pesan status upload)
 *   - knowledgeBase: Array<{ id, title }>
 *   - onDeleteDocument: (id) => void
 *
 * DEBUG POINTS:
 *   - onUpload: cek Supabase Storage jika file tidak terupload
 *   - knowledgeBase: cek query Supabase jika daftar dokumen kosong
 *   - onDeleteDocument: cek RPC Supabase jika dokumen tidak terhapus
 */
import React from 'react';
import { BrainCircuit, X, FileText, Trash2 } from 'lucide-react';

export default function RagModal({
  isOpen,
  onClose,
  ragFile,
  setRagFile,
  onUpload,
  isLoading,
  status,
  knowledgeBase = [],
  onDeleteDocument
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-emerald-500/10">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-500/20 bg-slate-800/50">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-emerald-400" />
            Knowledge Base (RAG)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-400 mb-6">
            Unggah dokumen (PDF, TXT) ke dalam Otak AI. Dokumen ini akan diingat secara permanen
            oleh Mamet untuk membantu menjawab pertanyaan Anda yang sangat spesifik.
          </p>

          {/* Upload Form */}
          <form onSubmit={onUpload} className="space-y-4">

            {/* Dropzone */}
            <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl p-8 text-center transition-all bg-slate-950/50 relative">
              <input
                type="file"
                accept=".pdf,.txt,.md"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={e => {
                  if (e.target.files?.[0]) setRagFile(e.target.files[0]);
                }}
              />
              <div className="flex flex-col items-center justify-center gap-2">
                <FileText className="w-8 h-8 text-slate-500" />
                {ragFile ? (
                  <span className="text-emerald-400 font-medium">{ragFile.name}</span>
                ) : (
                  <span className="text-slate-400 text-sm">Klik atau Seret file PDF/TXT ke sini</span>
                )}
              </div>
            </div>

            {/* Status message */}
            {status && (
              <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 text-xs text-center text-emerald-300 font-mono">
                {status}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading || !ragFile}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold transition-all shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:shadow-none"
            >
              {isLoading ? 'Mengekstrak Dokumen...' : 'Tanamkan ke Otak AI'}
            </button>
          </form>

          {/* Saved Documents List */}
          {knowledgeBase.length > 0 && (
            <div className="mt-8">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                Dokumen Tersimpan:
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                {knowledgeBase.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-colors group"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-sm text-slate-300 truncate" title={doc.title}>
                        {doc.title}
                      </span>
                    </div>
                    <button
                      onClick={() => onDeleteDocument(doc.id)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-md hover:bg-slate-700/50 transition-all"
                      title="Hapus Dokumen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
