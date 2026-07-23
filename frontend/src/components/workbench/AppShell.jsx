import React from 'react';
import WorkbenchZone from './WorkbenchZone';
import FloatingWindowManager from '../os/FloatingWindowManager';
import { useWorkspace } from '../../core/workspace/WorkspaceContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

export default function AppShell({ mainPanel: MainPanelComponent }) {
  const { osState: workspaceState, manager } = useWorkspace();
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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
    <div className="flex flex-col h-full w-full bg-background overflow-hidden font-body-base text-on-surface custom-scrollbar">


      {/* Main OS Layout */}
      <div 
        className={`flex-1 ${isMobile ? 'flex flex-col overflow-y-auto' : 'grid overflow-hidden'} relative transition-all duration-300`}
        style={!isMobile ? {
          gridTemplateRows: 'minmax(0, 1fr)',
          gridTemplateColumns: [
            leftWidgets.length > 0 ? `${layout?.left_size || 300}px` : null,
            '1fr',
            rightWidgets.length > 0 ? `${layout?.right_size || 350}px` : null
          ].filter(Boolean).join(' ')
        } : {}}
      >
        
        {/* Left Workbench */}
        {leftWidgets.length > 0 && (
          <WorkbenchZone 
            position="left" 
            widgets={leftWidgets} 
            width={layout?.left_size || 300}
            onResize={handleResize}
          />
        )}

        {/* Center: The Main Panel */}
        <div className={`flex-1 flex flex-col min-w-0 ${isMobile ? 'min-h-[500px]' : 'min-h-0'} bg-surface-container-lowest relative z-0 md:h-full`}>
          
          <div className="flex-1 overflow-hidden relative h-full w-full flex flex-col">
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
          {bottomWidgets.length > 0 && (
            <WorkbenchZone 
              position="bottom" 
              widgets={bottomWidgets} 
              height={layout?.bottom_size || 250}
              onResize={handleResize}
            />
          )}
        </div>

        {/* Right Workbench */}
        {rightWidgets.length > 0 && (
          <WorkbenchZone 
            position="right" 
            widgets={rightWidgets} 
            width={layout?.right_size || 350}
            onResize={handleResize}
          />
        )}
        
      </div>
    </div>
    </DndContext>
  );
}
