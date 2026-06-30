import React, { useRef } from 'react';
import WidgetHost from './WidgetHost';
import { workspaceManager } from '../../core/workspace/WorkspaceManager';

/**
 * WorkbenchZone
 * Handles rendering a specific zone (left, right, bottom) and its widgets.
 * Also provides the resize handle.
 */
export default function WorkbenchZone({ 
  position, // 'left', 'right', 'bottom'
  width, 
  height,
  widgets = [], 
  onResize
}) {
  const isResizing = useRef(false);

  const handlePointerDown = (e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = position === 'bottom' ? 'row-resize' : 'col-resize';
    
    const onPointerMove = (moveEvent) => {
      if (!isResizing.current) return;
      
      let newSize;
      if (position === 'left') {
        newSize = Math.max(200, Math.min(800, moveEvent.clientX));
      } else if (position === 'right') {
        newSize = Math.max(250, Math.min(800, document.body.clientWidth - moveEvent.clientX));
      } else if (position === 'bottom') {
        newSize = Math.max(150, Math.min(600, document.body.clientHeight - moveEvent.clientY));
      }
      
      if (onResize) onResize(position, newSize);
    };

    const onPointerUp = () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  if (widgets.length === 0) return null;

  const style = {};
  if (position === 'left' || position === 'right') {
    style.width = width ? `${width}px` : '300px';
  } else if (position === 'bottom') {
    style.height = height ? `${height}px` : '250px';
  }

  // Common wrapper styles
  const baseClasses = "flex flex-col bg-slate-950 relative shrink-0";
  const positionClasses = {
    'left': 'border-r border-slate-800 h-full',
    'right': 'border-l border-slate-800 h-full',
    'bottom': 'border-t border-slate-800 w-full'
  };

  return (
    <div className={`${baseClasses} ${positionClasses[position]}`} style={style}>
      
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {widgets.map(widgetId => (
          <div key={widgetId} className={position === 'bottom' ? "h-full inline-block w-1/3 p-1" : "min-h-[250px]"}>
             <WidgetHost widgetId={widgetId} />
          </div>
        ))}
      </div>

      {/* Resize Handle */}
      {position === 'left' && (
        <div 
          className="absolute top-0 right-0 w-1.5 h-full hover:bg-emerald-500/50 cursor-col-resize z-20"
          onPointerDown={handlePointerDown}
        />
      )}
      {position === 'right' && (
        <div 
          className="absolute top-0 left-0 w-1.5 h-full hover:bg-emerald-500/50 cursor-col-resize z-20"
          onPointerDown={handlePointerDown}
        />
      )}
      {position === 'bottom' && (
        <div 
          className="absolute top-0 left-0 w-full h-1.5 hover:bg-emerald-500/50 cursor-row-resize z-20"
          onPointerDown={handlePointerDown}
        />
      )}
    </div>
  );
}
