import React, { useState, useEffect } from 'react';
import { Target } from 'lucide-react';
import { supabase } from '../../supabase';

export default function EngineeringTasksWidget() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from('engineering_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setTasks(data);
      setLoading(false);
    };
    fetchTasks();
  }, []);

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'done': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
      case 'inprogress': return 'text-blue-400 border-blue-500/20 bg-blue-500/10';
      default: return 'text-amber-400 border-amber-500/20 bg-amber-500/10';
    }
  };

  if (loading) return <div className="p-4 text-xs text-slate-500">Loading tasks...</div>;

  return (
    <div className="space-y-2">
      {tasks.length === 0 && <p className="text-xs text-slate-600 text-center py-2">No tasks found.</p>}
      {tasks.map(task => (
        <div key={task.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-500/30 transition-colors">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-mono text-blue-400">{task.task_number}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${getStatusColor(task.status)}`}>
              {task.status}
            </span>
          </div>
          <h4 className="text-xs font-semibold text-slate-200 mb-1">{task.title}</h4>
          <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{task.goal}</p>
        </div>
      ))}
    </div>
  );
}
