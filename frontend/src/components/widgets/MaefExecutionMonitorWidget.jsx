import React, { useState, useEffect } from 'react';
import { kernel } from '../../core/runtime/Kernel';
import { ShieldAlert, CheckCircle, RefreshCw, Activity, Cpu, Network, Database } from 'lucide-react';

export default function MaefExecutionMonitorWidget() {
  const [activeTrace, setActiveTrace] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check for pre-injected data (if widget mounted too slow to catch the event)
    const wsManager = kernel.serviceManager?.has('WorkspaceManager') ? kernel.serviceManager.get('WorkspaceManager') : null;
    if (wsManager && typeof wsManager.getWidgetData === 'function') {
      const preInjectedData = wsManager.getWidgetData('widget:maef-monitor');
      if (preInjectedData) {
        const executionTrace = preInjectedData.logs || preInjectedData;
        setActiveTrace(executionTrace);
        setLoading(false);
      }
    }

    // 2. Subscribe to EventBus for future dynamic injections
    const eventBus = kernel.serviceManager?.has('EventBus') ? kernel.serviceManager.get('EventBus') : null;
    let unsub = null;

    if (eventBus) {
      unsub = eventBus.subscribe(event => {
        if (event.type === 'Widget.DataInjected' && event.payload.widgetId === 'widget:maef-monitor') {
          const executionTrace = event.payload.data?.logs || event.payload.data;
          setActiveTrace(executionTrace);
          setLoading(false);
        }
      });
    }

    // If no trace is injected within 1s, just show waiting state
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => {
      if (unsub) unsub();
      clearTimeout(timeout);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-3">
        <Activity className="w-6 h-6 animate-pulse text-emerald-500" />
        <span className="text-xs uppercase tracking-widest font-mono">Initializing MAEF Trace...</span>
      </div>
    );
  }

  if (!activeTrace) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2 text-center p-4">
        <ShieldAlert className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-[11px] font-mono">Waiting for AI Execution Trace...</p>
        <p className="text-[9px] text-slate-600 max-w-[200px]">Send a message in the conversation engine to capture runtime telemetry.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      
      {/* Header Status */}
      <div className="bg-slate-900 border border-emerald-500/30 rounded-lg p-3">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <Cpu className="w-4 h-4" />
            <span className="text-xs font-bold font-mono">EXECUTION_SUCCESS</span>
          </div>
          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">VERIFIED</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-slate-950 p-2 rounded border border-slate-800">
            <span className="text-slate-500 block mb-1">Total Subagents</span>
            <span className="text-slate-200 font-mono text-xs">{activeTrace.subagentRuns?.length || 0}</span>
          </div>
          <div className="bg-slate-950 p-2 rounded border border-slate-800">
            <span className="text-slate-500 block mb-1">Tools Executed</span>
            <span className="text-slate-200 font-mono text-xs">{activeTrace.toolsUsed?.length || 0}</span>
          </div>
        </div>
      </div>

      {/* Execution Pipeline Steps */}
      <div className="space-y-2">
        <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
          <Network className="w-3 h-3" /> Runtime Pipeline
        </h4>
        
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-3 space-y-3 relative">
           <div className="absolute left-[19px] top-4 bottom-4 w-px bg-slate-800 z-0"></div>
           
           {(activeTrace.processingSteps || activeTrace.logs || []).map((step, idx) => (
             <div key={idx} className="flex gap-3 relative z-10">
               <div className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-slate-950 border border-emerald-500/50 flex items-center justify-center">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
               </div>
               <div className="text-[10px] text-slate-300 font-mono leading-relaxed pt-0.5">
                 {step}
               </div>
             </div>
           ))}
           
           {/* If no steps array was provided but there is general telemetry */}
           {(!activeTrace.processingSteps && !activeTrace.logs) && (
              <div className="flex gap-3 relative z-10">
                <div className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-slate-950 border border-emerald-500/50 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                </div>
                <div className="text-[10px] text-slate-300 font-mono leading-relaxed pt-0.5 whitespace-pre-wrap">
                  {JSON.stringify(activeTrace, null, 2)}
                </div>
              </div>
           )}
        </div>
      </div>
      
      {/* Evidence Payload */}
      {activeTrace.groundingSources && activeTrace.groundingSources.length > 0 && (
        <div className="space-y-2 mt-4">
          <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
            <Database className="w-3 h-3" /> Grounding Evidence
          </h4>
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-3 text-[10px] text-slate-400 font-mono">
            {activeTrace.groundingSources.map((source, i) => (
              <div key={i} className="mb-2 pb-2 border-b border-slate-800/50 last:border-0 last:mb-0 last:pb-0">
                <span className="text-emerald-400/80 block mb-1">[{source.type || 'Context'}]</span>
                {source.content?.substring(0, 150)}...
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
