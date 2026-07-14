import React from 'react';

export default function HomeDashboard() {
  return (
    <div className="flex flex-col h-full w-full bg-background items-center justify-center relative overflow-hidden font-body-base">
      
      <div className="max-w-2xl w-full px-6 z-10 flex flex-col gap-8 text-center items-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-container/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-primary text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>architecture</span>
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="font-display-lg text-[40px] text-on-surface font-black tracking-tight leading-tight">Good evening</h1>
          <p className="text-on-surface-variant text-body-base max-w-md mx-auto leading-relaxed">
            Welcome to your Mamet AI Workspace. Select an intelligence engine or start a new conversation to begin.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-8">
          <button className="glass-panel p-6 text-left rounded-2xl hover:bg-surface-container transition-all group border border-outline-variant/30 flex flex-col gap-3">
            <span className="material-symbols-outlined text-primary">chat</span>
            <div>
              <p className="font-semibold text-on-surface text-sm mb-1">Start a Conversation</p>
              <p className="text-on-surface-variant text-xs leading-relaxed">Interact with Mamet OS core intelligence.</p>
            </div>
          </button>
          <button className="glass-panel p-6 text-left rounded-2xl hover:bg-surface-container transition-all group border border-outline-variant/30 flex flex-col gap-3">
            <span className="material-symbols-outlined text-primary">terminal</span>
            <div>
              <p className="font-semibold text-on-surface text-sm mb-1">Engineering Workspace</p>
              <p className="text-on-surface-variant text-xs leading-relaxed">Advanced tools, local execution, and deeper context.</p>
            </div>
          </button>
        </div>
      </div>

      {/* Atmospheric Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none z-0"></div>
    </div>
  );
}
