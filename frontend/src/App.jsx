import OSDesktopShell from './components/os/OSDesktopShell'
import WorkspaceShell from './components/workbench/WorkspaceShell'
import ErrorBoundary from './components/workbench/ErrorBoundary'
import './App.css'

export default function App() {
  return (
    <ErrorBoundary>
      <OSDesktopShell>
        <WorkspaceShell defaultWorkspaceId="ws-owner" />
      </OSDesktopShell>
    </ErrorBoundary>
  )
}
