import React, { useState, useEffect } from 'react';
import { serviceManager } from '../../../core/runtime/ServiceManager';

export default function VerificationSummaryWidget() {
  const [metrics, setMetrics] = useState({
    pass: 0,
    fail: 0,
    warning: 0,
    confidence: '100%',
    architectureGap: 0
  });

  useEffect(() => {
    if (!serviceManager.has('EventBus')) return;
    const eventBus = serviceManager.get('EventBus');
    
    const unsub = eventBus.on('Verification:Completed', (payload) => {
      const decision = payload.data?.vReport?.decision || 'PASS';
      setMetrics(prev => ({
        ...prev,
        pass: prev.pass + (decision === 'PASS' ? 1 : 0),
        fail: prev.fail + (decision === 'FAIL' ? 1 : 0),
        warning: prev.warning + (decision === 'WARNING' ? 1 : 0)
      }));
    });

    return () => eventBus.off('Verification:Completed', unsub);
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      <div className="bg-slate-950 p-3 rounded border border-emerald-900/30 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-emerald-500">{metrics.pass}</span>
        <span className="text-[10px] uppercase text-slate-500">Pass</span>
      </div>
      <div className="bg-slate-950 p-3 rounded border border-rose-900/30 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-rose-500">{metrics.fail}</span>
        <span className="text-[10px] uppercase text-slate-500">Fail</span>
      </div>
      <div className="bg-slate-950 p-3 rounded border border-amber-900/30 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-amber-500">{metrics.warning}</span>
        <span className="text-[10px] uppercase text-slate-500">Warning</span>
      </div>
      <div className="bg-slate-950 p-3 rounded border border-slate-800/50 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-blue-400">{metrics.confidence}</span>
        <span className="text-[10px] uppercase text-slate-500">Confidence</span>
      </div>
      <div className="bg-slate-950 p-3 rounded border border-slate-800/50 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-purple-400">{metrics.architectureGap}</span>
        <span className="text-[10px] uppercase text-slate-500">Arch Gap</span>
      </div>
    </div>
  );
}
