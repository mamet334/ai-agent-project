import React, { useEffect, useState } from 'react'
import OSDesktopShell from './components/os/OSDesktopShell'
import AppShell from './components/workbench/AppShell'
import ConversationEngine from './components/workbench/ConversationEngine'
import ErrorBoundary from './components/workbench/ErrorBoundary'
import EngineerApprovalDialog from './components/workbench/EngineerApprovalDialog'
import Login from './components/Login'
import Settings from './components/Settings'
import AgentForge from './components/agent-forge/AgentForge'
import ResearchApp from './components/research/ResearchApp'
import MemoryApp from './components/memory/MemoryApp'
import { serviceManager } from './core/runtime/ServiceManager'
import { kernel } from './core/runtime/Kernel'
import { MessageSquare, Terminal, Database, FlaskConical, LogOut, Settings as SettingsIcon, Bot } from 'lucide-react'
import { WorkspaceProvider } from './core/workspace/WorkspaceContext'
import { supabase } from './supabase'
import './App.css'

const AssistantAppWrapper = () => (
  <WorkspaceProvider appId="app:assistant" defaultWorkspaceId="ws-owner">
    <AppShell mainPanel={ConversationEngine} />
  </WorkspaceProvider>
)

const EngineerAppWrapper = () => (
  <WorkspaceProvider appId="app:engineer" defaultWorkspaceId="ws-engineer">
    <AppShell mainPanel={ConversationEngine} />
  </WorkspaceProvider>
)

const AgentForgeAppWrapper = () => (
  <WorkspaceProvider appId="app:agent-forge" defaultWorkspaceId="ws-agent-forge">
    <AppShell mainPanel={AgentForge} />
  </WorkspaceProvider>
)

const ResearchAppWrapper = () => (
  <WorkspaceProvider appId="app:knowledge-base" defaultWorkspaceId="ws-knowledge">
    <AppShell mainPanel={ResearchApp} />
  </WorkspaceProvider>
)

const MemoryAppWrapper = () => (
  <WorkspaceProvider appId="app:memory-graph" defaultWorkspaceId="ws-memory">
    <AppShell mainPanel={MemoryApp} />
  </WorkspaceProvider>
)


export default function App() {
  const [isBooted, setIsBooted] = React.useState(false)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bootPhase, setBootPhase] = useState(0)
  let pollInterval

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return

    const initOS = async () => {
      pollInterval = setInterval(() => setBootPhase(kernel.getCurrentPhase()), 200)

      kernel.setOwner({
        id: session.user.id,
        email: session.user.email,
        name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Owner'
      })

      await kernel.boot(serviceManager)
      setIsBooted(true)

      const applicationManager = serviceManager.get('ApplicationManager')
      applicationManager.registerApp({ id: 'app:assistant', name: 'Assistant', iconComponent: MessageSquare, renderComponent: AssistantAppWrapper })
      applicationManager.registerApp({ id: 'app:engineer', name: 'Engineer', iconComponent: Terminal, renderComponent: EngineerAppWrapper })
      applicationManager.registerApp({ id: 'app:agent-forge', name: 'Agent Forge', iconComponent: Bot, renderComponent: AgentForgeAppWrapper })
      applicationManager.registerApp({ id: 'app:memory-graph', name: 'Memory', iconComponent: Database, renderComponent: MemoryAppWrapper })
      applicationManager.registerApp({ id: 'app:knowledge-base', name: 'Knowledge Base', iconComponent: FlaskConical, renderComponent: ResearchAppWrapper })
      applicationManager.registerApp({ id: 'app:settings', name: 'Settings', iconComponent: SettingsIcon, renderComponent: Settings })
      applicationManager.activateApp('app:assistant')
    }

    initOS()

    return () => { if (pollInterval) clearInterval(pollInterval) }
  }, [session])

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-emerald-500 font-mono text-sm">
        [Auth] Checking session...
      </div>
    )
  }

  if (!session) {
    return <Login onLoginSuccess={() => { }} />
  }

  if (!isBooted) {
    const phaseNames = [
      'KERNEL INITIALIZATION', 'SYSTEM CORE REGISTRATION', 'EVENT SYSTEM BOOTSTRAP',
      'ADAPTER REGISTRY INIT', 'VERIFICATION ENGINE STARTUP', 'ORCHESTRATOR INITIALIZATION',
      'LOGGING & OBSERVABILITY INIT', 'METRICS SYSTEM WARMUP', 'KNOWLEDGE & MEMORY INITIAL SEED',
      'SYSTEM INTEGRATION CHECK', 'FULL SYSTEM ACTIVATION'
    ]
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950">
        <div className="text-emerald-500 font-mono text-sm mb-4">
          [Kernel] Booting MAEF v3.0.0...
        </div>
        <div className="w-80 h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${(bootPhase / 10) * 100}%` }}
          />
        </div>
        <div className="text-emerald-400 font-mono text-xs">
          PHASE {bootPhase}/10: {phaseNames[bootPhase] || 'INITIALIZING'}
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <OSDesktopShell />
      <EngineerApprovalDialog />
    </ErrorBoundary>
  )
}