import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function ArchitectureGapsWidget() {
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGaps = async () => {
      const { data, error } = await supabase
        .from('architecture_gaps')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setGaps(data);
      setLoading(false);
    };
    fetchGaps();
  }, []);

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'resolved': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
      default: return 'text-rose-400 border-rose-500/20 bg-rose-500/10';
    }
  };

  if (loading) return <div className="p-4 text-xs text-slate-500">Loading gaps...</div>;

  return (
    <div className="space-y-2">
      {gaps.length === 0 && <p className="text-xs text-slate-600 text-center py-2">No architecture gaps.</p>}
      {gaps.map(gap => (
        <div key={gap.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500/30 transition-colors">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-mono text-rose-400">{gap.gap_number}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${getStatusColor(gap.status)}`}>
              {gap.status}
            </span>
          </div>
          <h4 className="text-xs font-semibold text-slate-200 mb-1">{gap.title}</h4>
          <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{gap.description}</p>
        </div>
      ))}
    </div>
  );
}
