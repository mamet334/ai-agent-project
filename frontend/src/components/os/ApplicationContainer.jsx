import React, { useEffect, useState } from 'react';
import { useService } from '../../core/runtime/hooks/useService';

export default function ApplicationContainer() {
  const applicationManager = useService('ApplicationManager');
  const [appState, setAppState] = useState({ apps: [], activeAppId: null });

  useEffect(() => {
    if (applicationManager) setAppState(applicationManager.getState());
  }, [applicationManager]);

  useEffect(() => {
    if (!applicationManager) return;
    return applicationManager.subscribe((payload) => setAppState(payload?.data || payload));
  }, [applicationManager]);

  return (
    <main className="flex-1 h-full overflow-hidden relative bg-background custom-scrollbar">
      {appState.apps.map(app => {
        const isActive = appState.activeAppId === app.id;
        const Component = app.renderComponent;
        
        // Phase 2: State Persistence Validation.
        // We do NOT unmount the component when inactive. We just hide it using display: none (via tailwind 'hidden').
        // This ensures the React component tree and its local state (like Chat bubbles or open files) remains alive.
        return (
          <div key={app.id} className={`absolute inset-0 ${isActive ? 'flex' : 'hidden'} flex-col h-full w-full`}>
            <React.Suspense fallback={<div className="flex h-full w-full items-center justify-center text-primary text-[10px] font-label-mono uppercase tracking-widest">Loading OS Module...</div>}>
              <Component />
            </React.Suspense>
          </div>
        );
      })}
    </main>
  );
}
