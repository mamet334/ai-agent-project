import React from 'react';
import { LayoutDashboard, Code, Zap } from 'lucide-react';
import { useWorkspace } from '../../core/workspace/WorkspaceContext';

export default function WorkspaceNavWidget() {
  const { osState, manager } = useWorkspace();
  console.log("[LIFECYCLE] WorkspaceNavWidget loaded");
  const activeWorkspace = osState.workspaceId || 'ws-assistant';

  let workspaces = [
    { id: 'ws-assistant', name: 'Assistant', icon: LayoutDashboard, type: 'ASSISTANT' },
    { id: 'ws-lite', name: 'Lite', icon: Zap, type: 'LITE' },
    { id: 'ws-engineer', name: 'Engineer', icon: Code, type: 'ENGINEER' }
  ];

  // Phase 3: Context Isolation.
  // Prevent cross-app navigation that traps the user by hiding workspaces that belong to other Apps.
  if (manager.appId === 'app:assistant') {
    workspaces = workspaces.filter(w => w.id === 'ws-assistant');
  } else if (manager.appId === 'app:mametlite') {
    workspaces = workspaces.filter(w => w.id === 'ws-lite');
  } else if (manager.appId === 'app:engineer') {
    workspaces = workspaces.filter(w => w.id === 'ws-engineer');
  }

  return (
    <div className="flex flex-col space-y-1">
      <div className="text-[10px] font-bold text-slate-500 uppercase px-2 mb-2 tracking-wider">
        Workspaces
      </div>
      {workspaces.map((ws) => {
        const Icon = ws.icon;
        const isActive = activeWorkspace === ws.id;
        return (
          <button
            key={ws.id}
            onClick={() => manager.switchWorkspace(ws.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
              isActive 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-500' : 'text-slate-500'}`} />
            {ws.name}
          </button>
        );
      })}
    </div>
  );
}
