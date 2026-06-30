import React, { useEffect } from 'react'
import OSDesktopShell from './components/os/OSDesktopShell'
import WorkspaceShell from './components/workbench/WorkspaceShell'
import ErrorBoundary from './components/workbench/ErrorBoundary'
import { serviceManager } from './core/runtime/ServiceManager'
import { kernel } from './core/runtime/Kernel'
import { MessageSquare, Terminal, Database, FlaskConical } from 'lucide-react'
import { WorkspaceProvider } from './core/workspace/WorkspaceContext'
import './App.css'

const AssistantAppWrapper = () => (
  <WorkspaceProvider appId="app:assistant" defaultWorkspaceId="ws-owner">
    <WorkspaceShell />
  </WorkspaceProvider>
)

const EngineerAppWrapper = () => (
  <WorkspaceProvider appId="app:engineer" defaultWorkspaceId="ws-engineer">
    <WorkspaceShell />
  </WorkspaceProvider>
)

const MemoryAppWrapper = () => <div className="p-8 text-slate-400">Memory App (Phase 3 Placeholder)</div>
const ResearchAppWrapper = () => <div className="p-8 text-slate-400">Research App (Phase 3 Placeholder)</div>
const SettingsAppWrapper = () => <div className="p-8 text-slate-400">Settings App (Phase 3 Placeholder)</div>

export default function App() {
  const [isBooted, setIsBooted] = React.useState(false);

  useEffect(() => {
    const initOS = async () => {
      // Phase 4: Boot Kernel
      await kernel.boot();
      setIsBooted(true);

      const applicationManager = serviceManager.get('ApplicationManager');

      // 1. Register applications to the App Manager
      applicationManager.registerApp({
      id: 'app:assistant',
      name: 'Assistant',
      iconComponent: MessageSquare,
      renderComponent: AssistantAppWrapper
    });

    applicationManager.registerApp({
      id: 'app:engineer',
      name: 'Engineer',
      iconComponent: Terminal,
      renderComponent: EngineerAppWrapper
    });

    applicationManager.registerApp({
      id: 'app:memory',
      name: 'Memory',
      iconComponent: Database,
      renderComponent: MemoryAppWrapper
    });

    applicationManager.registerApp({
      id: 'app:research',
      name: 'Research',
      iconComponent: FlaskConical,
      renderComponent: ResearchAppWrapper
    });

    applicationManager.registerApp({
      id: 'app:settings',
      name: 'Settings',
      iconComponent: FlaskConical, // Just a placeholder icon, ActivityBar uses its own Settings icon for the bottom button
      renderComponent: SettingsAppWrapper
    });

    // 2. Activate default app
    applicationManager.activateApp('app:assistant');

    };
    initOS();
  }, []);

  if (!isBooted) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-emerald-500 font-mono text-sm">
        [Kernel] Boot sequence initiated...
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <OSDesktopShell />
    </ErrorBoundary>
  )
}
