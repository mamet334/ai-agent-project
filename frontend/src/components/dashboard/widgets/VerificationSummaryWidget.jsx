import React, { useState, useEffect } from 'react';
import { serviceManager } from '../../../core/runtime/ServiceManager';

export default function VerificationSummaryWidget() {
  const [verifications, setVerifications] = useState({ passed: 0, failed: 0, total: 0 });

  useEffect(() => {
    if (!serviceManager.has('EventBus')) return;
    const eventBus = serviceManager.get('EventBus');
    
    const unsub = eventBus.on('Verification:Completed', (payload) => {
      const isPassed = payload.data?.vReport?.decision !== 'FAIL';
      setVerifications(prev => ({
        passed: prev.passed + (isPassed ? 1 : 0),
        failed: prev.failed + (isPassed ? 0 : 1),
        total: prev.total + 1
      }));
    });

    return () => eventBus.off('Verification:Completed', unsub);
  }, []);

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-slate-950 p-3 rounded border border-slate-800/50 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-200">{verifications.total}</span>
        <span className="text-xs text-slate-500">Total Scanned</span>
      </div>
      <div className="bg-slate-950 p-3 rounded border border-emerald-900/30 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-emerald-500">{verifications.passed}</span>
        <span className="text-xs text-slate-500">Passed</span>
      </div>
      <div className="bg-slate-950 p-3 rounded border border-rose-900/30 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-rose-500">{verifications.failed}</span>
        <span className="text-xs text-slate-500">Blocked</span>
      </div>
    </div>
  );
}
