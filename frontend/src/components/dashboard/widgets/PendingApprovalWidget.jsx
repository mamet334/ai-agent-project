import React from 'react';

export default function PendingApprovalWidget() {
  // In a real implementation, we would subscribe to an ApprovalService.
  const approvals = [];

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
            <div key={i} className="text-left text-xs bg-slate-900 p-2 border border-slate-800 mb-1 rounded">
              {app.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
