import React, { useState, useEffect } from 'react';
import { DollarSign, AlertTriangle, RefreshCw, BarChart2 } from 'lucide-react';
import { supabase } from '../supabase';

export default function BillingDashboard({ user }) {
  const [dailyCost, setDailyCost] = useState(0);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const DAILY_LIMIT = 0.50; // Sesuai limit di Edge Function

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Get daily total via RPC
      const { data: costData, error: costError } = await supabase.rpc('check_daily_quota', { target_user_id: user.id });
      if (!costError) {
        setDailyCost(Number(costData || 0));
      }

      // 2. Get logs table
      const { data: logsData, error: logsError } = await supabase
        .from('api_usage')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!logsError) {
        setLogs(logsData || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const percentage = Math.min((dailyCost / DAILY_LIMIT) * 100, 100);
  let progressColor = 'bg-emerald-500 shadow-emerald-500/50';
  if (percentage > 50) progressColor = 'bg-yellow-500 shadow-yellow-500/50';
  if (percentage > 80) progressColor = 'bg-red-500 shadow-red-500/50';

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-900/50">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <DollarSign className="w-6 h-6 text-emerald-400" />
              Billing & Quota Dashboard
            </h2>
            <p className="text-slate-400 mt-2 text-sm">
              Pantau pengeluaran token AI harian Anda agar dompet tidak kebobolan.
            </p>
          </div>
          <button 
            onClick={fetchData}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Quota Progress Bar */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl"></div>
          <div className="flex justify-between items-end mb-4 relative z-10">
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Pemakaian Hari Ini</h3>
              <div className="text-4xl font-black text-white tracking-tight">
                ${dailyCost.toFixed(3)} <span className="text-lg text-slate-500 font-medium">/ ${DAILY_LIMIT.toFixed(2)}</span>
              </div>
            </div>
            {percentage >= 100 && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20 animate-pulse">
                <AlertTriangle className="w-4 h-4" /> CIRCUIT BREAKER AKTIF
              </div>
            )}
          </div>
          
          <div className="w-full bg-slate-950 rounded-full h-4 mb-3 overflow-hidden border border-slate-700 relative z-10">
            <div className={`h-4 rounded-full transition-all duration-1000 shadow-lg ${progressColor}`} style={{ width: `${percentage}%` }}></div>
          </div>
          <p className="text-xs text-slate-400 relative z-10">
            <strong className="text-slate-300">{percentage.toFixed(1)}%</strong> dari batas aman harian. Limit akan di-reset setiap jam 00:00 UTC.
          </p>
        </div>

        {/* Logs Table */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-700 bg-slate-800/80 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-400" /> Riwayat Transaksi API
            </h3>
            <span className="text-xs text-slate-500">50 Transaksi Terakhir</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Waktu</th>
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-5 py-3 font-medium">Model</th>
                  <th className="px-5 py-3 font-medium text-right">Tokens (In/Out)</th>
                  <th className="px-5 py-3 font-medium text-right">Biaya ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <DollarSign className="w-8 h-8 text-slate-600 mb-2" />
                        Belum ada pemakaian token API tercatat.
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-800/50 transition-colors text-slate-300">
                      <td className="px-5 py-3 text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3 font-medium capitalize flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${log.provider === 'gemini' ? 'bg-blue-400' : log.provider === 'openai' ? 'bg-emerald-400' : log.provider === 'groq' ? 'bg-orange-400' : 'bg-purple-400'}`}></span>
                        {log.provider}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono text-slate-400">{log.model}</td>
                      <td className="px-5 py-3 text-right text-xs font-mono">
                        <span className="text-blue-400">{log.input_tokens}</span> / <span className="text-emerald-400">{log.output_tokens}</span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold text-emerald-400">
                        ${Number(log.cost_usd).toFixed(5)}
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
