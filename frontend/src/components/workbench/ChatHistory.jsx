import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { MessageSquare, PlusCircle, Trash2, Loader2 } from 'lucide-react';

/**
 * ChatHistory - Sidebar riwayat percakapan
 * Menampilkan daftar chat dari Supabase, memungkinkan user memilih, membuat, dan menghapus chat.
 *
 * @param {Object} props
 * @param {Function} props.onSelectChat - Callback saat user memilih chat. Menerima chatId.
 * @param {Function} props.onNewChat - Callback saat user klik "Percakapan Baru"
 * @param {string} props.activeChatId - ID chat yang sedang aktif (untuk highlight)
 * @param {boolean} props.collapsed - Apakah sidebar dalam mode collapsed (hanya ikon)
 */
export default function ChatHistory({ onSelectChat, onNewChat, activeChatId,  activeWorkspace, collapsed = false }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchChats = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setChats([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('chats')
        .select('id, title, created_at, updated_at, workspace_type')
        .eq('workspace_type', activeWorkspace)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setChats(data || []);
    } catch (err) {
      console.error('[ChatHistory] Gagal memuat riwayat:', err);
      setError('Gagal memuat riwayat');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChats();

    // Dengarkan event storage untuk refresh jika ada perubahan dari tab lain
    const handleStorageChange = (e) => {
      if (e.key === 'mamet_chat_update') {
        fetchChats();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [activeWorkspace]);

  // Refresh saat activeChatId berubah — hanya update judul chat di list tanpa fetch ulang penuh
  useEffect(() => {
    if (activeChatId) {
      // Update judul chat di state lokal tanpa fetch ulang dari DB
      setChats(prev => prev.map(c => ({
        ...c,
        isActive: c.id === activeChatId
      })));
    }
  }, [activeChatId]);

  const handleDelete = async (chatId) => {
    if (deletingId) return;
    setDeletingId(chatId);
    try {
      const { error } = await supabase.from('chats').delete().eq('id', chatId);
      if (error) throw error;

      // Jika chat yang dihapus adalah chat aktif, trigger new chat
      if (activeChatId === chatId && onNewChat) {
        onNewChat();
      }

      // Hapus dari state lokal tanpa fetch ulang
      setChats(prev => prev.filter(c => c.id !== chatId));

      // Trigger refresh di tab lain
      localStorage.setItem('mamet_chat_update', Date.now().toString());
    } catch (err) {
      console.error('[ChatHistory] Gagal menghapus:', err);
      // Refresh untuk memastikan state konsisten
      fetchChats();
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Kemarin';
    } else if (diffDays < 7) {
      return `${diffDays} hari lalu`;
    } else {
      return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    }
  };

  // Mode collapsed: hanya tampilkan tombol baru chat + ikon
  if (collapsed) {
    return (
      <div className="flex flex-col items-center h-full bg-surface-container-low border-r border-outline-variant py-3 px-1 space-y-3 w-16 shrink-0">
        <button
          onClick={onNewChat}
          className="p-2 rounded-lg hover:bg-surface-variant text-on-surface-variant hover:text-on-surface transition-colors"
          title="Percakapan Baru"
        >
          <span className="material-symbols-outlined">add_circle</span>
        </button>
        <div className="flex-1 overflow-y-auto space-y-1 w-full flex flex-col items-center custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-2">
              <Loader2 size={14} className="animate-spin text-on-surface-variant" />
            </div>
          ) : (
            chats.map(chat => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                  chat.id === activeChatId
                    ? 'bg-secondary-container text-primary border-l-2 border-primary'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-variant'
                }`}
                title={chat.title || 'Percakapan Baru'}
              >
                <span className="material-symbols-outlined text-[20px]">chat_bubble</span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // Mode penuh: tampilkan judul, tombol baru, daftar chat lengkap
  return (
    <div className="flex flex-col h-full bg-surface-container-low border-r border-outline-variant w-64 shrink-0 font-body-base">
      {/* Header */}
      <div className="p-4 border-b border-outline-variant">
        <button
          onClick={onNewChat}
          className="flex items-center justify-center gap-2 w-full p-2.5 rounded-xl border border-outline-variant hover:bg-surface-variant text-on-surface transition-colors font-semibold"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          Percakapan Baru
        </button>
      </div>

      {/* Daftar Chat */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-on-surface-variant">
            <Loader2 size={18} className="animate-spin mr-2" />
            <span className="text-body-sm">Memuat riwayat...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-body-sm text-error mb-2">{error}</p>
            <button
              onClick={fetchChats}
              className="text-body-sm text-primary hover:underline"
            >
              Coba lagi
            </button>
          </div>
        ) : chats.length === 0 ? (
          <div className="text-center py-8 text-on-surface-variant">
            <span className="material-symbols-outlined text-[32px] mx-auto mb-2 opacity-50">chat_bubble</span>
            <p className="text-body-sm">Belum ada percakapan</p>
          </div>
        ) : (
          chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                chat.id === activeChatId
                  ? 'bg-secondary-container text-on-secondary-container border border-primary/20'
                  : 'hover:bg-surface-variant border border-transparent text-on-surface-variant'
              }`}
            >
              <span className={`material-symbols-outlined text-[18px] shrink-0 ${chat.id === activeChatId ? 'text-primary' : ''}`}>chat_bubble</span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-body-sm truncate ${
                    chat.id === activeChatId ? 'font-semibold text-on-surface' : 'text-on-surface-variant group-hover:text-on-surface'
                  }`}
                >
                  {chat.title || 'Percakapan Baru'}
                </p>
                <p className="text-[10px] text-on-surface-variant mt-0.5 opacity-70">
                  {formatDate(chat.updated_at || chat.created_at)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(chat.id);
                }}
                disabled={deletingId === chat.id}
                className="p-1.5 rounded-md text-on-surface-variant hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                title="Hapus percakapan"
              >
                {deletingId === chat.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                )}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-outline-variant text-center">
        <p className="text-label-mono text-[10px] text-on-surface-variant tracking-widest uppercase">
          {chats.length} Percakapan
        </p>
      </div>
    </div>
  );
}