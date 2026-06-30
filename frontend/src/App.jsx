import React, { useEffect } from 'react'
import OSDesktopShell from './components/os/OSDesktopShell'
import WorkspaceShell from './components/workbench/WorkspaceShell'
import ErrorBoundary from './components/workbench/ErrorBoundary'
import EngineerPlaceholderApp from './components/os/EngineerPlaceholderApp'
import { applicationManager } from './core/application/ApplicationManager'
import { MessageSquare, Terminal, Database, FlaskConical } from 'lucide-react'
import './App.css'

// We create a wrapper for Assistant that maps to WorkspaceShell for now.
const AssistantAppWrapper = () => <WorkspaceShell defaultWorkspaceId="ws-owner" />
const MemoryAppWrapper = () => <div className="p-8 text-slate-400">Memory App (Phase 2 Placeholder)</div>
const ResearchAppWrapper = () => <div className="p-8 text-slate-400">Research App (Phase 2 Placeholder)</div>

export default function App() {
  useEffect(() => {
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
      renderComponent: EngineerPlaceholderApp
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

    // 2. Activate default app
    applicationManager.activateApp('app:assistant');
  }, []);

  return (
    <ErrorBoundary>
      <OSDesktopShell />
    </ErrorBoundary>
  )
}
