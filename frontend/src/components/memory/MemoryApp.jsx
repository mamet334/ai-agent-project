import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { Brain, Trash2, Loader2, RefreshCw, Search } from 'lucide-react';

export default function MemoryApp() {
    const [memories, setMemories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const loadMemories = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

let query = supabase
                .from('user_memories')
                .select('id, summary, memory_type, memory_state, memory_hits, created_at, last_used_at, source_reference, version_code, chat_id')
                .eq('user_id', session.user.id);

            if (searchQuery.trim()) {
                query = query.ilike('summary', `%${searchQuery.trim()}%`);
            }

            const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
            if (error) throw error;
            setMemories(data || []);
        } catch (err) {
            console.error('[MemoryApp] Gagal memuat memori:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadMemories();
    }, [searchQuery]);

    const handleDelete = async (memoryId) => {
        if (deletingId) return;
        setDeletingId(memoryId);
        try {
            const { error } = await supabase.from('user_memories').delete().eq('id', memoryId);
            if (error) throw error;
            setMemories(prev => prev.filter(m => m.id !== memoryId));
        } catch (err) {
            console.error('[MemoryApp] Gagal menghapus:', err);
        } finally {
            setDeletingId(null);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        loadMemories();
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div className="h-full bg-slate-950 text-white p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-500/20 rounded-lg border border-purple-500/30">
                        <Brain className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Memory App
                        </h1>
                        <p className="text-xs text-slate-400">User Memory Management</p>
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Search */}
            <div className="mb-6">
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 focus-within:border-purple-500/50 transition-colors">
                    <Search className="w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Cari memori..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
                    />
                </div>
            </div>

            {/* Memory List */}
            {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Memuat memori...
                </div>
            ) : memories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                    <Brain className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-sm">Belum ada memori</p>
                    <p className="text-xs mt-1">Chat dengan Mamet untuk menyimpan memori</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {memories.map(memory => (
                        <div
                            key={memory.id}
                            className="flex items-start justify-between bg-slate-900/50 border border-slate-800 rounded-lg p-4 hover:border-purple-500/30 transition-all group"
                        >
                            <div className="flex-1 min-w-0 mr-3">
                                <p className="text-sm text-slate-200 break-words">{memory.summary}</p>
<div className="flex items-center gap-3 mt-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${memory.memory_state === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                                        }`}>
                                        {memory.memory_state || 'ACTIVE'}
                                    </span>
                                    {memory.memory_type && (
                                        <span className="text-[10px] text-slate-500">{memory.memory_type}</span>
                                    )}
                                    <span className="text-[10px] text-slate-500">{memory.memory_hits || 0} hits</span>
                                    <span className="text-[10px] text-slate-600">{formatDate(memory.created_at)}</span>
                                </div>
                                {/* Golden Source Metadata (Fase 1) — graceful, hanya tampil jika ada */}
                                {(memory.source_reference || memory.version_code || memory.chat_id) && (
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        {memory.source_reference && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 truncate max-w-[200px]" title={memory.source_reference}>
                                                📎 {memory.source_reference}
                                            </span>
                                        )}
                                        {memory.version_code && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                                v{memory.version_code}
                                            </span>
                                        )}
                                        {memory.chat_id && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-400 border border-slate-600/30">
                                                💬 {memory.chat_id.substring(0, 8)}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => handleDelete(memory.id)}
                                disabled={deletingId === memory.id}
                                className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                title="Hapus memori"
                            >
                                {deletingId === memory.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Stats */}
            <div className="mt-6 text-center text-[10px] text-slate-600">
                {memories.length} memori
            </div>
        </div>
    );
}