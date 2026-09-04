import React, { createContext, useContext, useState, useEffect } from 'react';
import { WorkspaceManager } from './WorkspaceManager';
import { serviceManager } from '../runtime/ServiceManager';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ appId, defaultWorkspaceId, children }) {
  const [manager] = useState(() => new WorkspaceManager(appId, serviceManager));
  const [osState, setOsState] = useState(manager.state);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = manager.subscribe((payload) => {
      // Defer state update to microtask queue to prevent updating state during render phase
      queueMicrotask(() => {
        if (isMounted) {
          setOsState(payload?.data || payload);
        }
      });
    });
    if (defaultWorkspaceId && !manager.activeWorkspaceId) {
      manager.switchWorkspace(defaultWorkspaceId);
    }
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [manager, defaultWorkspaceId]);

  return (
    <WorkspaceContext.Provider value={{ manager, osState }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
