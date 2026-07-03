import React, { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { serviceManager } from '../../core/runtime/ServiceManager';

const ActivityIcon = ({ icon, active, tooltip, onClick }) => (
  <div 
    onClick={onClick}
    className={`relative flex items-center justify-center w-full h-12 cursor-pointer transition-colors group
      ${active ? 'text-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
    title={tooltip}
  >
    {active && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500" />}
    {icon}
  </div>
);

export default function ActivityBar() {
  const applicationManager = serviceManager.get('ApplicationManager');
  const [appState, setAppState] = useState(() => {
    const initialState = applicationManager.getState();
    console.log('[ActivityBar] Initial state:', initialState);
    return initialState;
  });

  useEffect(() => {
    console.log('[ActivityBar] Subscribing to App:StateChanged');
    const unsub = applicationManager.subscribe((payload) => {
      console.log('[ActivityBar] App state changed:', payload);
      setAppState(payload?.data || payload);
    });
    return () => {
      console.log('[ActivityBar] Unsubscribing');
      unsub();
    };
  }, [applicationManager]);

  console.log('[ActivityBar] Rendering with apps:', appState.apps?.length || 0);

  return (
    <div className="w-14 h-full bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 shrink-0 z-50">
      <div className="flex flex-col gap-4 w-full items-center">
        {appState.apps.filter(app => app.id !== 'app:settings').map(app => {
          const Icon = app.iconComponent;
          return (
            <ActivityIcon 
              key={app.id}
              icon={<Icon size={24} strokeWidth={1.5} />} 
              active={appState.activeAppId === app.id} 
              tooltip={app.name} 
              onClick={() => {
                console.log('[ActivityBar] Activating app:', app.id);
                applicationManager.activateApp(app.id);
              }}
            />
          );
        })}
      </div>
      <div className="mt-auto flex flex-col gap-4 w-full items-center">
        <ActivityIcon 
          icon={<Settings size={24} strokeWidth={1.5} />} 
          active={appState.activeAppId === 'app:settings'}
          tooltip="Settings" 
          onClick={() => {
            console.log('[ActivityBar] Activating settings');
            applicationManager.activateApp('app:settings');
          }}
        />
      </div>
    </div>
  );
}