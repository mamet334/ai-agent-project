import React, { useRef, useState, useEffect } from 'react';
import WidgetHost from './WidgetHost';
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

function SortableWidgetWrapper({ widgetId, position, onClose }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: widgetId,
    data: { workbench: position }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : 1,
    position: 'relative'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={position === 'bottom' ? "h-full inline-block w-1/3 p-1 align-top" : "min-h-[250px] mb-2 relative"}
    >
      {/* WidgetHost sekarang menerima drag handle & onClose dari sini */}
      <WidgetHost
        widgetId={widgetId}
        onClose={onClose}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
      />
    </div>
  );
}

/**
 * WorkbenchZone
 * Handles rendering a specific zone (left, right, bottom) and its widgets.
 * Also provides the resize handle.
 */
export default function WorkbenchZone({ 
  position,
  width, 
  height,
  widgets = [], 
  onResize,
  onClose
}) {
  const isResizing = useRef(false);
  const currentSizeRef = useRef(null);
  const [draftSize, setDraftSize] = useState(null);

  const { setNodeRef } = useDroppable({
    id: `zone-${position}`,
    data: { workbench: position }
  });

  // Reset draftSize if external width/height changes when not resizing
  useEffect(() => {
    if (!isResizing.current) {
       currentSizeRef.current = null;
       setDraftSize(null);
    }
  }, [width, height]);

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
      
      currentSizeRef.current = newSize;
      setDraftSize(newSize);
    };

    const onPointerUp = () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      
      const finalSize = currentSizeRef.current;
      currentSizeRef.current = null;
      setDraftSize(null);

      // Trigger layout update outside of React state updater to prevent render phase warning
      if (finalSize !== null && onResize) {
        onResize(position, finalSize);
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  // Let's NOT return null, but make it very thin if empty.
  
  let isEmpty = widgets.length === 0;

  const style = {};
  const currentWidth = draftSize !== null ? draftSize : width;
  const currentHeight = draftSize !== null ? draftSize : height;

  if (position === 'left' || position === 'right') {
    style.width = '100%';
  } else if (position === 'bottom') {
    style.height = isEmpty ? '60px' : (currentHeight ? `${currentHeight}px` : '250px');
  }

  // Common wrapper styles
  const baseClasses = "flex flex-col bg-slate-950 relative min-h-0 min-w-0";
  const positionClasses = {
    'left': 'border-b md:border-b-0 md:border-r border-slate-800 h-[350px] md:h-full flex-shrink-0',
    'right': 'border-t md:border-t-0 md:border-l border-slate-800 h-[350px] md:h-full flex-shrink-0',
    'bottom': 'border-t border-slate-800 w-full flex-shrink-0'
  };

  return (
    <div className={`${baseClasses} ${positionClasses[position]}`} style={style} ref={setNodeRef}>
      
      {/* Content Area */}
      <div className={`flex-1 overflow-y-auto ${isEmpty ? 'flex items-center justify-center p-0' : 'p-2 space-y-2'} custom-scrollbar`}>
        <SortableContext items={widgets} strategy={position === 'bottom' ? horizontalListSortingStrategy : verticalListSortingStrategy}>
          {widgets.map(widgetId => (
             <SortableWidgetWrapper key={widgetId} widgetId={widgetId} position={position} onClose={onClose} />
          ))}
          {isEmpty && (
            <div className="w-full h-full m-2 border-2 border-dashed border-slate-800 rounded-lg flex items-center justify-center text-slate-700 text-[10px] font-mono text-center opacity-50 uppercase tracking-widest p-2">
              Drop<br/>{position}
            </div>
          )}
        </SortableContext>
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
