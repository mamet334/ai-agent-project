import React from 'react';
import WorkbenchZone from './WorkbenchZone';
import FloatingWindowManager from '../os/FloatingWindowManager';
import { useWorkspace } from '../../core/workspace/WorkspaceContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

export default function AppShell({ mainPanel: MainPanelComponent }) {
  const { osState: workspaceState, manager } = useWorkspace();

  console.log("[AppShell] Workspace state:", workspaceState);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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



  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (!activeData || !overData) return;

    const fromWorkbench = activeData.sortable?.containerId || activeData.workbench;
    let toWorkbench = overData.sortable?.containerId || overData.workbench;
    
    if (String(overId).startsWith('zone-')) {
      toWorkbench = String(overId).replace('zone-', '');
    }

    if (!fromWorkbench || !toWorkbench) return;

    let newIndex = -1;
    if (overData.sortable) {
      newIndex = overData.sortable.index;
      // If moving downwards in the same list, adjust index to account for removal
      if (fromWorkbench === toWorkbench && activeData.sortable.index < newIndex) {
        newIndex += 0; // dnd-kit already handles this index mapping contextually if we just pass the index, but splice requires exact insertion point. Actually, the index is the visual drop target.
      }
    }

    if (activeId !== overId || fromWorkbench !== toWorkbench) {
      manager.moveWidget(activeId, fromWorkbench, toWorkbench, newIndex);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
      <div 
        className="flex-1 grid overflow-hidden relative"
        style={{
          gridTemplateColumns: layout?.grid_columns || `${layout?.left_size || 300}px 1fr ${layout?.right_size || 350}px`
        }}
      >
        
        {/* Left Workbench */}
        <WorkbenchZone 
          position="left" 
          widgets={leftWidgets} 
          width={layout?.left_size || 300}
          onResize={handleResize}
        />

        {/* Center: The Main Panel */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0f] relative z-0">
          
          <div className="flex-1 overflow-hidden relative">
            {/* Phase 5: Window Manager Foundation */}
            {MainPanelComponent ? (
              <MainPanelComponent sessionId={workspaceState.sessionId} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-500 font-mono text-xs">
                [No Main Panel Provided]
              </div>
            )}
            
            {/* Phase 5: Floating Windows Layer */}
            <FloatingWindowManager 
              windows={layout?.floating_windows || []} 
              sessionId={workspaceState.sessionId}
            />
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
    </DndContext>
  );
}
