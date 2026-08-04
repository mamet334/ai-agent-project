import React, { useState } from 'react';
import { Brain, Loader2, RefreshCw, X, Search, Database, BookOpen } from 'lucide-react';

/**
 * MemoryContextPanel - Panel "Memory Context" yang menampilkan daftar memori
 * yang sedang di-retrieve oleh AI untuk sesi chat aktif.
 *
 * Komponen ini bersifat self-contained dan TIDAK mengubah logika inti
 * ConversationEngine (handleSend, streaming, persistensi). Ia hanya
 * menerima data memori dari atas dan menampilkannya.
 *
 * @param {Object} props
 * @param {Array} props.memories - Daftar memori yang di-retrieve (dari event 'Memory:Retrieved')
 * @param {string} props.query - Query terakhir yang memicu retrieval
 * @param {boolean} props.loading - Status loading saat memori di-retrieve
 * @param {Function} props.onClose - Callback untuk menutup panel
 * @param {Function} props.onRefresh - Callback untuk me-refresh memori (opsional)
 */
export default function MemoryContextPanel({
  memories = [],
  query = '',
  loading = false,
  onClose,
  onRefresh
}) {
  const [filter, setFilter] = useState('ALL');

  // === Helper untuk menentukan tipe & label memori ===
  const getMemoryType = (m) => {
    // memory_type bisa: 'fact', 'event', 'preference', 'knowledge', dll.
    // Membedakan USER_MEMORY vs PERSONAL_KNOWLEDGE berdasarkan source/type
    const type = (m?.memory_type || m?.type || '').toUpperCase();
    const source = (m?.source || '').toUpperCase();

    // PERSONAL_KNOWLEDGE: dianggap knowledge base / ingested docs
    if (type === 'KNOWLEDGE' || source === 'KNOWLEDGE' || source === 'KNOWLEDGE_BASE') {
      return 'PERSONAL_KNOWLEDGE';
    }
    // Sisanya adalah USER_MEMORY (fact, event, preference, dll)
    return 'USER_MEMORY';
  };

  const getTypeLabel = (m) => {
    const type = getMemoryType(m);
    const sub = (m?.memory_type || m?.type || '').toLowerCase();
    if (type === 'PERSONAL_KNOWLEDGE') return 'PERSONAL KNOWLEDGE';
    if (sub === 'event') return 'USER EVENT';
    if (sub === 'preference') return 'USER PREFERENCE';
    return 'USER MEMORY';
  };

  const getTypeColor = (m) => {
    if (getMemoryType(m) === 'PERSONAL_KNOWLEDGE') {
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  const getTypeIcon = (m) => {
    if (getMemoryType(m) === 'PERSONAL_KNOWLEDGE') {
      return <BookOpen className="w-3 h-3" />;
    }
    return <Database className="w-3 h-3" />;
  };

  // === Filter berdasarkan jenis ===
  const filteredMemories = memories.filter((m) => {
    if (filter === 'ALL') return true;
    if (filter === 'USER_MEMORY') return getMemoryType(m) === 'USER_MEMORY';
    if (filter === 'PERSONAL_KNOWLEDGE') return getMemoryType(m) === 'PERSONAL_KNOWLEDGE';
    return true;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  const countUser = memories.filter((m) => getMemoryType(m) === 'USER_MEMORY').length;
  const countKnowledge = memories.filter((m) => getMemoryType(m) === 'PERSONAL_KNOWLEDGE').length;

  return (
    <div className="w-72 shrink-0 border-l border-outline-variant bg-surface-container-low/60 backdrop-blur-sm flex flex-col h-full min-h-0 overflow-hidden animate-in fade-in slide-in-from-right-2">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-outline-variant bg-surface-container-low">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/15 border border-primary/30">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-body-sm font-semibold text-on-surface leading-tight">Memory Context</div>
            <div className="text-[10px] text-on-surface-variant leading-tight">
              {memories.length} memori aktif
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
              title="Refresh memori"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors"
              title="Tutup panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Query terakhir */}
      {query && (
        <div className="px-3 py-2 border-b border-outline-variant bg-surface-container-low/40">
          <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant mb-1">
            <Search className="w-3 h-3" />
            <span className="uppercase tracking-wider font-medium">Query Terakhir</span>
          </div>
          <p className="text-[11px] text-on-surface line-clamp-2 break-words leading-snug">{query}</p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-outline-variant">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
            filter === 'ALL' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:bg-surface-variant'
          }`}
        >
          Semua ({memories.length})
        </button>
        <button
          onClick={() => setFilter('USER_MEMORY')}
          className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
            filter === 'USER_MEMORY' ? 'bg-emerald-500/20 text-emerald-400' : 'text-on-surface-variant hover:bg-surface-variant'
          }`}
        >
          User ({countUser})
        </button>
        <button
          onClick={() => setFilter('PERSONAL_KNOWLEDGE')}
          className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
            filter === 'PERSONAL_KNOWLEDGE' ? 'bg-blue-500/20 text-blue-400' : 'text-on-surface-variant hover:bg-surface-variant'
          }`}
        >
          Knowledge ({countKnowledge})
        </button>
      </div>

      {/* Daftar memori */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-on-surface-variant">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-[11px]">Memuat memori...</span>
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant">
            <Brain className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-[11px]">
              {memories.length === 0 ? 'Belum ada memori ter-retrieve' : 'Tidak ada yang cocok dengan filter'}
            </p>
            {memories.length === 0 && (
              <p className="text-[10px] mt-1 opacity-60 text-center">
                Kirim pesan untuk memicu retrieval memori otomatis
              </p>
            )}
          </div>
        ) : (
          filteredMemories.map((m, idx) => {
            const content = m.summary || m.content || m.title || '';
            const type = getMemoryType(m);
            return (
              <div
                key={m.id || idx}
                className="flex items-start gap-2 bg-surface-container-low border border-outline-variant/60 rounded-lg p-2.5 hover:border-primary/30 transition-all group"
              >
                <div className={`mt-0.5 p-1 rounded-md border shrink-0 ${getTypeColor(m)}`}>
                  {getTypeIcon(m)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-on-surface break-words leading-snug">{content}</p>
                  <div className={`flex items-center gap-2 mt-1.5 text-[9px] font-medium ${type === 'PERSONAL_KNOWLEDGE' ? 'text-blue-400' : 'text-emerald-400'}`}>
                    <span className="px-1 py-0.5 rounded border border-current/20 bg-current/10">
                      {getTypeLabel(m)}
                    </span>
                    {typeof m.confidence === 'number' && (
                      <span className="text-on-surface-variant">conf {Math.round(m.confidence * 100)}%</span>
                    )}
                    {typeof m.memory_hits === 'number' && (
                      <span className="text-on-surface-variant">{m.memory_hits} hits</span>
                    )}
                    <span className="text-on-surface-variant opacity-70">{formatDate(m.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer statistik */}
      <div className="px-3 py-2 border-t border-outline-variant text-center">
        <p className="text-[9px] text-on-surface-variant tracking-widest uppercase">
          {memories.length} Memori • {countUser} User • {countKnowledge} Knowledge
        </p>
      </div>
    </div>
  );
}
