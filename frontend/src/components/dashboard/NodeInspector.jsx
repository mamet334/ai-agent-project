import React from 'react';

const formatDate = (dateString) => {
  if (!dateString) return 'Unknown';
  return new Date(dateString).toLocaleDateString('id-ID', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

export default function NodeInspector({ selectedNode, onClose }) {
  if (!selectedNode || selectedNode.isCategory) return null;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
        <h2 className="text-xs font-bold text-primary tracking-[0.2em] uppercase">
          Node Inspector
        </h2>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="mb-6">
          <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Label</div>
          <div className="text-sm font-semibold text-white break-words">{selectedNode.name}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Type</div>
            <div className="text-xs text-slate-300 bg-white/5 py-1 px-2 rounded inline-block">{selectedNode.type}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Status</div>
            <div className="text-xs text-slate-300">
              {selectedNode.data?.status || (selectedNode.data?.relations === 0 ? 'FAILED' : 'SUCCESS')}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Used</div>
            <div className="text-xs text-slate-300">{selectedNode.data?.used ?? '0'} times</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Latency</div>
            <div className="text-xs text-slate-300">{selectedNode.data?.latencyMs ?? 'UNKNOWN'}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Provider</div>
            <div className="text-xs text-slate-300">{selectedNode.data?.provider || selectedNode.data?.metadata?.provider || 'UNKNOWN'}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Cost</div>
            <div className="text-xs text-slate-300">{selectedNode.data?.cost ?? selectedNode.data?.metadata?.cost ?? 'UNKNOWN'}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Trace ID</div>
            <div className="text-xs text-slate-300 break-all">{selectedNode.data?.trace_id || selectedNode.data?.metadata?.trace_id || 'UNKNOWN'}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Dependencies</div>
            <div className="text-xs text-slate-300">{Array.isArray(selectedNode.data?.dependencies) && selectedNode.data.dependencies.length > 0 ? selectedNode.data.dependencies.join(', ') : 'UNKNOWN'}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Related Events</div>
            <div className="text-xs text-slate-300">{Array.isArray(selectedNode.data?.relatedEvents) && selectedNode.data.relatedEvents.length > 0 ? selectedNode.data.relatedEvents.join(' • ') : 'UNKNOWN'}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Failures</div>
            <div className="text-xs text-red-300">{Array.isArray(selectedNode.data?.failures) && selectedNode.data.failures.length > 0 ? selectedNode.data.failures.join(' | ') : 'UNKNOWN'}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Warnings</div>
            <div className="text-xs text-amber-300">{Array.isArray(selectedNode.data?.warnings) && selectedNode.data.warnings.length > 0 ? selectedNode.data.warnings.join(' | ') : 'UNKNOWN'}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Evidence</div>
            <div className="text-xs text-slate-300">{Array.isArray(selectedNode.data?.evidence) && selectedNode.data.evidence.length > 0 ? `${selectedNode.data.evidence.length} item(s)` : 'UNKNOWN'}</div>
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Relations</div>
          <div className={`text-xs font-bold ${selectedNode.data?.relations === 0 ? 'text-red-400' :
              selectedNode.data?.relations < 3 ? 'text-yellow-400' : 'text-green-400'
            }`}>
            {selectedNode.data?.relations ?? 0} active links
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Created</div>
          <div className="text-xs text-slate-300">{formatDate(selectedNode.data?.created)}</div>
        </div>

        {selectedNode.data?.source && (
          <div>
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Source Workspace</div>
            <div className="text-xs text-slate-300 capitalize">{selectedNode.data.source}</div>
          </div>
        )}

        {selectedNode.data?.metadata && Object.keys(selectedNode.data.metadata).length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider font-mono">Metadata</div>
            <pre className="text-[10px] text-slate-400 bg-black/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(selectedNode.data.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
