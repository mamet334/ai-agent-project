import React, { useState, useEffect } from 'react';
import { Terminal, MessageSquare, Zap } from 'lucide-react';
import { serviceManager } from '../../../core/runtime/ServiceManager';

export default function WorkspaceOverviewWidget() {
  const applicationManager = serviceManager.get('ApplicationManager');
  const [activeApp, setActiveApp] = useState(applicationManager?.getState()?.activeAppId || '');

  useEffect(() => {
    if (!applicationManager) return;
    const unsub = applicationManager.subscribe((payload) => {
      setActiveApp(payload?.data?.activeAppId || payload?.activeAppId || '');
    });
    return () => unsub();
  }, [applicationManager]);

  const workspaces = [
    { id: 'app:assistant', label: 'Assistant', icon: MessageSquare, desc: 'Everyday AI Assistant' },
    { id: 'app:mametlite', label: 'Lite', icon: Zap, desc: 'Fast, lightweight queries' },
    { id: 'app:engineer', label: 'Engineer', icon: Terminal, desc: 'Core Engineering Brain' }
  ];

  const handleSwitch = (id) => {
    if (applicationManager) {
      applicationManager.activateApp(id);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {workspaces.map(ws => {
        const isActive = activeApp === ws.id;
        return (
          <div 
            key={ws.id} 
            onClick={() => handleSwitch(ws.id)}
            className={`p-3 rounded border flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer
              ${isActive ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-slate-950 border-slate-800/50 hover:border-emerald-500/30'}`}
          >
            <ws.icon size={24} className={isActive ? "text-emerald-400" : "text-emerald-400/50"} />
            <span className="text-sm font-medium text-slate-200">{ws.label}</span>
            <span className="text-[10px] text-slate-500 text-center">{ws.desc}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full mt-1 ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
              {isActive ? 'Active' : 'Ready'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
