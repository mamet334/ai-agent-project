import React, { useEffect, useState } from 'react';
import { Home, MessageSquare, Zap, Terminal, FlaskConical, Database, Bot, ShieldCheck, Activity, Cpu, Settings } from 'lucide-react';
import { useService } from '../../core/runtime/hooks/useService';

const ActivityIcon = ({ icon, active, tooltip, onClick, disabled }) => (
  <div 
    onClick={disabled ? undefined : onClick}
    className={`relative flex items-center justify-center w-full h-12 transition-colors group
      ${disabled ? 'text-on-surface-variant opacity-50 cursor-not-allowed' : active ? 'text-primary cursor-pointer' : 'text-on-surface-variant hover:text-on-surface cursor-pointer'}`}
    title={tooltip}
  >
    {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r" />}
    {icon}
  </div>
);

const GroupSeparator = () => (
  <div className="w-8 border-b border-outline-variant/30 my-2 shrink-0" />
);

export default function ActivityBar() {
  const applicationManager = useService('ApplicationManager');
  const navigationService = useService('NavigationService');

  const [appState, setAppState] = useState({ apps: [], activeAppId: null });
  const [navTree, setNavTree] = useState([]);

  useEffect(() => {
    if (applicationManager) setAppState(applicationManager.getState());
  }, [applicationManager]);

  useEffect(() => {
    if (navigationService) setNavTree(navigationService.getTree() || []);
  }, [navigationService]);

  useEffect(() => {
    if (!applicationManager) return;
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
    if (node.type === 'separator') return <GroupSeparator key={`sep-${idx}`} />;
    if (node.type === 'spacer') return <div key={`spacer-${idx}`} className="mt-auto" />;
    
    if (node.type === 'item') {
      const app = node.app;
      if (!app) return null;
      const IconComp = app.iconComponent;
      return (
        <ActivityIcon 
          key={app.id} 
          icon={<IconComp size={22} strokeWidth={1.5} />} 
          active={isActive(app.id)} 
          tooltip={app.name} 
          onClick={() => activate(app.id)} 
          disabled={!node.isAvailable} 
        />
      );
    }
    
    if (node.type === 'group') {
      return (
        <React.Fragment key={`group-${node.name}`}>
          {node.items.map((subItem, sIdx) => renderNavNode(subItem, `${idx}-${sIdx}`))}
        </React.Fragment>
      );
    }
    return null;
  };

  return (
    <div className="w-16 h-full bg-surface-container-low border-r border-outline-variant flex flex-col items-center py-4 shrink-0 z-50 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col gap-2 w-full items-center h-full">
        {navTree.map((node, idx) => renderNavNode(node, idx))}
      </div>
    </div>
  );
}