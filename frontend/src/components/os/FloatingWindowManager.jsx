import React from 'react';

/**
 * Phase 5: Floating Window Manager (Foundation)
 * Reads the `floating_windows` array from the Workspace Layout state
 * and renders them above the main panels.
 */
export default function FloatingWindowManager({ windows, sessionId }) {
  if (!windows || windows.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      {windows.map((win, idx) => (
        <div 
          key={win.id || idx}
          className="absolute bg-slate-900 border border-slate-700 shadow-2xl rounded-lg pointer-events-auto flex flex-col"
          style={{
            top: win.y || 50,
            left: win.x || 50,
            width: win.width || 400,
            height: win.height || 300,
            zIndex: 100 + idx
          }}
        >
          {/* Window Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 cursor-move">
            <span className="text-xs font-semibold text-slate-300">{win.title || 'Floating Window'}</span>
            <button className="text-slate-500 hover:text-red-400">✕</button>
          </div>
          
          {/* Window Content */}
          <div className="flex-1 p-4 text-sm text-slate-400 overflow-auto">
            {/* Future: Render the actual Widget/Component here */}
            Window content for {win.id}
          </div>
        </div>
      ))}
    </div>
  );
}
