import React, { useEffect, useState } from 'react';
import { serviceManager } from '../../core/runtime/ServiceManager';
import { ChevronRight } from 'lucide-react';

export default function Sidebar() {
  const applicationManager = serviceManager.get('ApplicationManager');
  const navigationService = serviceManager.get('NavigationService');
  
  const [appState, setAppState] = useState(() => applicationManager.getState());
  const [navTree, setNavTree] = useState(() => navigationService ? navigationService.getTree() : []);

  useEffect(() => {
    const unsub = applicationManager.subscribe((payload) => {
      setAppState(payload?.data || payload);
      if (navigationService) {
        setNavTree(navigationService.getTree());
      }
    });
    return () => unsub();
  }, [applicationManager, navigationService]);

  const activate = (id) => {
    if (appState.apps.find(a => a.id === id)) {
      applicationManager.activateApp(id);
    }
  };

  const isActive = (id) => appState.activeAppId === id;

  const renderNavNode = (node, idx) => {
    if (node.type === 'separator') return <div key={`sep-${idx}`} className="my-2 border-b border-slate-800/50" />;
    if (node.type === 'spacer') return <div key={`spacer-${idx}`} className="mt-auto" />;
    
    if (node.type === 'item') {
      const app = node.app;
      if (!app) return null;
      const active = isActive(app.id);
      return (
        <button
          key={app.id}
          onClick={() => activate(app.id)}
          disabled={!node.isAvailable}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors text-left
            ${!node.isAvailable ? 'text-slate-700 cursor-not-allowed' : active ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
        >
          <span className="truncate">{app.name}</span>
        </button>
      );
    }
    
    if (node.type === 'group') {
      return (
        <div key={`group-${node.name}`} className="mb-4">
          <div className="px-3 mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase flex items-center gap-1">
            <ChevronRight size={12} className="text-slate-600" />
            {node.name}
          </div>
          <div className="flex flex-col">
            {node.items.map((subItem, sIdx) => renderNavNode(subItem, `${idx}-${sIdx}`))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-60 h-full bg-[#050505] border-r border-slate-800 flex flex-col py-4 shrink-0 overflow-y-auto">
      {navTree.map((node, idx) => renderNavNode(node, idx))}
    </div>
  );
}
