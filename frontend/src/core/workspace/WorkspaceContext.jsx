import React, { createContext, useContext, useState, useEffect } from 'react';
import { WorkspaceManager } from './WorkspaceManager';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ appId, defaultWorkspaceId, children }) {
  const [manager] = useState(() => new WorkspaceManager(appId));
  const [osState, setOsState] = useState(manager.state);

  useEffect(() => {
    const unsubscribe = manager.subscribe(setOsState);
    if (defaultWorkspaceId && !manager.activeWorkspaceId) {
      manager.switchWorkspace(defaultWorkspaceId);
    }
    return unsubscribe;
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
