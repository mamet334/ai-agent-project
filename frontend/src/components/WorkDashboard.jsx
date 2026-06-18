import React, { useState, useEffect } from 'react';
import { Briefcase, CheckSquare, Calendar, BookOpen, FileText, RefreshCw } from 'lucide-react';
import { supabase } from '../supabase';

export default function WorkDashboard() {
  const [metrics, setMetrics] = useState({
    activeProjects: 0,
    openTasks: 0,
    upcomingDeadlines: 0,
    researchNotes: 0,
    reportsGenerated: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch data from memory audit logs to infer work metrics based on events
      const { data: auditData, error: auditError } = await supabase
        .from('memory_audit_logs')
        .select('event_type, query')
        .order('created_at', { ascending: false });
        
      if (auditError) throw auditError;

      // Count operations
      const reportsCount = auditData?.filter(d => d.event_type === 'report_generation').length || 0;
      
      // We can also query user_memories directly for accurate current counts
      const { data: memoryData, error: memoryError } = await supabase
        .from('user_memories')
        .select('summary')
        .order('created_at', { ascending: false });
        
      if (memoryError) throw memoryError;

      // Classify memories based on smart regex rules
      let projects = 0;
      let tasks = 0;
      let deadlines = 0;
      let research = 0;

      if (memoryData) {
        memoryData.forEach(mem => {
          const lower = mem.summary.toLowerCase();
          if (lower.includes('project')) projects++;
          else if (lower.includes('tugas') || lower.includes('harus selesai')) tasks++;
          else if (lower.includes('deadline') || lower.includes('tenggat waktu')) deadlines++;
          else if (lower.includes('riset') || lower.includes('catatan')) research++;
        });
      }

      setMetrics({
        activeProjects: projects,
        openTasks: tasks,
        upcomingDeadlines: deadlines,
        researchNotes: research,
        reportsGenerated: reportsCount
      });

    } catch (error) {
      console.error('Error fetching work metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-900/50">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <Briefcase className="w-6 h-6 text-blue-400" />
              Work Tracking Dashboard
            </h2>
            <p className="text-slate-400 mt-1 text-sm">
              Rekapitulasi beban kerja, proyek, dan analisis riset Anda.
            </p>
          </div>
          <button onClick={fetchData} className="flex items-center gap-2 p-2 px-4 text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl shadow-lg relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Briefcase className="w-24 h-24" /></div>
            <p className="text-xs text-slate-400 font-semibold mb-2">ACTIVE PROJECTS</p>
            <h3 className="text-4xl font-bold text-blue-400">{metrics.activeProjects}</h3>
          </div>
          
          <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl shadow-lg relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><CheckSquare className="w-24 h-24" /></div>
            <p className="text-xs text-slate-400 font-semibold mb-2">OPEN TASKS</p>
            <h3 className="text-4xl font-bold text-emerald-400">{metrics.openTasks}</h3>
          </div>
          
          <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl shadow-lg relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><Calendar className="w-24 h-24" /></div>
            <p className="text-xs text-slate-400 font-semibold mb-2">UPCOMING DEADLINES</p>
            <h3 className="text-4xl font-bold text-amber-400">{metrics.upcomingDeadlines}</h3>
          </div>
          
          <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl shadow-lg relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><BookOpen className="w-24 h-24" /></div>
            <p className="text-xs text-slate-400 font-semibold mb-2">RESEARCH NOTES</p>
            <h3 className="text-4xl font-bold text-purple-400">{metrics.researchNotes}</h3>
          </div>
          
          <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-xl shadow-lg relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity"><FileText className="w-24 h-24" /></div>
            <p className="text-xs text-slate-400 font-semibold mb-2">REPORTS GENERATED</p>
            <h3 className="text-4xl font-bold text-pink-400">{metrics.reportsGenerated}</h3>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 shadow-lg flex items-center justify-center h-48">
          <p className="text-slate-500 text-sm">Integrasi kalender dan detail task akan tampil di sini (Coming Soon).</p>
        </div>

      </div>
    </div>
  );
}
