import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, AlertTriangle, Cpu, Clock, Database, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabase';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';

export default function ObservabilityDashboard() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Metrics
  const [metrics, setMetrics] = useState({
    totalRequests: 0,
    totalLlmCalls: 0,
    avgLatency: 0,
    totalMemoryReads: 0,
    totalMemoryWrites: 0,
    alertCount: 0,
    errorCount: 0
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
        
      if (error) throw error;
      
      const formattedLogs = (data || []).map(log => ({
        ...log,
        time: new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date(log.created_at).toLocaleDateString()
      }));
      
      setLogs(formattedLogs.reverse()); // Reverse for chronological charting
      
      // Calculate Metrics
      if (data && data.length > 0) {
        setMetrics({
          totalRequests: data.length,
          totalLlmCalls: data.reduce((acc, curr) => acc + curr.llm_call_count, 0),
          avgLatency: Math.round(data.reduce((acc, curr) => acc + curr.latency_ms, 0) / data.length),
          totalMemoryReads: data.reduce((acc, curr) => acc + curr.memory_fetch_count, 0),
          totalMemoryWrites: data.reduce((acc, curr) => acc + curr.memory_write_count, 0),
          alertCount: data.filter(d => d.cost_alert_flag).length,
          errorCount: data.filter(d => d.error_flag).length
        });
      }
    } catch (error) {
      console.error('Error fetching observability data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-900/50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <Activity className="w-6 h-6 text-emerald-400" />
              Mamet AI Observability
            </h2>
            <p className="text-slate-400 mt-1 text-sm">
              Real-time pemantauan performa dan perlindungan biaya operasi AI. (Tanpa penggunaan AI).
            </p>
          </div>
          <button 
            onClick={fetchData}
            className="flex items-center gap-2 p-2 px-4 text-slate-300 hover:text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} /> Refresh Data
          </button>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Cpu className="w-12 h-12" /></div>
            <p className="text-xs text-slate-400 font-semibold mb-1">TOTAL REQUESTS</p>
            <h3 className="text-3xl font-bold text-white">{metrics.totalRequests}</h3>
            <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> 100% LLM Call = {metrics.totalLlmCalls}</p>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Clock className="w-12 h-12" /></div>
            <p className="text-xs text-slate-400 font-semibold mb-1">AVG LATENCY</p>
            <h3 className="text-3xl font-bold text-white">{metrics.avgLatency}<span className="text-sm font-normal text-slate-500 ml-1">ms</span></h3>
            <p className="text-xs text-blue-400 mt-2">Performa respons server</p>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Database className="w-12 h-12" /></div>
            <p className="text-xs text-slate-400 font-semibold mb-1">MEMORY (R/W)</p>
            <h3 className="text-3xl font-bold text-white">{metrics.totalMemoryReads} <span className="text-slate-500 text-lg">/</span> {metrics.totalMemoryWrites}</h3>
            <p className="text-xs text-purple-400 mt-2">Pembacaan & Penulisan Konteks</p>
          </div>
          <div className={`bg-slate-800/80 border ${metrics.alertCount > 0 ? 'border-amber-500/50' : 'border-slate-700'} p-4 rounded-xl shadow-lg relative overflow-hidden`}>
            <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle className="w-12 h-12" /></div>
            <p className="text-xs text-slate-400 font-semibold mb-1">COST ALERTS</p>
            <h3 className={`text-3xl font-bold ${metrics.alertCount > 0 ? 'text-amber-400' : 'text-white'}`}>{metrics.alertCount}</h3>
            <p className="text-xs text-slate-500 mt-2">Deteksi pemborosan LLM</p>
          </div>
        </div>

        {/* Charts */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 shadow-lg">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> Response Time & Load
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={logs} margin={{ top: 5, right: 0, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" fontSize={10} minTickGap={30} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: '8px' }}
                  itemStyle={{ color: '#34d399' }}
                  labelStyle={{ color: '#cbd5e1' }}
                />
                <Area type="monotone" dataKey="latency_ms" name="Latency (ms)" stroke="#10b981" fillOpacity={1} fill="url(#colorLatency)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl shadow-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/80">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Log Eksekusi Terakhir</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-5 py-3">Waktu</th>
                  <th className="px-5 py-3">Model</th>
                  <th className="px-5 py-3 text-center">LLM Calls</th>
                  <th className="px-5 py-3 text-center">Mem (R/W)</th>
                  <th className="px-5 py-3 text-right">Latency</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50 text-slate-300">
                {[...logs].reverse().map((log) => (
                  <tr key={log.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="font-medium text-slate-200">{log.time}</div>
                      <div className="text-[10px] text-slate-500">{log.date}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="bg-slate-700 px-2 py-1 rounded text-xs text-slate-300 font-mono">{log.model_used}</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`font-bold ${log.llm_call_count > 1 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {log.llm_call_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center font-mono text-xs text-slate-400">
                      {log.memory_fetch_count} / {log.memory_write_count}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`${log.latency_ms > 8000 ? 'text-amber-400 font-semibold' : 'text-slate-400'}`}>
                        {log.latency_ms}ms
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {log.error_flag ? (
                        <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-[10px] uppercase font-bold">Error</span>
                      ) : log.cost_alert_flag ? (
                        <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded text-[10px] uppercase font-bold">Alert</span>
                      ) : (
                        <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-[10px] uppercase font-bold">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && !loading && (
                  <tr>
                    <td colSpan="6" className="px-5 py-8 text-center text-slate-500">
                      Belum ada log observasi yang terekam. Cobalah kirim pesan ke Mamet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
