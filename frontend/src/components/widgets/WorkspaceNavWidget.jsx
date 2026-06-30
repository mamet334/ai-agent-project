import React from 'react';
import { LayoutDashboard, Code, Database, Search } from 'lucide-react';
import { useWorkspace } from '../../core/workspace/WorkspaceContext';

export default function WorkspaceNavWidget() {
  const { osState, manager } = useWorkspace();
  console.log("[LIFECYCLE] WorkspaceNavWidget loaded");
  const activeWorkspace = osState.workspaceId || 'ws-owner';

  const workspaces = [
    { id: 'ws-owner', name: 'Owner Workspace', icon: LayoutDashboard, type: 'OWNER' },
    { id: 'ws-engineer', name: 'Engineer Console', icon: Code, type: 'ENGINEER' },
    { id: 'ws-memory', name: 'Memory Core', icon: Database, type: 'MEMORY' },
    { id: 'ws-research', name: 'Research Lab', icon: Search, type: 'RESEARCH' },
  ];

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
