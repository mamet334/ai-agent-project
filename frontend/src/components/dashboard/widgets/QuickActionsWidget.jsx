import React, { useState } from 'react';
import { serviceManager } from '../../../core/runtime/ServiceManager';
import { MessageSquare, Terminal, FlaskConical, Database, Settings } from 'lucide-react';

export default function QuickActionsWidget() {
  const applicationManager = serviceManager.get('ApplicationManager');

  const [actions, setActions] = useState([]);
  
  React.useEffect(() => {
    const metadataService = serviceManager.get('MetadataService');
    if (metadataService) {
      const apps = metadataService.getApps() || [];
      // Filter out some system apps or just show a subset
      const quickApps = apps.filter(app => 
        ['app:assistant', 'app:engineer', 'app:knowledge-base', 'app:memory-graph', 'app:settings'].includes(app.id)
      );
      setActions(quickApps);
    }
  }, []);

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
          <span className="text-sm text-slate-300 font-medium">{action.name || action.label}</span>
        </button>
      ))}
    </div>
  );
}
