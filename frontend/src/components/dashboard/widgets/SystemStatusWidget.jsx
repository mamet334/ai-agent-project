import React, { useEffect, useState } from 'react';
import { kernel } from '../../../core/runtime/Kernel';
import { serviceManager } from '../../../core/runtime/ServiceManager';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';

export default function SystemStatusWidget() {
  const [status, setStatus] = useState({
    'Kernel Status': 'Unknown',
    'Memory Status': 'Unknown',
    'Verification Engine': 'Unknown',
    'Knowledge Status': 'Unknown',
    'Active LLM': 'Unknown',
    'Active Session': 'Unknown'
  });

  useEffect(() => {
    const updateStatus = async () => {
      let activeLlm = 'Unknown';
      const brainService = serviceManager.get('BrainService');
      if (brainService) {
        try {
          const brain = await brainService.getActiveBrainContext();
          activeLlm = brain?.provider ? `${brain.provider} (${brain.model || 'default'})` : 'Local/None';
        } catch(e) { activeLlm = 'Error'; }
      }

      const workspaceManager = serviceManager.get('WorkspaceManager');
      const activeSession = workspaceManager?.activeWorkspaceId || 'None';

      const memService = serviceManager.get('MemoryService');
      const verification = serviceManager.get('VerificationEngine');
      const knowledge = serviceManager.has('SemanticContextService');

      setStatus({
        'Kernel Status': kernel.status,
        'Memory Status': memService ? 'Ready' : 'Offline',
        'Verification Engine': verification ? verification.mode || 'Active' : 'Offline',
        'Knowledge Status': knowledge ? 'Indexed' : 'Pending',
        'Active LLM': activeLlm,
        'Active Session': activeSession
      });
    };

    updateStatus();

    if (!serviceManager.has('EventBus')) return;
    const eventBus = serviceManager.get('EventBus');
    const unsubPhase = eventBus.on('Kernel:PhaseCompleted', updateStatus);
    const unsubReady = eventBus.on('System:Ready', updateStatus);
    
    // Also listen to Workspace changes if we have ApplicationManager
    const appManager = serviceManager.get('ApplicationManager');
    let unsubApp = () => {};
    if (appManager) {
      unsubApp = appManager.subscribe(updateStatus);
    }

    return () => {
      eventBus.off('Kernel:PhaseCompleted', unsubPhase);
      eventBus.off('System:Ready', unsubReady);
      unsubApp();
    };
  }, []);

  const getStatusIcon = (state) => {
    if (state === 'RUNNING' || state === 'Ready' || state === 'Active' || state === 'Indexed') return <CheckCircle2 size={16} className="text-emerald-500" />;
    if (state === 'Unknown' || state === 'Pending') return <Loader2 size={16} className="text-blue-500 animate-spin" />;
    if (state === 'Offline' || state === 'Error') return <XCircle size={16} className="text-rose-500" />;
    return <CheckCircle2 size={16} className="text-emerald-500" />;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Object.entries(status).map(([key, val]) => (
        <div key={key} className="flex flex-col bg-slate-950 p-3 rounded border border-slate-800/50 justify-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{key}</span>
          <div className="flex items-center gap-2">
            {key === 'Active LLM' || key === 'Active Session' ? (
              <span className="text-xs font-semibold text-slate-300 truncate">{val}</span>
            ) : (
              <>
                {getStatusIcon(val)}
                <span className="text-xs font-semibold text-slate-300">{val}</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
