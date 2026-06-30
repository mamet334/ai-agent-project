import React from 'react';
import WorkbenchZone from './WorkbenchZone';
import ConversationEngine from './ConversationEngine';
import { useWorkspace } from '../../core/workspace/WorkspaceContext';

export default function WorkspaceShell() {
  const { osState: workspaceState, manager } = useWorkspace();

  if (
    workspaceState.status === 'IDLE' || 
    workspaceState.status === 'INITIALIZE' || 
    workspaceState.status === 'LOADING_MANIFEST' ||
    workspaceState.status === 'RESTORING_LAYOUT'
  ) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 text-emerald-500 font-mono text-sm">
        [Mamet OS] Loading Workspace Environment... ({workspaceState.status})
      </div>
    );
  }

  const { layout, widgets } = workspaceState;
  
  // Safe extraction of layout definition
  const leftWidgets = layout?.left_workbench || [];
  const rightWidgets = layout?.right_workbench || [];
  const bottomWidgets = layout?.bottom_workbench || [];

  const handleResize = (position, newSize) => {
    manager.updateLayout(position, newSize);
  };

  return (
    <div className="flex flex-col h-full w-full bg-black overflow-hidden font-sans text-slate-200">
      {/* Top Header / App Bar (Optional, depending on OS design) */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center px-4 shrink-0 justify-between">
        <div className="text-xs font-bold text-slate-400">
          MAMET OS <span className="text-emerald-500 mx-2">/</span> {workspaceState.workspaceId}
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          Session: {workspaceState.sessionId} | Status: {workspaceState.status}
        </div>
      </div>

      {/* Main OS Layout */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        
        {/* Left Workbench */}
        <WorkbenchZone 
          position="left" 
          widgets={leftWidgets} 
          width={layout?.left_size || 300}
          onResize={handleResize}
        />

        {/* Center: The Anchor (Conversation Engine) */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0f] relative z-0">
          
          <div className="flex-1 overflow-hidden">
            <ConversationEngine sessionId={workspaceState.sessionId} />
          </div>

          {/* Bottom Workbench */}
          <WorkbenchZone 
            position="bottom" 
            widgets={bottomWidgets} 
            height={layout?.bottom_size || 250}
            onResize={handleResize}
          />
        </div>

        {/* Right Workbench */}
        <WorkbenchZone 
          position="right" 
          widgets={rightWidgets} 
          width={layout?.right_size || 350}
          onResize={handleResize}
        />
        
      </div>
    </div>
  );
}
