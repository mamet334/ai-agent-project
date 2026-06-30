import React, { useEffect, useState } from 'react';
import { applicationManager } from '../../core/application/ApplicationManager';

export default function ApplicationContainer() {
  const [appState, setAppState] = useState(() => applicationManager.getState());

  useEffect(() => {
    return applicationManager.subscribe(setAppState);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-950">
      {appState.apps.map(app => {
        const isActive = appState.activeAppId === app.id;
        const Component = app.renderComponent;
        
        // Phase 2: State Persistence Validation.
        // We do NOT unmount the component when inactive. We just hide it using display: none (via tailwind 'hidden').
        // This ensures the React component tree and its local state (like Chat bubbles or open files) remains alive.
        return (
          <div key={app.id} className={`absolute inset-0 ${isActive ? 'flex' : 'hidden'} flex-col h-full w-full`}>
            {<Component />}
          </div>
        );
      })}
    </div>
  );
}
