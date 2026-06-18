import React, { useState, useEffect } from 'react';
import { Database, AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw, BarChart2 } from 'lucide-react';
import { supabase } from '../supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

export default function MemoryHealthDashboard() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [metrics, setMetrics] = useState({
    totalSaved: 0,
    totalFailed: 0,
    successRate: 0,
    avgRetrievalTime: 0,
    topReasons: []
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('memory_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
        
      if (error) throw error;
      setLogs(data || []);
      
      if (data && data.length > 0) {
        const saves = data.filter(d => d.event_type === 'memory_save_success');
        const fails = data.filter(d => d.status === 'FAILED');
        const retrievals = data.filter(d => d.event_type === 'memory_retrieval_success' || d.event_type === 'deadline_lookup' || d.event_type === 'task_lookup' || d.event_type === 'report_generation');
        
        const totalAttempts = retrievals.length + data.filter(d => d.event_type === 'memory_retrieval_failed').length;
        const successRate = totalAttempts > 0 ? Math.round((retrievals.length / totalAttempts) * 100) : 100;
        
        const avgTime = retrievals.length > 0 
          ? Math.round(retrievals.reduce((acc, curr) => acc + curr.execution_time_ms, 0) / retrievals.length) 
          : 0;

        // Calculate top failure reasons
        const reasonsCount = {};
        fails.forEach(f => {
          if (f.reason) {
             reasonsCount[f.reason] = (reasonsCount[f.reason] || 0) + 1;
          }
        });
        const topReasons = Object.entries(reasonsCount)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 3);
        
        setMetrics({
          totalSaved: saves.length,
          totalFailed: fails.length,
          successRate,
          avgRetrievalTime: avgTime,
          topReasons
        });
      }
    } catch (error) {
      console.error('Error fetching memory audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const COLORS = ['#ef4444', '#f97316', '#eab308'];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-900/50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <Database className="w-6 h-6 text-purple-400" />
              Memory Health Dashboard
            </h2>
            <p className="text-slate-400 mt-1 text-sm">
              Memantau stabilitas sistem memori dan kebocoran konteks.
            </p>
          </div>
          <button onClick={fetchData} className="flex items-center gap-2 p-2 px-4 text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-400' : ''}`} /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl shadow-lg relative overflow-hidden">
            <CheckCircle className="absolute top-0 right-0 p-4 w-12 h-12 opacity-10" />
            <p className="text-xs text-slate-400 font-semibold mb-1">TOTAL MEMORY SAVED</p>
            <h3 className="text-3xl font-bold text-emerald-400">{metrics.totalSaved}</h3>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl shadow-lg relative overflow-hidden">
            <XCircle className="absolute top-0 right-0 p-4 w-12 h-12 opacity-10" />
            <p className="text-xs text-slate-400 font-semibold mb-1">TOTAL FAILED SAVES</p>
            <h3 className={`text-3xl font-bold ${metrics.totalFailed > 0 ? 'text-red-400' : 'text-slate-200'}`}>{metrics.totalFailed}</h3>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl shadow-lg relative overflow-hidden">
            <BarChart2 className="absolute top-0 right-0 p-4 w-12 h-12 opacity-10" />
            <p className="text-xs text-slate-400 font-semibold mb-1">RETRIEVAL SUCCESS RATE</p>
            <h3 className="text-3xl font-bold text-blue-400">{metrics.successRate}%</h3>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl shadow-lg relative overflow-hidden">
            <Clock className="absolute top-0 right-0 p-4 w-12 h-12 opacity-10" />
            <p className="text-xs text-slate-400 font-semibold mb-1">AVG RETRIEVAL TIME</p>
            <h3 className="text-3xl font-bold text-purple-400">{metrics.avgRetrievalTime}ms</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1 bg-slate-800/50 border border-slate-700 rounded-xl p-5 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Top Failure Reasons
            </h3>
            {metrics.topReasons.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Tidak ada kegagalan tercatat.</div>
            ) : (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metrics.topReasons} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value">
                      {metrics.topReasons.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 text-xs text-slate-400 flex flex-col gap-1">
                  {metrics.topReasons.map((r, i) => (
                    <div key={i} className="flex justify-between"><span>{r.name}</span> <span className="font-bold">{r.value}</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="col-span-1 lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-xl shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700 bg-slate-800/80">
              <h3 className="text-sm font-semibold text-slate-300 uppercase">Recent Memory Audit Logs</h3>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase sticky top-0">
                  <tr>
                    <th className="px-4 py-2">Waktu</th>
                    <th className="px-4 py-2">Event</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-center">Matched</th>
                    <th className="px-4 py-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-slate-300">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-700/20">
                      <td className="px-4 py-2 whitespace-nowrap text-[10px] text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</td>
                      <td className="px-4 py-2 font-mono text-xs">{log.event_type}</td>
                      <td className="px-4 py-2">
                        {log.status === 'SUCCESS' ? <span className="text-emerald-400">SUCCESS</span> : <span className="text-red-400" title={log.reason}>FAILED</span>}
                      </td>
                      <td className="px-4 py-2 text-center">{log.matched_memories || '-'}</td>
                      <td className="px-4 py-2 text-right">{log.execution_time_ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
