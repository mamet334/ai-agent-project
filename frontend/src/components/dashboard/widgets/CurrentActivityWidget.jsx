import React, { useState, useEffect } from 'react';
import { serviceManager } from '../../../core/runtime/ServiceManager';
import { kernel } from '../../../core/runtime/Kernel';
import { Activity, Loader2 } from 'lucide-react';

export default function CurrentActivityWidget() {
  const [activity, setActivity] = useState('Idle');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!serviceManager.has('EventBus')) return;
    const eventBus = serviceManager.get('EventBus');

    const handleEvent = (payload) => {
      // Just take the event name or payload string
      if (typeof payload === 'string') {
        setActivity(payload);
        setIsProcessing(true);
        setTimeout(() => setIsProcessing(false), 2000);
      } else if (payload && payload.message) {
        setActivity(payload.message);
        setIsProcessing(true);
        setTimeout(() => setIsProcessing(false), 2000);
      }
    };

    // Sub to some generic events or catch-all if EventBus supports it
    // For this mock, we'll listen to a few known events
    const unsub1 = eventBus.on('Memory:Loading', () => handleEvent('Loading Memory...'));
    const unsub2 = eventBus.on('Memory:Loaded', () => handleEvent('Memory Loaded'));
    const unsub3 = eventBus.on('Kernel:PhaseCompleted', (phase) => handleEvent(`Kernel Phase ${phase} Completed`));
    const unsub4 = eventBus.on('System:Ready', () => handleEvent('System Ready'));

    // Set initial
    setActivity(kernel.status === 'RUNNING' ? 'System Monitoring Active' : 'Waiting for Boot...');

    return () => {
      eventBus.off('Memory:Loading', unsub1);
      eventBus.off('Memory:Loaded', unsub2);
      eventBus.off('Kernel:PhaseCompleted', unsub3);
      eventBus.off('System:Ready', unsub4);
    };
  }, []);

  return (
    <div className="flex items-center gap-4 bg-slate-950 p-4 rounded border border-slate-800/50 h-full">
      <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
        {isProcessing ? (
          <Loader2 size={24} className="text-purple-400 animate-spin" />
        ) : (
          <Activity size={24} className="text-purple-400" />
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-slate-400">Current Activity</span>
        <span className="text-sm font-bold text-slate-200 mt-1">{activity}</span>
      </div>
    </div>
  );
}
