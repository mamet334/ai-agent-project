import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Loader2,
  RefreshCw,
  X,
  Minus,
  Search,
  Database,
  BookOpen,
  AlertTriangle,
  Trash2,
  Archive,
  RotateCcw,
  ShieldAlert,
  Clock,
  Layers,
  Check
} from 'lucide-react';
import { supabase } from '../../supabase';
import { kernel } from '../../core/runtime/Kernel';

/**
 * MemoryContextPanel - Panel "Memory Context" yang menampilkan:
 * 1. Active Memories (Retrieved / Active) dengan opsi Soft-Delete
 * 2. Conflict Resolver (Review item CONFLICT_PENDING_REVIEW + visual diff)
 * 3. Trash Bin / Purge Lifecycle Manager (Soft-delete -> Pending Purge -> Hard Delete)
 */
export default function MemoryContextPanel({
  memories = [],
  query = '',
  loading = false,
  serviceManager,
  onClose,
  onMinimize,
  onRefresh,
  onResolveConflict,
  onArchiveMemory,
  onRequestPurge,
  onExecutePurge,
  onRestoreMemory
}) {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const requested = sessionStorage.getItem('mamet_memory_active_tab');
      if (requested) {
        sessionStorage.removeItem('mamet_memory_active_tab');
        return requested;
      }
    } catch (_) {}
    return 'ACTIVE';
  });
  const [filter, setFilter] = useState('ALL');
  
  // State data konflik & trash & active DB memories
  const [conflicts, setConflicts] = useState([]);
  const [trashItems, setTrashItems] = useState([]);
  const [dbActiveMemories, setDbActiveMemories] = useState([]);
  const [isLoadingExtras, setIsLoadingExtras] = useState(false);
  
  // Action states
  const [processingId, setProcessingId] = useState(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState(null);

  const getGovernor = useCallback(() => {
    const sm = serviceManager || kernel?.serviceManager;
    return sm?.has?.('MemoryGovernorService')
      ? sm.get('MemoryGovernorService')
      : null;
  }, [serviceManager]);

  // Muat data konflik, trash, dan active memories dari governor / database
  const loadExtras = useCallback(async () => {
    setIsLoadingExtras(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const governor = getGovernor();
      if (governor) {
        const [conflictData, trashData, activeData] = await Promise.all([
          governor.getConflicts(userId),
          governor.getTrashMemories(userId),
          governor.getActiveMemories(userId)
        ]);
        setConflicts(conflictData || []);
        setTrashItems(trashData || []);
        setDbActiveMemories(activeData || []);
      } else {
        // Fallback langsung ke query Supabase
        const [{ data: cData }, { data: tData }, { data: aData }] = await Promise.all([
          supabase.from('user_memories').select('*').eq('user_id', userId).eq('status', 'CONFLICT_PENDING_REVIEW'),
          supabase.from('user_memories').select('*').eq('user_id', userId).in('status', ['archived', 'pending_purge']),
          supabase.from('user_memories').select('*').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(50)
        ]);
        setConflicts(cData || []);
        setTrashItems(tData || []);
        setDbActiveMemories(aData || []);
      }
    } catch (err) {
      console.warn('[MemoryContextPanel] Gagal memuat data konflik/trash/active:', err);
    } finally {
      setIsLoadingExtras(false);
    }
  }, [getGovernor]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  // Listener event bus untuk update real-time
  useEffect(() => {
    const bus = serviceManager?.get?.('EventBus') || kernel?.serviceManager?.get?.('EventBus');
    if (!bus) return;

    const handleUpdate = () => {
      loadExtras();
    };

    const handleOpenConflicts = () => {
      setActiveTab('CONFLICTS');
      loadExtras();
    };

    const unsubConflicts = bus.on('Memory:OpenConflicts', handleOpenConflicts);
    const unsub1 = bus.on('MemoryGovernor:ConflictDetected', handleUpdate);
    const unsub2 = bus.on('MemoryGovernor:ConflictResolved', handleUpdate);
    const unsub3 = bus.on('MemoryGovernor:Archived', handleUpdate);
    const unsub4 = bus.on('MemoryGovernor:Restored', handleUpdate);
    const unsub5 = bus.on('MemoryGovernor:Purged', handleUpdate);
    const unsub6 = bus.on('MemoryGovernor:Stored', handleUpdate);
    const unsub7 = bus.on('Memory:Stored', handleUpdate);

    return () => {
      unsubConflicts?.();
      unsub1?.();
      unsub2?.();
      unsub3?.();
      unsub4?.();
      unsub5?.();
      unsub6?.();
      unsub7?.();
    };
  }, [serviceManager, loadExtras]);

  // === Helper Tipe & Label ===
  const getMemoryType = (m) => {
    const type = (m?.memory_type || m?.type || '').toUpperCase();
    const source = (m?.source || '').toUpperCase();
    if (type === 'KNOWLEDGE' || source === 'KNOWLEDGE' || source === 'KNOWLEDGE_BASE') {
      return 'PERSONAL_KNOWLEDGE';
    }
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

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  // Tentukan memori efektif untuk tampilan: gunakan memories prop jika ada hasil retrieval,
  // atau tampilkan seluruh memori aktif sistem jika belum ada query / query generik
  const effectiveMemories = (memories && memories.length > 0) ? memories : dbActiveMemories;

  // Filter Active
  const filteredMemories = effectiveMemories.filter((m) => {
    if (filter === 'ALL') return true;
    if (filter === 'USER_MEMORY') return getMemoryType(m) === 'USER_MEMORY';
    if (filter === 'PERSONAL_KNOWLEDGE') return getMemoryType(m) === 'PERSONAL_KNOWLEDGE';
    return true;
  });

  const countUser = effectiveMemories.filter((m) => getMemoryType(m) === 'USER_MEMORY').length;
  const countKnowledge = effectiveMemories.filter((m) => getMemoryType(m) === 'PERSONAL_KNOWLEDGE').length;

  // Handlers Aksi
  const handleResolve = async (memoryId, resolution) => {
    setProcessingId(memoryId);
    try {
      if (onResolveConflict) {
        await onResolveConflict(memoryId, resolution);
      } else {
        const governor = getGovernor();
        if (governor) await governor.resolveConflict(memoryId, resolution);
      }
      await loadExtras();
    } finally {
      setProcessingId(null);
    }
  };

  const handleArchive = async (memoryId) => {
    setProcessingId(memoryId);
    try {
      if (onArchiveMemory) {
        await onArchiveMemory(memoryId);
      } else {
        const governor = getGovernor();
        if (governor) await governor.archiveMemory(memoryId);
      }
      await loadExtras();
      onRefresh?.();
    } finally {
      setProcessingId(null);
    }
  };

  const handleRequestPurge = async (memoryId) => {
    setProcessingId(memoryId);
    try {
      if (onRequestPurge) {
        await onRequestPurge(memoryId);
      } else {
        const governor = getGovernor();
        if (governor) await governor.requestPurge(memoryId);
      }
      await loadExtras();
    } finally {
      setProcessingId(null);
    }
  };

  const handleExecutePurge = async (memoryId) => {
    setProcessingId(memoryId);
    try {
      if (onExecutePurge) {
        await onExecutePurge(memoryId);
      } else {
        const governor = getGovernor();
        if (governor) await governor.executePurge(memoryId);
      }
      setConfirmPurgeId(null);
      await loadExtras();
    } finally {
      setProcessingId(null);
    }
  };

  const handleRestore = async (memoryId) => {
    setProcessingId(memoryId);
    try {
      if (onRestoreMemory) {
        await onRestoreMemory(memoryId);
      } else {
        const governor = getGovernor();
        if (governor) await governor.restoreMemory(memoryId);
      }
      await loadExtras();
      onRefresh?.();
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="w-80 shrink-0 border-l border-outline-variant bg-surface-container-low/80 backdrop-blur-md flex flex-col h-full min-h-0 overflow-hidden animate-in fade-in slide-in-from-right-2 z-10 text-on-surface">
      {/* Header Utama */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-outline-variant bg-surface-container-low">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/15 border border-primary/30">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-body-sm font-semibold text-on-surface leading-tight">Memory Context</div>
            <div className="text-[10px] text-on-surface-variant leading-tight">
              {effectiveMemories.length} aktif • {conflicts.length} konflik • {trashItems.length} sampah
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              onRefresh?.();
              loadExtras();
            }}
            disabled={loading || isLoadingExtras}
            className="p-1.5 rounded-lg hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
            title="Refresh semua data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || isLoadingExtras ? 'animate-spin' : ''}`} />
          </button>
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="p-1.5 rounded-lg hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title="Minimize panel (Luaskan kolom percakapan)"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
              title="Tutup panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigasi Tab Utama */}
      <div className="flex items-center border-b border-outline-variant bg-surface-container-lowest/50 text-[11px] font-medium">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`flex-1 py-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'ACTIVE'
              ? 'border-primary text-primary bg-primary/5 font-semibold'
              : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30'
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>Aktif ({effectiveMemories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('CONFLICTS')}
          className={`flex-1 py-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 relative ${
            activeTab === 'CONFLICTS'
              ? 'border-red-500 text-red-400 bg-red-500/5 font-semibold'
              : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30'
          }`}
        >
          <ShieldAlert className="w-3 h-3" />
          <span>Konflik</span>
          {conflicts.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-red-500 text-white">
              {conflicts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('TRASH')}
          className={`flex-1 py-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'TRASH'
              ? 'border-amber-500 text-amber-400 bg-amber-500/5 font-semibold'
              : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30'
          }`}
        >
          <Trash2 className="w-3 h-3" />
          <span>Trash</span>
          {trashItems.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-surface-variant text-on-surface-variant">
              {trashItems.length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ACTIVE MEMORIES */}
      {/* ========================================================================= */}
      {activeTab === 'ACTIVE' && (
        <>
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

          {/* Filter Subtabs */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-outline-variant">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                filter === 'ALL' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              Semua ({effectiveMemories.length})
            </button>
            <button
              onClick={() => setFilter('USER_MEMORY')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                filter === 'USER_MEMORY' ? 'bg-emerald-500/20 text-emerald-400' : 'text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              User ({countUser})
            </button>
            <button
              onClick={() => setFilter('PERSONAL_KNOWLEDGE')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                filter === 'PERSONAL_KNOWLEDGE' ? 'bg-blue-500/20 text-blue-400' : 'text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              Knowledge ({countKnowledge})
            </button>
          </div>

          {/* List Item Aktif */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-on-surface-variant">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-[11px]">Memuat memori...</span>
              </div>
            ) : filteredMemories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant text-center px-4">
                <Brain className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-[11px] font-medium">
                  {effectiveMemories.length === 0 ? 'Belum ada memori ter-retrieve' : 'Tidak ada yang cocok dengan filter'}
                </p>
                {effectiveMemories.length === 0 && (
                  <p className="text-[10px] mt-1 opacity-60">
                    Kirim pesan untuk memicu retrieval memori otomatis
                  </p>
                )}
              </div>
            ) : (
              filteredMemories.map((m, idx) => {
                const content = m.summary || m.content || m.title || '';
                const type = getMemoryType(m);
                const isConflict = m.status === 'CONFLICT_PENDING_REVIEW';

                return (
                  <div
                    key={m.id || idx}
                    className={`flex items-start gap-2 border rounded-lg p-2.5 transition-all group ${
                      isConflict
                        ? 'bg-red-950/30 border-red-500/50 hover:border-red-400'
                        : 'bg-surface-container-low border-outline-variant/60 hover:border-primary/40'
                    }`}
                  >
                    <div className={`mt-0.5 p-1 rounded-md border shrink-0 ${isConflict ? 'border-red-500/40 bg-red-500/10 text-red-400' : getTypeColor(m)}`}>
                      {isConflict ? <AlertTriangle size={12} /> : getTypeIcon(m)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-[11px] text-on-surface break-words leading-snug">{content}</p>
                        {/* Tombol Soft-Delete (Arsipkan) */}
                        {m.id && !isConflict && (
                          <button
                            disabled={processingId === m.id}
                            onClick={() => handleArchive(m.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-on-surface-variant hover:text-red-400 transition-all shrink-0"
                            title="Arsipkan (Soft-Delete)"
                          >
                            <Archive size={11} />
                          </button>
                        )}
                      </div>

                      <div className={`flex items-center gap-2 mt-1.5 text-[9px] font-medium ${
                        isConflict ? 'text-red-400' : type === 'PERSONAL_KNOWLEDGE' ? 'text-blue-400' : 'text-emerald-400'
                      }`}>
                        <span className="px-1 py-0.5 rounded border border-current/20 bg-current/10">
                          {isConflict ? '⚠️ KONFLIK' : getTypeLabel(m)}
                        </span>
                        {typeof m.confidence === 'number' && (
                          <span className="text-on-surface-variant">conf {Math.round(m.confidence * 100)}%</span>
                        )}
                        <span className="text-on-surface-variant opacity-70">{formatDate(m.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CONFLICT RESOLVER (REVIEW & DIFF VIEW) */}
      {/* ========================================================================= */}
      {activeTab === 'CONFLICTS' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-3">
          {conflicts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-4">
              <Check className="w-8 h-8 text-emerald-400 mb-2 opacity-60" />
              <p className="text-[12px] font-semibold text-on-surface">Tidak Ada Konflik</p>
              <p className="text-[10px] text-on-surface-variant mt-1">
                Semua memori dalam keadaan sinkron dan tidak ada benturan versi.
              </p>
            </div>
          ) : (
            conflicts.map((conf) => {
              const info = conf.metadata?.conflict_info || {};
              const previousContent = info.previous_summary || conf.summary || '-';
              const incomingContent = info.incoming_content || '(Konten baru tidak tercatat)';
              const detectedAt = info.detected_at || conf.created_at;

              return (
                <div
                  key={conf.id}
                  className="border border-red-500/40 bg-red-950/20 rounded-xl p-3 space-y-2.5 shadow-sm"
                >
                  {/* Header Konflik */}
                  <div className="flex items-center justify-between text-[10px] text-red-400 font-semibold border-b border-red-500/20 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Konflik Memori #{conf.id.substring(0, 8)}</span>
                    </div>
                    <span className="text-[9px] text-red-300/80 font-normal">
                      {formatDate(detectedAt)}
                    </span>
                  </div>

                  {/* Metadata Deteksi */}
                  <div className="text-[9px] text-on-surface-variant space-y-0.5">
                    <div><span className="font-semibold text-on-surface">Sumber:</span> {conf.source_reference || info.source_reference || 'assistant_chat_trigger'}</div>
                    <div><span className="font-semibold text-on-surface">Alasan:</span> {info.reason || 'KONTEN BERBEDA / VERSI TIDAK SEKUENSIAL'}</div>
                  </div>

                  {/* Diff Container */}
                  <div className="space-y-1.5 text-[10px]">
                    {/* Versi Lama */}
                    <div className="rounded-lg p-2 bg-red-900/20 border border-red-500/30">
                      <div className="flex items-center gap-1 text-[9px] font-bold text-red-400 mb-0.5 uppercase tracking-wide">
                        <span>🔴 Versi Lama (Database)</span>
                        <span className="text-on-surface-variant font-normal">(v{info.existing_version_seq || conf.version_sequence})</span>
                      </div>
                      <p className="text-on-surface break-words leading-relaxed">{previousContent}</p>
                    </div>

                    {/* Versi Baru */}
                    <div className="rounded-lg p-2 bg-emerald-900/20 border border-emerald-500/30">
                      <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 mb-0.5 uppercase tracking-wide">
                        <span>🟢 Input Baru yang Berbenturan</span>
                        <span className="text-on-surface-variant font-normal">(v{info.incoming_version_seq || 1})</span>
                      </div>
                      <p className="text-on-surface break-words leading-relaxed">{incomingContent}</p>
                    </div>
                  </div>

                  {/* Tombol Keputusan Owner */}
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      disabled={processingId === conf.id}
                      onClick={() => handleResolve(conf.id, 'keep')}
                      className="flex-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all text-center shadow disabled:opacity-50"
                      title="Pertahankan versi lama di memori aktif"
                    >
                      {processingId === conf.id ? 'Memproses...' : 'Pertahankan Lama'}
                    </button>

                    <button
                      disabled={processingId === conf.id}
                      onClick={() => handleResolve(conf.id, 'discard')}
                      className="flex-1 py-1.5 px-2 rounded-lg text-[10px] font-semibold bg-red-700 hover:bg-red-600 text-white transition-all text-center shadow disabled:opacity-50"
                      title="Buang / Arsipkan record ini"
                    >
                      {processingId === conf.id ? 'Memproses...' : 'Buang / Arsipkan'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TRASH & PURGE LIFECYCLE */}
      {/* ========================================================================= */}
      {activeTab === 'TRASH' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-2.5">
          {trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-4">
              <Archive className="w-8 h-8 text-on-surface-variant/40 mb-2" />
              <p className="text-[12px] font-semibold text-on-surface">Kotak Sampah Kosong</p>
              <p className="text-[10px] text-on-surface-variant mt-1">
                Tidak ada memori berstatus arsip atau pending purge.
              </p>
            </div>
          ) : (
            trashItems.map((item) => {
              const isPendingPurge = item.status === 'pending_purge';
              const content = item.summary || item.content || '';

              return (
                <div
                  key={item.id}
                  className={`border rounded-xl p-2.5 space-y-2 transition-all ${
                    isPendingPurge
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-surface-container-low border-outline-variant/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px]">
                    <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                      isPendingPurge
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-surface-variant text-on-surface-variant'
                    }`}>
                      {isPendingPurge ? '⏳ Menunggu Hard Delete' : '📦 Diarsipkan'}
                    </span>
                    <span className="text-on-surface-variant opacity-70">{formatDate(item.created_at)}</span>
                  </div>

                  <p className="text-[11px] text-on-surface break-words leading-snug">{content}</p>

                  {/* Modal / Inline Konfirmasi Hard Delete */}
                  {confirmPurgeId === item.id ? (
                    <div className="bg-red-950/50 border border-red-500/40 rounded-lg p-2 space-y-1.5 animate-in fade-in">
                      <p className="text-[9px] text-red-300 font-semibold leading-tight">
                        ⚠️ Hapus permanen dari database? Aksi ini tidak dapat dibatalkan!
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setConfirmPurgeId(null)}
                          className="flex-1 py-1 rounded text-[9px] bg-surface-variant hover:bg-surface-container-high text-on-surface font-medium transition-colors"
                        >
                          Batal
                        </button>
                        <button
                          disabled={processingId === item.id}
                          onClick={() => handleExecutePurge(item.id)}
                          className="flex-1 py-1 rounded text-[9px] bg-red-600 hover:bg-red-500 text-white font-bold transition-colors disabled:opacity-50"
                        >
                          {processingId === item.id ? '...' : 'Ya, Hard Delete'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Tombol Aksi Normal */
                    <div className="flex items-center gap-1.5 pt-1">
                      {/* Tombol Pulihkan */}
                      <button
                        disabled={processingId === item.id}
                        onClick={() => handleRestore(item.id)}
                        className="flex-1 py-1 px-1.5 rounded-md text-[9px] font-semibold bg-surface-variant hover:bg-surface-container-high text-on-surface flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                        title="Kembalikan ke status aktif"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Pulihkan</span>
                      </button>

                      {/* Tombol Aksi Purge */}
                      {!isPendingPurge ? (
                        <button
                          disabled={processingId === item.id}
                          onClick={() => handleRequestPurge(item.id)}
                          className="flex-1 py-1 px-1.5 rounded-md text-[9px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                          title="Tandai untuk Purge (Tahap 1)"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          <span>Minta Purge</span>
                        </button>
                      ) : (
                        <button
                          disabled={processingId === item.id}
                          onClick={() => setConfirmPurgeId(item.id)}
                          className="flex-1 py-1 px-1.5 rounded-md text-[9px] font-bold bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                          title="Eksekusi Hard Delete Permanen"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          <span>Hard Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Footer Statistik */}
      <div className="px-3 py-2 border-t border-outline-variant text-center bg-surface-container-low/50">
        <p className="text-[9px] text-on-surface-variant tracking-widest uppercase">
          {effectiveMemories.length} Aktif • {conflicts.length} Konflik • {trashItems.length} Trash
        </p>
      </div>
    </div>
  );
}

