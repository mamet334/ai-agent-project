import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

const formatDate = (dateString) => {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleDateString('id-ID', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

export default function NodeInspector({ selectedNode, onClose, serviceManager }) {
  if (!selectedNode || selectedNode.isCategory) return null;

  const [chunks, setChunks] = useState([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [showChunks, setShowChunks] = useState(false);
  const [chunksError, setChunksError] = useState(null);

  useEffect(() => {
    setShowChunks(false);
    setChunks([]);
    setChunksError(null);
  }, [selectedNode?.id]);

  const isConflict = selectedNode.isConflict || selectedNode.data?.status === 'CONFLICT_PENDING_REVIEW';
  const nodeType = selectedNode.type || (selectedNode.group === 'rag' ? 'Document' : selectedNode.group === 'memory' ? 'Memory' : selectedNode.group === 'chat' ? 'Conversation' : 'Pipeline Service');

  // Navigation handlers
  const handleResolveConflict = () => {
    sessionStorage.setItem('active_memory_tab', 'CONFLICTS');
    const sm = serviceManager;
    const appManager = sm?.has?.('ApplicationManager') ? sm.get('ApplicationManager') : (sm?.has?.('applicationManager') ? sm.get('applicationManager') : null);
    const eventBus = sm?.has?.('EventBus') ? sm.get('EventBus') : null;
    if (appManager?.activateApp) {
      appManager.activateApp('app:assistant');
    }
    if (eventBus?.emit) {
      eventBus.emit('Memory:OpenConflicts');
    }
  };

  const handleOpenAssistant = () => {
    const sm = serviceManager;
    const appManager = sm?.has?.('ApplicationManager') ? sm.get('ApplicationManager') : (sm?.has?.('applicationManager') ? sm.get('applicationManager') : null);
    if (appManager?.activateApp) {
      appManager.activateApp('app:assistant');
    }
  };

  const toggleLoadChunks = async () => {
    if (showChunks) {
      setShowChunks(false);
      return;
    }
    setShowChunks(true);
    if (chunks.length > 0) return;

    setLoadingChunks(true);
    setChunksError(null);
    try {
      const docId = (selectedNode.id || '').startsWith('doc-') 
        ? selectedNode.id.replace('doc-', '') 
        : selectedNode.id;

      const { data, error } = await supabase
        .from('document_chunks')
        .select('id, content, source_url, source_type')
        .eq('document_id', docId)
        .order('id', { ascending: true });

      if (error) throw error;
      setChunks(data || []);
    } catch (err) {
      console.error('[NodeInspector] Gagal memuat chunks:', err);
      setChunksError('Gagal memuat teks dari basis data pgvector.');
    } finally {
      setLoadingChunks(false);
    }
  };

  // Semantic color and badge
  let themeColor = '#22c55e';
  let badgeLabel = 'USER MEMORY';
  let badgeBorder = 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10';

  if (isConflict) {
    themeColor = '#ef4444';
    badgeLabel = 'KONFLIK MEMORI';
    badgeBorder = 'border-red-500/40 text-red-300 bg-red-500/20 animate-pulse';
  } else if (nodeType === 'Document' || selectedNode.group === 'rag') {
    themeColor = '#a855f7';
    badgeLabel = 'RAG DOCUMENT';
    badgeBorder = 'border-purple-500/30 text-purple-300 bg-purple-500/10';
  } else if (nodeType === 'Conversation' || selectedNode.group === 'chat') {
    themeColor = '#eab308';
    badgeLabel = 'CONVERSATION';
    badgeBorder = 'border-yellow-500/30 text-yellow-300 bg-yellow-500/10';
  } else if (nodeType === 'Pipeline Service' || selectedNode.group === 'pipeline') {
    themeColor = '#38bdf8';
    badgeLabel = 'PIPELINE SERVICE';
    badgeBorder = 'border-sky-500/30 text-sky-300 bg-sky-500/10';
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300 font-mono select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span 
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: themeColor }}
          />
          <h2 className="text-xs font-bold tracking-[0.2em] text-white uppercase">
            Node Inspector
          </h2>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-white/5">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {/* Title & Type Badge */}
      <div className="mb-5 bg-white/[0.02] border border-white/5 p-3 rounded-xl">
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-wider ${badgeBorder}`}>
            {badgeLabel}
          </span>
          <span className="text-[10px] text-slate-500">ID: {selectedNode.id?.substring(0, 14)}...</span>
        </div>
        <div className="text-sm font-semibold text-white break-words mt-1 leading-snug">
          {selectedNode.name}
        </div>
      </div>

      {/* Context-Specific Content */}
      <div className="space-y-3.5 text-xs">
        {/* ================================================================= */}
        {/* MEMORY NODE CARD */}
        {/* ================================================================= */}
        {(nodeType === 'Memory' || selectedNode.group === 'memory') && (
          <>
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-3">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Status Memori</div>
                {isConflict ? (
                  <div className="flex items-center gap-1.5 text-red-400 font-bold text-xs bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg">
                    <span className="material-symbols-outlined text-sm animate-pulse">crisis_alert</span>
                    Konflik Terdeteksi (Perlu Resolusi)
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-xs">
                    <span className="material-symbols-outlined text-sm">verified</span>
                    Aktif dalam Memori Jangka Panjang
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Dirujuk AI</div>
                  <div className="text-slate-200 font-bold">{selectedNode.data?.used ?? 0} kali</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Tautan Relasi</div>
                  <div className="text-slate-200 font-bold">{selectedNode.data?.relations ?? 0} relasi aktif</div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Kategori</div>
                <div className="text-slate-300 capitalize">{selectedNode.data?.metadata?.category || selectedNode.data?.metadata?.type || 'Preferensi / Profil User'}</div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Waktu Dicatat</div>
                <div className="text-slate-400 text-[11px]">{formatDate(selectedNode.data?.created)}</div>
              </div>
            </div>

            {/* Action Buttons */}
            {isConflict ? (
              <button
                onClick={handleResolveConflict}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-mono text-xs font-bold rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.4)] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm animate-pulse">bolt</span>
                Selesaikan Konflik di Chat ➔
              </button>
            ) : (
              <button
                onClick={handleOpenAssistant}
                className="w-full py-2 px-3 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">chat</span>
                Buka Asisten AI ➔
              </button>
            )}
          </>
        )}

        {/* ================================================================= */}
        {/* DOCUMENT / RAG NODE CARD */}
        {/* ================================================================= */}
        {(nodeType === 'Document' || selectedNode.group === 'rag') && (
          <>
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Format Berkas</div>
                  <div className="text-purple-300 font-bold uppercase">
                    {selectedNode.data?.metadata?.file_type || selectedNode.name.split('.').pop() || 'TXT'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Potongan (Chunks)</div>
                  <div className="text-purple-300 font-bold">
                    {selectedNode.data?.relations ?? 0} pgvector
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Status Indeks</div>
                <div className="flex items-center gap-1.5 text-purple-400 font-medium text-xs">
                  <span className="material-symbols-outlined text-sm">auto_stories</span>
                  Tersedia untuk Pencarian RAG
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Waktu Diunggah</div>
                <div className="text-slate-400 text-[11px]">{formatDate(selectedNode.data?.created)}</div>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {/* In-Place Preview Button */}
              <button
                onClick={toggleLoadChunks}
                className="w-full py-2 px-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 font-mono text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">
                  {showChunks ? 'visibility_off' : 'visibility'}
                </span>
                {showChunks ? 'Tutup Teks Dokumen' : `Baca Isi Teks (${selectedNode.data?.relations ?? '0'} Chunks)`}
              </button>

              {/* Chunk Viewer */}
              {showChunks && (
                <div className="mt-2 bg-black/60 border border-purple-500/20 rounded-xl p-3 max-h-80 overflow-y-auto space-y-3 [scrollbar-width:thin] [scrollbar-color:rgba(168,85,247,0.3)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-purple-500/30 [&::-webkit-scrollbar-thumb]:rounded">
                  {loadingChunks ? (
                    <div className="py-6 text-center text-xs text-purple-400 font-mono animate-pulse flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
                      Memuat potongan teks dari pgvector...
                    </div>
                  ) : chunksError ? (
                    <div className="text-red-400 text-xs py-3 text-center">{chunksError}</div>
                  ) : chunks.length === 0 ? (
                    <div className="text-slate-500 text-xs py-3 text-center">Tidak ada potongan teks tersimpan.</div>
                  ) : (
                    chunks.map((chunk, idx) => (
                      <div key={chunk.id || idx} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 space-y-1.5">
                        <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex items-center justify-between border-b border-white/5 pb-1">
                          <span>Potongan #{idx + 1}</span>
                          <span className="text-slate-500 text-[9px] font-normal">{chunk.content?.length || 0} karakter</span>
                        </div>
                        <p className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed select-text font-sans break-words">
                          {chunk.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ================================================================= */}
        {/* CONVERSATION / CHAT NODE CARD */}
        {/* ================================================================= */}
        {(nodeType === 'Conversation' || selectedNode.group === 'chat') && (
          <>
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-3">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Peran Workspace</div>
                <div className="text-yellow-400 font-bold capitalize">
                  {selectedNode.data?.source || 'Assistant'}
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Status Sesi</div>
                <div className="flex items-center gap-1.5 text-yellow-300 font-medium text-xs">
                  <span className="material-symbols-outlined text-sm">forum</span>
                  Sesi Percakapan Tersimpan
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Waktu Sesi</div>
                <div className="text-slate-400 text-[11px]">{formatDate(selectedNode.data?.created)}</div>
              </div>
            </div>

            <button
              onClick={handleOpenAssistant}
              className="w-full py-2 px-3 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-yellow-300 font-mono text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
              Lanjutkan di Asisten ➔
            </button>
          </>
        )}

        {/* ================================================================= */}
        {/* PIPELINE SERVICE / SYSTEM NODE CARD */}
        {/* ================================================================= */}
        {(nodeType === 'Pipeline Service' || selectedNode.group === 'pipeline') && (
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Status Layanan</div>
              <div className="flex items-center gap-1.5">
                {selectedNode.data?.status === 'HEALTHY' ? (
                  <span className="text-emerald-400 font-bold text-xs bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
                    ● HEALTHY (AKTIF)
                  </span>
                ) : selectedNode.data?.status === 'DEGRADED' ? (
                  <span className="text-yellow-400 font-bold text-xs bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded">
                    ▲ DEGRADED (LAMBAT)
                  </span>
                ) : (
                  <span className="text-red-400 font-bold text-xs bg-red-500/10 border border-red-500/20 px-2 py-1 rounded">
                    ✕ DOWN / UNKNOWN
                  </span>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-white/5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Komponen Inti</div>
              <div className="text-slate-300 font-semibold">{selectedNode.name}</div>
            </div>

            {selectedNode.data?.latencyMs && (
              <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Latensi Eksekusi</div>
                <div className="text-slate-300">{selectedNode.data.latencyMs} ms</div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* OPTIONAL METADATA ACCORDION */}
        {/* ================================================================= */}
        {selectedNode.data?.metadata && Object.keys(selectedNode.data.metadata).length > 0 && (
          <details className="mt-3 border border-white/5 rounded-lg bg-black/30 text-[10px]">
            <summary className="p-2 text-slate-400 hover:text-slate-200 cursor-pointer font-semibold uppercase tracking-wider flex items-center justify-between">
              <span>Metadata Riil Basis Data</span>
              <span className="text-[10px] text-slate-500">▼</span>
            </summary>
            <pre className="p-2.5 text-slate-400 bg-black/60 rounded-b-lg overflow-x-auto max-h-40 border-t border-white/5 leading-relaxed font-mono">
              {JSON.stringify(selectedNode.data.metadata, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
