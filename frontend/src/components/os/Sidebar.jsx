import React, { useEffect, useState } from 'react';
import { serviceManager } from '../../core/runtime/ServiceManager';

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
    if (node.type === 'separator') return null; // We handle separation manually or skip
    if (node.type === 'spacer') return <div key={`spacer-${idx}`} className="mt-auto" />;
    
    if (node.type === 'item' || node.appId) {
      const app = node.app;
      if (!app || app.id === 'app:settings') return null;
      const active = isActive(app.id);
      
      const getIcon = (appName) => {
        const lower = appName.toLowerCase();
        if (lower.includes('home')) return 'home';
        if (lower.includes('assistant')) return 'chat_bubble';
        if (lower.includes('lite')) return 'bolt';
        if (lower.includes('engineer')) return 'terminal';
        if (lower.includes('settings')) return 'settings';
        if (lower.includes('knowledge')) return 'menu_book';
        if (lower.includes('memory')) return 'database';
        if (lower.includes('forge')) return 'architecture';
        return 'apps';
      };

      return (
        <a
          key={app.id}
          href="#"
          onClick={(e) => { e.preventDefault(); activate(app.id); }}
          title={app.name}
          className={active 
            ? "flex items-center justify-center w-10 h-10 mx-auto bg-secondary-container text-on-secondary-container rounded-xl transition-all duration-200 relative"
            : "flex items-center justify-center w-10 h-10 mx-auto text-on-surface-variant hover:bg-surface-variant rounded-xl transition-colors group"}
        >
          {active && <div className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />}
          <span className={`material-symbols-outlined ${active ? 'text-primary' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
            {getIcon(app.name)}
          </span>
        </a>
      );
    }
    
    if (node.type === 'group') {
      return (
        <div key={`group-${node.name}`} className="mb-4 space-y-1">
          {node.items.map((subItem, sIdx) => renderNavNode(subItem, `${idx}-${sIdx}`))}
        </div>
      );
    }
    return null;
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 flex flex-col items-center bg-surface-container-low border-r border-outline-variant z-40 py-4">
      <div className="flex flex-col gap-1 items-center mb-6">
        <div className="w-8 h-8 rounded-lg bg-primary-container/20 flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>architecture</span>
        </div>
      </div>
      
      <nav className="flex-1 w-full space-y-2 custom-scrollbar overflow-y-auto">
        {navTree.map((node, idx) => renderNavNode(node, idx))}
      </nav>
      
      <div className="w-full flex flex-col items-center gap-2 mt-auto pt-4 border-t border-outline-variant/30">
        <a 
          href="#" 
          onClick={(e) => { e.preventDefault(); activate('app:settings'); }}
          title="Settings" 
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors relative ${isActive('app:settings') ? 'text-primary bg-secondary-container' : 'text-on-surface-variant hover:bg-surface-variant'}`}
        >
          {isActive('app:settings') && <div className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />}
          <span className="material-symbols-outlined">settings</span>
        </a>
        <div className="mt-2 flex items-center justify-center">
          <div 
            onClick={(e) => { e.preventDefault(); activate('app:settings'); }}
            className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center border border-outline-variant relative cursor-pointer hover:border-primary transition-colors" 
            title="mametdev (Online)"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">person</span>
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-primary animate-pulse border border-surface-container-low"></span>
          </div>
        </div>
      </div>
    </aside>
  );
}
