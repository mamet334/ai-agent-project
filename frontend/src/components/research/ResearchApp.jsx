import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { kernel } from '../../core/runtime/Kernel';
import { Search, Upload, Trash2, FileText, Loader2, Database, PlusCircle } from 'lucide-react';

export default function ResearchApp() {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [knowledgeSpaces, setKnowledgeSpaces] = useState([]);
    const [selectedSpace, setSelectedSpace] = useState(null);

    // Load knowledge spaces
    const loadSpaces = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data, error } = await supabase
                .from('knowledge_spaces')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setKnowledgeSpaces(data || []);
            if (data && data.length > 0 && !selectedSpace) {
                setSelectedSpace(data[0].id);
            }
        } catch (err) {
            console.error('[ResearchApp] Gagal memuat spaces:', err);
        }
    };

    // Load documents
    const loadDocuments = async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            let query = supabase.from('documents').select('*').eq('user_id', session.user.id);
            if (selectedSpace) {
                query = query.eq('space_id', selectedSpace);
            }
            if (searchQuery.trim()) {
                query = query.ilike('title', `%${searchQuery.trim()}%`);
            }

            const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
            if (error) throw error;
            setDocuments(data || []);
        } catch (err) {
            console.error('[ResearchApp] Gagal memuat dokumen:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSpaces();
    }, []);

    useEffect(() => {
        loadDocuments();
    }, [selectedSpace, searchQuery]);

    // Upload document
    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // GUNAKAN SPACE YANG SUDAH ADA (hardcoded ID dari database)
        const DEFAULT_SPACE_ID = '58dba6bd-293e-4a8e-8692-a38dd6f7c41b';
        
        // Jika selectedSpace belum di-set, gunakan default
        if (!selectedSpace) {
          setSelectedSpace(DEFAULT_SPACE_ID);
        }
        
        const targetSpace = selectedSpace || DEFAULT_SPACE_ID;

        setUploading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            // Baca file sebagai teks
            const text = await file.text();

            // Insert ke documents
            const { data: doc, error: docError } = await supabase
                .from('documents')
                .insert({
                    user_id: session.user.id,
                    title: file.name,
                    space_id: targetSpace
                })
                .select('id')
                .single();

            if (docError) throw docError;

            // Insert ke document_chunks (simpan konten sebagai satu chunk)
            const { error: chunkError } = await supabase
                .from('document_chunks')
                .insert({
                    document_id: doc.id,
                    content: text.substring(0, 5000) // Batasi 5000 karakter
                });

            if (chunkError) throw chunkError;

            loadDocuments();
        } catch (err) {
            console.error('[ResearchApp] Gagal upload:', err);
            alert('Gagal mengunggah dokumen: ' + err.message);
        } finally {
            setUploading(false);
        }
    };

    // Delete document
    const handleDelete = async (docId) => {
        if (deletingId) return;
        setDeletingId(docId);
        try {
            // Hapus chunks dulu
            await supabase.from('document_chunks').delete().eq('document_id', docId);
            // Hapus dokumen
            await supabase.from('documents').delete().eq('id', docId);
            setDocuments(prev => prev.filter(d => d.id !== docId));
        } catch (err) {
            console.error('[ResearchApp] Gagal menghapus:', err);
        } finally {
            setDeletingId(null);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div className="h-full bg-slate-950 text-white p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-500/20 rounded-lg border border-blue-500/30">
                        <Database className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            Research App
                        </h1>
                        <p className="text-xs text-slate-400">Knowledge Base Management</p>
                    </div>
                </div>

                {/* Upload Button */}
                <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer transition-colors text-sm">
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Mengunggah...' : 'Upload Dokumen'}
                    <input type="file" className="hidden" onChange={handleUpload} accept=".txt,.md,.csv,.json,.html,.xml" />
                </label>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 focus-within:border-blue-500/50 transition-colors">
                    <Search className="w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Cari dokumen..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
                    />
                </div>
            </div>

            {/* Knowledge Spaces */}
            {knowledgeSpaces.length > 0 && (
                <div className="mb-6 flex gap-2 flex-wrap">
                    {knowledgeSpaces.map(space => (
                        <button
                            key={space.id}
                            onClick={() => setSelectedSpace(space.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${selectedSpace === space.id
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                        >
                            {space.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Document List */}
            {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Memuat dokumen...
                </div>
            ) : documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                    <FileText className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-sm">Belum ada dokumen</p>
                    <p className="text-xs mt-1">Upload dokumen untuk memulai research</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {documents.map(doc => (
                        <div
                            key={doc.id}
                            className="flex items-center justify-between bg-slate-900/50 border border-slate-800 rounded-lg p-4 hover:border-blue-500/30 transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                                <div>
                                    <p className="text-sm text-slate-200">{doc.title}</p>
                                    <p className="text-[10px] text-slate-500">{formatDate(doc.created_at)}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(doc.id)}
                                disabled={deletingId === doc.id}
                                className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                title="Hapus dokumen"
                            >
                                {deletingId === doc.id ? (
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
                {documents.length} dokumen • {knowledgeSpaces.length} spaces
            </div>
        </div>
    );
}