import React, { useState, useEffect } from 'react';
import { Database, Activity, Target, ShieldCheck, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '../supabase';
import EngineerChat from './EngineerChat';

export default function EngineerDashboard({ userId }) {
  const [tasks, setTasks] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [memoryEntries, setMemoryEntries] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, gapsRes, memRes, verRes] = await Promise.all([
        supabase.from('engineering_tasks').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('architecture_gaps').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('project_memory_entries').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('verification_runs').select('*').order('created_at', { ascending: false }).limit(20)
      ]);
      // Surface DB-level errors explicitly
      const dbError = tasksRes.error || gapsRes.error || memRes.error || verRes.error;
      if (dbError) { setError(`DB Error: ${dbError.message}`); setLoading(false); return; }
      if (tasksRes.data) setTasks(tasksRes.data);
      if (gapsRes.data) setGaps(gapsRes.data);
      if (memRes.data) setMemoryEntries(memRes.data);
      if (verRes.data) setVerifications(verRes.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch engineer data:", err);
      setError(`Network Error: ${err.message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'done':
      case 'resolved':
      case 'verified':
      case 'pass':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'inprogress':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'open':
      case 'proposed':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-6">
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm max-w-md text-center">
          <p className="font-semibold mb-1">⚠️ Engineer Data Unavailable</p>
          <p className="text-xs text-red-300/70">{error}</p>
          <button onClick={fetchData} className="mt-3 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs transition-colors">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-slate-950 overflow-hidden">
      
      {/* LEFT PANEL: Dashboards */}
      <div className="w-full md:w-2/3 lg:w-3/4 h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 rounded-xl border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <Database className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
              Project Memory Core
            </h2>
            <p className="text-sm text-slate-400">Real-time observability of Mamet AI's engineering state</p>
          </div>
        </div>
        <button 
          onClick={fetchData} 
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 hover:border-slate-500 transition-all shadow-lg"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Syncing...' : 'Sync Data'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Active Engineering Tasks */}
        <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col h-[400px]">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <Target className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-slate-200">Engineering Tasks</h3>
            <span className="ml-auto text-xs font-mono text-slate-500">{tasks.length} items</span>
          </div>
          <div className="overflow-y-auto custom-scrollbar pr-2 space-y-3">
            {tasks.length === 0 && !loading && <p className="text-xs text-slate-600 text-center pt-4">No tasks found.</p>}
            {tasks.map(task => (
              <div key={task.id} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-blue-500/30 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-blue-400/80 font-bold">{task.task_number}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(task.status)}`}>
                    {task.status}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-slate-200 mb-1">{task.title}</h4>
                <p className="text-xs text-slate-400 line-clamp-2">{task.goal}</p>
                <div className="mt-3 flex gap-2">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    Phase {task.phase}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Architecture Gaps */}
        <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col h-[400px]">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <Activity className="w-5 h-5 text-rose-400" />
            <h3 className="text-lg font-semibold text-slate-200">Architecture Gaps</h3>
            <span className="ml-auto text-xs font-mono text-slate-500">{gaps.length} items</span>
          </div>
          <div className="overflow-y-auto custom-scrollbar pr-2 space-y-3">
            {gaps.map(gap => (
              <div key={gap.id} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-rose-500/30 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-rose-400/80 font-bold">{gap.gap_number}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(gap.status)}`}>
                    {gap.status}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-slate-200 mb-1">{gap.title}</h4>
                <p className="text-xs text-slate-400 line-clamp-2">{gap.description}</p>
                {gap.related_task && (
                  <div className="mt-2 text-[10px] text-slate-500">Relates to: {gap.related_task}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Project Memory Feed */}
        <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col h-[400px]">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <Database className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-slate-200">Memory Feed</h3>
            <span className="ml-auto text-xs font-mono text-slate-500">{memoryEntries.length} items</span>
          </div>
          <div className="overflow-y-auto custom-scrollbar pr-2 space-y-3">
            {memoryEntries.map(entry => (
              <div key={entry.id} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-purple-500/30 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-mono text-purple-400/80 bg-purple-500/10 px-2 py-0.5 rounded">{entry.entry_type}</span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-slate-200 mb-1">{entry.title}</h4>
                <p className="text-xs text-slate-400 line-clamp-3 mb-2 leading-relaxed">{entry.content}</p>
                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {entry.tags.map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded-md">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Verification Runs */}
        <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col h-[400px]">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-slate-200">Verification Log</h3>
            <span className="ml-auto text-xs font-mono text-slate-500">{verifications.length} items</span>
          </div>
          <div className="overflow-y-auto custom-scrollbar pr-2 space-y-3">
            {verifications.map(run => (
              <div key={run.id} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-emerald-500/30 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-mono text-slate-300 font-bold">{run.related_task}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(run.result)}`}>
                    {run.result}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-md text-slate-300">{run.verification_type}</span>
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">{run.evidence}</p>
                {run.command_used && (
                  <div className="mt-3 p-2 bg-slate-900 rounded border border-slate-800 font-mono text-[9px] text-slate-500 break-all">
                    $ {run.command_used}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
        {lastUpdated && (
          <div className="text-center mt-6 text-[10px] text-slate-600 shrink-0">
            Last synced: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Engineer Chat */}
      <div className="w-full md:w-1/3 lg:w-1/4 h-full shrink-0 border-t md:border-t-0 md:border-l border-slate-800">
        <EngineerChat userId={userId} />
      </div>
    </div>
  );
}
