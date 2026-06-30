import React from 'react';
import ActivityBar from './ActivityBar';

export default function OSDesktopShell({ children }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-200 font-sans">
      <ActivityBar />
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Application Container (Phase 1: Just wraps existing behavior) */}
        {children}
      </div>
    </div>
  );
}
