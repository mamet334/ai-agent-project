import React, { useState, useEffect } from 'react';
import { Activity, Plus, Trash2, Check, AlertTriangle, RefreshCw, Server, ExternalLink } from 'lucide-react';
import { supabase } from '../supabase';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function MonitoringDashboard() {
  const [monitors, setMonitors] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formName, setFormName] = useState('');
  const [formInterval, setFormInterval] = useState(900); // Default 15 menit

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Monitors
      const { data: monitorsData, error: monitorsError } = await supabase
        .from('monitors')
        .select('*')
        .order('created_at', { ascending: false });
      if (monitorsError) throw monitorsError;
      
      // Fetch Incidents
      const { data: incidentsData, error: incidentsError } = await supabase
        .from('incidents')
        .select('*, monitors(name)')
        .order('started_at', { ascending: false })
        .limit(20);
      if (incidentsError) throw incidentsError;

      // Fetch Checks for Chart
      const { data: checksData, error: checksError } = await supabase
        .from('checks')
        .select('*, monitors(name)')
        .order('checked_at', { ascending: false })
        .limit(100);
      if (checksError) throw checksError;

      setMonitors(monitorsData || []);
      setIncidents(incidentsData || []);
      
      // Format checks for chart (reverse to chronological order)
      const formattedChecks = (checksData || []).map(check => ({
        ...check,
        time: new Date(check.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        name: check.monitors?.name || 'Unknown'
      })).reverse();
      
      setChecks(formattedChecks);
    } catch (error) {
      console.error('Error fetching monitoring data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto refresh every minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleAddMonitor = async (e) => {
    e.preventDefault();
    if (!formUrl || !formName) return;
    
    try {
      const { error } = await supabase.from('monitors').insert({
        name: formName,
        url: formUrl,
        interval_sec: parseInt(formInterval),
        active: true
      });
      if (error) throw error;
      
      setFormName('');
      setFormUrl('');
      setIsAddOpen(false);
      fetchData();
    } catch (error) {
      alert('Gagal menambah monitor: ' + error.message);
    }
  };

  const handleDeleteMonitor = async (id) => {
    if (!window.confirm('Yakin ingin menghapus pemantauan ini? Semua history uptime juga akan terhapus.')) return;
    try {
      const { error } = await supabase.from('monitors').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      alert('Gagal menghapus: ' + error.message);
    }
  };

  const toggleActive = async (id, currentStatus) => {
    try {
      const { error } = await supabase.from('monitors').update({ active: !currentStatus }).eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Toggle error:', error);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-900/50">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <Activity className="w-6 h-6 text-blue-400" />
              Traffic Light Router Dashboard
            </h2>
            <p className="text-slate-400 mt-2 text-sm">
              Pantau uptime dan latensi layanan Mamet dan aplikasi web lain.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchData}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <button 
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-blue-500/20 transition-all"
            >
              <Plus className="w-4 h-4" /> Tambah Monitor
            </button>
          </div>
        </div>

        {/* Form Modal */}
        {isAddOpen && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4">
            <h3 className="text-lg font-bold text-white mb-4">Tambah Target Pemantauan</h3>
            <form onSubmit={handleAddMonitor} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-400 mb-1">Nama Aplikasi</label>
                <input 
                  type="text" required value={formName} onChange={e => setFormName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none text-white"
                  placeholder="Misal: Mamet Web App"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">URL / Endpoint</label>
                <input 
                  type="url" required value={formUrl} onChange={e => setFormUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none text-white"
                  placeholder="https://google.com"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-400 mb-1">Interval Cek (Detik)</label>
                <select 
                  value={formInterval} onChange={e => setFormInterval(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none text-white"
                >
                  <option value={300}>5 Menit</option>
                  <option value={900}>15 Menit</option>
                  <option value={1800}>30 Menit</option>
                  <option value={3600}>1 Jam</option>
                </select>
              </div>
              <div className="md:col-span-4 flex justify-end gap-3 mt-2">
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Batal</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">Simpan</button>
              </div>
            </form>
          </div>
        )}

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {monitors.map(monitor => {
            const isDown = incidents.some(inc => inc.monitor_id === monitor.id && inc.status === 'DOWN');
            
            return (
              <div key={monitor.id} className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg relative overflow-hidden group">
                <div className={`absolute top-0 left-0 w-1 h-full ${!monitor.active ? 'bg-slate-600' : isDown ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      {monitor.name}
                      <a href={monitor.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-blue-400">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </h3>
                    <p className="text-xs text-slate-400 truncate max-w-[200px]" title={monitor.url}>{monitor.url}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button 
                      onClick={() => toggleActive(monitor.id, monitor.active)}
                      className={`text-[10px] px-2 py-1 rounded-full font-medium border ${monitor.active ? 'bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-500' : 'bg-slate-800 text-slate-500 border-slate-700'}`}
                    >
                      {monitor.active ? 'Active' : 'Paused'}
                    </button>
                    <button onClick={() => handleDeleteMonitor(monitor.id)} className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {!monitor.active ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-500"><Server className="w-4 h-4"/> PAUSED</span>
                    ) : isDown ? (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-red-400"><AlertTriangle className="w-4 h-4"/> DOWN</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400"><Check className="w-4 h-4"/> ONLINE</span>
                    )}
                  </div>
                  
                  {monitor.active && (
                    <div className="text-xs text-slate-500 border-l border-slate-700 pl-4">
                      Cek tiap {monitor.interval_sec / 60} menit
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Charts & Logs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Chart Section */}
          <div className="col-span-1 lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-xl p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" /> Response Time (Latensi)
            </h3>
            
            {checks.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg">
                Belum ada data riwayat ping.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={checks} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={10} minTickGap={30} />
                    <YAxis stroke="#64748b" fontSize={10} unit="ms" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '8px' }}
                      itemStyle={{ color: '#93c5fd' }}
                      labelStyle={{ color: '#cbd5e1', marginBottom: '4px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="response_time_ms" 
                      name="Latensi (ms)" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6, fill: '#3b82f6', stroke: '#1e293b' }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Incidents Log */}
          <div className="col-span-1 bg-slate-800/50 border border-slate-700 rounded-xl p-5 shadow-lg flex flex-col">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" /> Riwayat Insiden
            </h3>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 max-h-64">
              {incidents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm py-8">
                  <Check className="w-8 h-8 text-emerald-500/50 mb-2" />
                  Semua sistem aman terkendali.
                </div>
              ) : (
                incidents.map(inc => (
                  <div key={inc.id} className={`p-3 rounded-lg border ${inc.status === 'DOWN' ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-slate-200">
                        {inc.monitors?.name || 'Unknown'}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${inc.status === 'DOWN' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {inc.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 flex flex-col gap-0.5 mt-1.5">
                      <span>Mulai: {new Date(inc.started_at).toLocaleString()}</span>
                      {inc.resolved_at && <span>Selesai: {new Date(inc.resolved_at).toLocaleString()}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
