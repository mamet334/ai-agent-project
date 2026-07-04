import React from 'react';
import { Terminal, MessageSquare, Zap } from 'lucide-react';

export default function WorkspaceOverviewWidget() {
  const workspaces = [
    { id: 'Assistant', icon: MessageSquare, desc: 'Everyday AI Assistant' },
    { id: 'MametLite', icon: Zap, desc: 'Fast, lightweight queries' },
    { id: 'Engineer', icon: Terminal, desc: 'Core Engineering Brain' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {workspaces.map(ws => (
        <div key={ws.id} className="bg-slate-950 p-3 rounded border border-slate-800/50 flex flex-col items-center justify-center gap-2 hover:border-emerald-500/50 transition-colors cursor-default">
          <ws.icon size={24} className="text-emerald-400" />
          <span className="text-sm font-medium text-slate-200">{ws.id}</span>
          <span className="text-[10px] text-slate-500 text-center">{ws.desc}</span>
        </div>
      ))}
    </div>
  );
}
