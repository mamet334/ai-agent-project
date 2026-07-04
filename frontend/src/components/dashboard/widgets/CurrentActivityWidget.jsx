import React, { useState, useEffect } from 'react';
import { kernel } from '../../../core/runtime/Kernel';
import { serviceManager } from '../../../core/runtime/ServiceManager';
import { Activity } from 'lucide-react';

export default function CurrentActivityWidget() {
  const [phase, setPhase] = useState(kernel.getCurrentPhase());
  const [status, setStatus] = useState(kernel.status);

  useEffect(() => {
    setPhase(kernel.getCurrentPhase());
    setStatus(kernel.status);

    if (!serviceManager.has('EventBus')) return;
    const eventBus = serviceManager.get('EventBus');

    const handleUpdate = () => {
      setPhase(kernel.getCurrentPhase());
      setStatus(kernel.status);
    };

    const unsubPhase = eventBus.on('Kernel:PhaseCompleted', handleUpdate);
    const unsubReady = eventBus.on('System:Ready', handleUpdate);

    return () => {
      eventBus.off('Kernel:PhaseCompleted', unsubPhase);
      eventBus.off('System:Ready', unsubReady);
    };
  }, []);

  return (
    <div className="flex items-center gap-4 bg-slate-950 p-4 rounded border border-slate-800/50 h-full">
      <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
        <Activity size={24} className="text-purple-400" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-slate-400">Kernel Phase</span>
        <span className="text-lg font-bold text-slate-200">Phase {phase}</span>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{status}</span>
      </div>
    </div>
  );
}
