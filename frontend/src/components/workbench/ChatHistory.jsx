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
export default function ChatHistory({ onSelectChat, onNewChat, activeChatId, collapsed = false }) {
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
  }, []);

  // Refresh saat activeChatId berubah (untuk update judul)
  useEffect(() => {
    if (activeChatId) {
      fetchChats();
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
      <div className="flex flex-col items-center h-full bg-slate-950 border-r border-slate-800 py-3 px-1 space-y-3 w-12 shrink-0">
        <button
          onClick={onNewChat}
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Percakapan Baru"
        >
          <PlusCircle size={18} />
        </button>
        <div className="flex-1 overflow-y-auto space-y-1 w-full">
          {loading ? (
            <div className="flex justify-center py-2">
              <Loader2 size={14} className="animate-spin text-slate-500" />
            </div>
          ) : (
            chats.map(chat => (
              <button
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`w-full p-2 rounded-lg transition-colors ${
                  chat.id === activeChatId
                    ? 'bg-slate-800 text-emerald-400'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                }`}
                title={chat.title || 'Percakapan Baru'}
              >
                <MessageSquare size={16} />
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // Mode penuh: tampilkan judul, tombol baru, daftar chat lengkap
  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800 w-64 shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-slate-800">
        <button
          onClick={onNewChat}
          className="flex items-center justify-center gap-2 w-full p-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 transition-colors text-sm font-medium"
        >
          <PlusCircle size={16} />
          Percakapan Baru
        </button>
      </div>

      {/* Daftar Chat */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 size={18} className="animate-spin mr-2" />
            <span className="text-xs">Memuat riwayat...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-xs text-red-400 mb-2">{error}</p>
            <button
              onClick={fetchChats}
              className="text-xs text-blue-400 hover:underline"
            >
              Coba lagi
            </button>
          </div>
        ) : chats.length === 0 ? (
          <div className="text-center py-8 text-slate-600">
            <MessageSquare size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">Belum ada percakapan</p>
          </div>
        ) : (
          chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`group flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all ${
                chat.id === activeChatId
                  ? 'bg-slate-800 border border-slate-700 shadow-sm'
                  : 'hover:bg-slate-900 border border-transparent'
              }`}
            >
              <MessageSquare
                size={14}
                className={`shrink-0 ${
                  chat.id === activeChatId ? 'text-emerald-400' : 'text-slate-500'
                }`}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs truncate ${
                    chat.id === activeChatId ? 'text-slate-200 font-medium' : 'text-slate-400'
                  }`}
                >
                  {chat.title || 'Percakapan Baru'}
                </p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {formatDate(chat.updated_at || chat.created_at)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(chat.id);
                }}
                disabled={deletingId === chat.id}
                className="p-1 rounded-md text-slate-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                title="Hapus percakapan"
              >
                {deletingId === chat.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-slate-800 text-center">
        <p className="text-[10px] text-slate-600">
          {chats.length} percakapan
        </p>
      </div>
    </div>
  );
}