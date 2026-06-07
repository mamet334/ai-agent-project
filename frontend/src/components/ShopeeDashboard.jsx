import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, Trash2, Check, ExternalLink, RefreshCw, Clock } from 'lucide-react';
import { supabase } from '../supabase';

export default function ShopeeDashboard() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formName, setFormName] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shopee_queue')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setQueue(data || []);
    } catch (error) {
      console.error('Error fetching shopee queue:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleAddQueue = async (e) => {
    e.preventDefault();
    if (!formUrl) return;
    
    try {
      const { error } = await supabase.from('shopee_queue').insert({
        original_url: formUrl,
        product_name: formName || 'Produk Shopee',
        status: 'pending'
      });
      if (error) throw error;
      
      setFormName('');
      setFormUrl('');
      setIsAddOpen(false);
      fetchData();
    } catch (error) {
      alert('Gagal menambah antrean: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin ingin menghapus link ini dari antrean?')) return;
    try {
      const { error } = await supabase.from('shopee_queue').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      alert('Gagal menghapus: ' + error.message);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-900/50">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <ShoppingBag className="w-6 h-6 text-orange-400" />
              Shopee Affiliate Ninja
            </h2>
            <p className="text-slate-400 mt-2 text-sm">
              Antrean link promosi Shopee. Bot akan mengambil dan mempostingnya secara otomatis di latar belakang.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchData}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-orange-400' : ''}`} />
            </button>
            <button 
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-orange-500/20 transition-all"
            >
              <Plus className="w-4 h-4" /> Tambah Link Baru
            </button>
          </div>
        </div>

        {/* Form Modal */}
        {isAddOpen && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4">
            <h3 className="text-lg font-bold text-white mb-4">Tambah Antrean Shopee</h3>
            <form onSubmit={handleAddQueue} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-400 mb-1">Nama Produk (Opsional)</label>
                <input 
                  type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none text-white"
                  placeholder="Misal: Kipas Mini"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-400 mb-1">URL Shopee</label>
                <input 
                  type="url" required value={formUrl} onChange={e => setFormUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-orange-500 outline-none text-white"
                  placeholder="https://shopee.co.id/..."
                />
              </div>
              <div className="md:col-span-4 flex justify-end gap-3 mt-2">
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Batal</button>
                <button type="submit" className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg">Simpan ke Antrean</button>
              </div>
            </form>
          </div>
        )}

        {/* List Antrean */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <h3 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            Daftar Antrean & Riwayat Posting
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Nama Produk</th>
                  <th className="py-3 px-4 font-semibold">URL Asli</th>
                  <th className="py-3 px-4 font-semibold">Tanggal Masuk</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500 italic">
                      Tidak ada antrean link.
                    </td>
                  </tr>
                ) : (
                  queue.map((item) => (
                    <tr key={item.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                      <td className="py-3 px-4">
                        {item.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                            <Clock className="w-3 h-3" /> PENDING
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <Check className="w-3 h-3" /> POSTED
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-200 font-medium">
                        {item.product_name || 'Tanpa Nama'}
                      </td>
                      <td className="py-3 px-4">
                        <a href={item.original_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 max-w-[250px] truncate" title={item.original_url}>
                          {item.original_url.substring(0, 40)}...
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-xs">
                        {new Date(item.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-md transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
