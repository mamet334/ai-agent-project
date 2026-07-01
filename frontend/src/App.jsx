import React, { useEffect, useState } from 'react'
import OSDesktopShell from './components/os/OSDesktopShell'
import AppShell from './components/workbench/AppShell'
import ConversationEngine from './components/workbench/ConversationEngine'
import ErrorBoundary from './components/workbench/ErrorBoundary'
import Login from './components/Login'
import { serviceManager } from './core/runtime/ServiceManager'
import { kernel } from './core/runtime/Kernel'
import { MessageSquare, Terminal, Database, FlaskConical, LogOut } from 'lucide-react'
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

const MemoryAppWrapper = () => <div className="p-8 text-slate-400">Memory App (Phase 3 Placeholder)</div>
const ResearchAppWrapper = () => <div className="p-8 text-slate-400">Research App (Phase 3 Placeholder)</div>
const SettingsAppWrapper = () => (
  <div className="p-8">
    <div className="max-w-md mx-auto">
      <h2 className="text-xl font-semibold text-white mb-6">Settings</h2>
      <button
        onClick={async () => await supabase.auth.signOut()}
        className="flex items-center gap-2 px-4 py-2 bg-red-900/30 border border-red-800 text-red-300 rounded-lg hover:bg-red-900/50 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  </div>
)

export default function App() {
  const [isBooted, setIsBooted] = React.useState(false);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootPhase, setBootPhase] = useState(0);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    let pollInterval;

    const initOS = async () => {
      // Initialize EventBus EARLY so we can listen to boot events
      let eventBus = serviceManager.get('EventBus');
      if (!eventBus) {
        const { EventBus: EB } = await import('./core/runtime/EventBus');
        eventBus = new EB();
        serviceManager.register('EventBus', eventBus);
      }
      
      // Listen to phase changes BEFORE booting kernel
      eventBus.on('KERNEL_PHASE_COMPLETED', (data) => {
        setBootPhase(data.phase);
      });

      // Add polling as FALLBACK to ensure phase updates
      pollInterval = setInterval(() => {
        const currentPhase = kernel.getCurrentPhase();
        setBootPhase(currentPhase);
      }, 200);

      // Set owner identity first
      kernel.setOwner({
        id: session.user.id,
        email: session.user.email,
        name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Owner'
      });

      try {
        // Boot Kernel
        await kernel.boot();
        setIsBooted(true);
      } finally {
        // Clean up polling
        if (pollInterval) clearInterval(pollInterval);
      }

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

    // Cleanup on unmount
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [session]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-emerald-500 font-mono text-sm">
        [Auth] Checking session...
      </div>
    );
  }

  if (!session) {
    return <Login onLoginSuccess={() => {}} />;
  }

  if (!isBooted) {
    const phaseNames = [
      'KERNEL INITIALIZATION',
      'SYSTEM CORE REGISTRATION',
      'EVENT SYSTEM BOOTSTRAP',
      'ADAPTER REGISTRY INIT',
      'VERIFICATION ENGINE STARTUP',
      'ORCHESTRATOR INITIALIZATION',
      'LOGGING & OBSERVABILITY INIT',
      'METRICS SYSTEM WARMUP',
      'KNOWLEDGE & MEMORY SEED',
      'SYSTEM INTEGRATION CHECK',
      'FULL SYSTEM ACTIVATION'
    ];

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
    );
  }

  return (
    <ErrorBoundary>
      <OSDesktopShell />
    </ErrorBoundary>
  )
}
