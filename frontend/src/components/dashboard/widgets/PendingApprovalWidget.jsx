import React, { useState, useEffect } from 'react';
import { serviceManager } from '../../../core/runtime/ServiceManager';

export default function PendingApprovalWidget() {
  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    const eventBus = serviceManager.get('EventBus');
    if (!eventBus) return;

    const unsubReq = eventBus.on('Engineer:RequestApproval', (payload) => {
      setApprovals(prev => [...prev, payload]);
    });

    const unsubRes = eventBus.on('Engineer:ApprovalResponse', (payload) => {
      setApprovals(prev => prev.filter(req => req.patchId !== payload.patchId));
    });

    return () => {
      eventBus.off('Engineer:RequestApproval', unsubReq);
      eventBus.off('Engineer:ApprovalResponse', unsubRes);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center bg-slate-950 p-4 rounded border border-slate-800/50 h-full min-h-[100px] text-center">
      {approvals.length === 0 ? (
        <>
          <span className="text-sm font-medium text-slate-300">0 Pending</span>
          <span className="text-xs text-slate-500 mt-1">No Pending Approval</span>
        </>
      ) : (
        <div className="w-full">
          {approvals.map((app, i) => (
            <div key={i} className="text-left text-xs bg-slate-900 p-2 border border-slate-800 mb-1 rounded flex flex-col">
              <span className="font-semibold text-amber-400">{app.summary || 'Pending Patch'}</span>
              <span className="text-[10px] text-slate-500">{app.files?.length || 0} files modified</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
