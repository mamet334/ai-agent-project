import React from 'react';
import { serviceManager } from '../../../core/runtime/ServiceManager';
import { MessageSquare, Terminal, FlaskConical, Database, Settings } from 'lucide-react';

export default function QuickActionsWidget() {
  const applicationManager = serviceManager.get('ApplicationManager');

  const actions = [
    { id: 'app:assistant', label: 'New Chat', icon: MessageSquare, color: 'text-emerald-400' },
    { id: 'app:engineer', label: 'Engineer', icon: Terminal, color: 'text-blue-400' },
    { id: 'app:knowledge-base', label: 'Knowledge', icon: FlaskConical, color: 'text-purple-400' },
    { id: 'app:memory-graph', label: 'Memory', icon: Database, color: 'text-orange-400' },
    { id: 'app:settings', label: 'Settings', icon: Settings, color: 'text-slate-400' }
  ];

  const handleAction = (id) => {
    if (applicationManager) {
      applicationManager.activateApp(id);
    }
  };

  return (
    <div className="flex flex-wrap gap-3 mt-2">
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={() => handleAction(action.id)}
          className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg px-4 py-2 transition-colors flex-1 min-w-[120px] justify-center"
        >
          <action.icon size={16} className={action.color} />
          <span className="text-sm text-slate-300 font-medium">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
