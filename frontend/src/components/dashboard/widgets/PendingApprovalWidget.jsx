import React from 'react';

export default function PendingApprovalWidget() {
  return (
    <div className="flex flex-col items-center justify-center bg-slate-950 p-4 rounded border border-slate-800/50 h-full min-h-[100px] text-center">
      <span className="text-sm font-medium text-slate-300">0 Pending</span>
      <span className="text-xs text-slate-500 mt-1">No actions require approval</span>
    </div>
  );
}
