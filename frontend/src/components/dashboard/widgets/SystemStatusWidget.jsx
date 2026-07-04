import React, { useEffect, useState } from 'react';
import { kernel } from '../../../core/runtime/Kernel';
import { serviceManager } from '../../../core/runtime/ServiceManager';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export default function SystemStatusWidget() {
  const [status, setStatus] = useState({
    kernel: 'Healthy',
    memory: 'Unknown',
    eventBus: 'Healthy',
    orchestrator: 'Unknown'
  });

  useEffect(() => {
    const updateStatus = () => {
      setStatus({
        kernel: kernel.status === 'RUNNING' ? 'Healthy' : 'Warning',
        memory: serviceManager.has('MemoryService') ? 'Healthy' : 'Error',
        eventBus: serviceManager.has('EventBus') ? 'Healthy' : 'Error',
        orchestrator: serviceManager.has('AgentOrchestratorService') ? 'Healthy' : 'Error'
      });
    };

    updateStatus();

    if (!serviceManager.has('EventBus')) return;
    const eventBus = serviceManager.get('EventBus');

    const unsubPhase = eventBus.on('Kernel:PhaseCompleted', updateStatus);
    const unsubReady = eventBus.on('System:Ready', updateStatus);

    return () => {
      eventBus.off('Kernel:PhaseCompleted', unsubPhase);
      eventBus.off('System:Ready', unsubReady);
    };
  }, []);

  const getStatusIcon = (state) => {
    if (state === 'Healthy') return <CheckCircle2 size={16} className="text-emerald-500" />;
    if (state === 'Warning') return <AlertTriangle size={16} className="text-amber-500" />;
    return <XCircle size={16} className="text-rose-500" />;
  };

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(status).map(([key, val]) => (
        <div key={key} className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800/50">
          <span className="text-xs text-slate-300 capitalize">{key}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase">{val}</span>
            {getStatusIcon(val)}
          </div>
        </div>
      ))}
    </div>
  );
}
