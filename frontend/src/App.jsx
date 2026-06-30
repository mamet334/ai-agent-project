import WorkspaceShell from './components/workbench/WorkspaceShell'
import ErrorBoundary from './components/workbench/ErrorBoundary'
import './App.css'

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceShell defaultWorkspaceId="ws-owner" />
    </ErrorBoundary>
  )
}
