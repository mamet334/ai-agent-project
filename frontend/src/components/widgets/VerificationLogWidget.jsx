import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { kernel } from '../../core/runtime/Kernel';

export default function VerificationLogWidget() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from('verification_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setLogs(data); 
      setLoading(false);
    };
    fetchLogs();
  }, []);

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'pass': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
      case 'fail': return 'text-red-400 border-red-500/20 bg-red-500/10';
      default: return 'text-slate-400 border-slate-500/20 bg-slate-500/10';
    }
  };

  if (loading) return <div className="p-4 text-xs text-slate-500">Loading logs...</div>;

  return (
    <div className="space-y-2">
      {logs.length === 0 && <p className="text-xs text-slate-600 text-center py-2">No verification logs.</p>}
      {logs.map(log => (
        <div key={log.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/30 transition-colors">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-mono text-slate-300 font-bold">{log.related_task}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${getStatusColor(log.result)}`}>
              {log.result}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 whitespace-pre-wrap font-mono">{log.evidence}</p>
        </div>
      ))}
    </div>
  );
}
