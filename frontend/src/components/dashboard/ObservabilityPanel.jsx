import React from 'react';

export default function ObservabilityPanel({
  executionTrace,
  observability,
  vitals,
  stats,
  lastCheckTime
}) {
  return (
    <div className="animate-in fade-in duration-300">
      <h2 className="text-xs font-bold text-slate-500 tracking-[0.2em] mb-8 uppercase border-b border-white/5 pb-4">
        Observability Dashboard
      </h2>

      <div className="space-y-5">
        {/* Execution Trace Timeline */}
        <div className="group pt-2 border-t border-white/5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                Execution Trace Timeline
              </div>
              {(() => {
                if (!executionTrace?.timeline || executionTrace.timeline.length === 0) return null;
                const hasTimeout = executionTrace.timeline.some(e => (e.status || '').toLowerCase() === 'timeout');
                const hasFailed = executionTrace.timeline.some(e => (e.status || '').toLowerCase() === 'failed');
                const hasRunning = executionTrace.timeline.some(e => (e.status || '').toLowerCase() === 'running' || (e.status || '').toLowerCase() === 'pending');

                if (hasTimeout) return (
                  <div className="text-[9px] mt-1 text-amber-300 font-mono">Status: ⏳ TIMEOUT (possible disconnect)</div>
                );
                if (hasFailed) return (
                  <div className="text-[9px] mt-1 text-red-400 font-mono">Status: ❌ FAILED (possible disconnect)</div>
                );
                if (hasRunning) return (
                  <div className="text-[9px] mt-1 text-sky-300 font-mono">Status: 🟡 RUNNING</div>
                );
                return (
                  <div className="text-[9px] mt-1 text-emerald-300 font-mono">Status: ✅ CONNECTED</div>
                );
              })()}
            </div>
            <div className="text-[9px] text-slate-600 font-mono">
              {executionTrace?.traceId ? String(executionTrace.traceId).slice(0, 10) + '…' : '—'}
            </div>
          </div>

          {executionTrace.loading ? (
            <div className="text-[10px] text-slate-400 font-mono">Loading timeline…</div>
          ) : executionTrace.error ? (
            <div className="text-[10px] text-red-400 font-mono">Timeline error: {executionTrace.error}</div>
          ) : executionTrace?.unknown || !executionTrace?.timeline || executionTrace.timeline.length === 0 ? (
            <div className="text-[10px] text-slate-500 font-mono">NO TELEMETRY AVAILABLE (UNKNOWN)</div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {executionTrace.timeline
                .slice()
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .map((evt, idx) => {
                  const status = evt.status || 'unknown';
                  const statusColor = status === 'success' ? 'text-emerald-300'
                    : status === 'failed' ? 'text-red-400'
                    : status === 'timeout' ? 'text-amber-300'
                    : status === 'running' ? 'text-sky-300'
                    : status === 'pending' ? 'text-slate-300'
                    : 'text-slate-300';

                  const metadata = evt.metadata || {};
                  const metaSummaryParts = [];
                  if (metadata.provider) metaSummaryParts.push(`provider:${metadata.provider}`);
                  if (metadata.decision) metaSummaryParts.push(`decision:${metadata.decision}`);
                  if (metadata.failures) {
                    if (typeof metadata.failures === 'string') metaSummaryParts.push(`failures:${metadata.failures.slice(0, 60)}`);
                    else metaSummaryParts.push('failures:present');
                  }
                  const metaSummary = metaSummaryParts.length > 0 ? metaSummaryParts.join(' | ') : null;
                  const ts = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString('id-ID', { hour12: false }) : '—';
                  const label = evt.event || evt.type || 'Event';

                  return (
                    <div key={`${evt.timestamp || 't'}-${idx}`} className="flex gap-3 items-start bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                      <div className="pt-0.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${statusColor.replace('text-', 'bg-')}`}></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-mono text-slate-200 truncate">{label}</div>
                          <div className="text-[9px] text-slate-500 font-mono whitespace-nowrap">{ts}</div>
                        </div>
                        <div className="text-[9px] font-mono mt-0.5">
                          <span className={statusColor}>{status}</span>
                          {metaSummary && <span className="text-slate-500"> • {metaSummary}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Pipeline Execution */}
        {executionTrace?.pipeline?.steps && executionTrace.pipeline.steps.length > 0 && (
          <div className="group pt-4 border-t border-white/5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-3">
              Pipeline Execution (V2 Core)
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {executionTrace.pipeline.steps.map((step) => {
                const status = step.status || 'UNKNOWN';
                const statusClass = status === 'SUCCESS' ? 'text-emerald-300'
                  : status === 'FAILED' ? 'text-red-400'
                  : status === 'RUNNING' ? 'text-sky-300'
                  : 'text-slate-300';

                return (
                  <div key={step.key} className="bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] text-slate-200 font-mono">{step.order}. {step.label}</div>
                      <div className={`text-[9px] font-mono ${statusClass}`}>{status}</div>
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono mt-1">
                      latency: {typeof step.latencyMs === 'number' ? `${step.latencyMs}ms` : 'UNKNOWN'} • provider: {step.provider || 'UNKNOWN'}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 text-[10px] font-mono border-t border-white/5 pt-3">
              <div className="text-slate-400">ROOT CAUSE: <span className="text-red-300">{executionTrace.pipeline.summary?.rootCause || 'UNKNOWN'}</span></div>
              <div className="text-slate-400">FAILED STEP: <span className="text-red-300">{executionTrace.pipeline.summary?.failedStep || 'UNKNOWN'}</span></div>
              <div className="text-slate-400">BOTTLENECK: <span className="text-amber-300">{executionTrace.pipeline.summary?.bottleneck ? `${executionTrace.pipeline.summary.bottleneck.step} (${executionTrace.pipeline.summary.bottleneck.latencyMs}ms)` : 'UNKNOWN'}</span></div>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-green-400 transition-colors">Memory Reads</div>
            <div className="text-2xl font-light text-green-400 font-mono drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]">{observability.memoryReads}</div>
          </div>
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-emerald-300 transition-colors">Memory Writes</div>
            <div className="text-2xl font-light text-emerald-300 font-mono drop-shadow-[0_0_15px_rgba(16,185,129,0.35)]">{observability.memoryWrites}</div>
          </div>
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-blue-300 transition-colors">LLM Calls</div>
            <div className="text-2xl font-light text-blue-300 font-mono drop-shadow-[0_0_15px_rgba(59,130,246,0.35)]">{observability.llmCalls}</div>
          </div>
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-amber-200 transition-colors">Avg Latency</div>
            <div className="text-2xl font-light text-amber-200 font-mono drop-shadow-[0_0_15px_rgba(245,158,11,0.35)]">{observability.avgLatencyMs}<span className="text-[10px] text-slate-400 ml-1">ms</span></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Errors</div>
            <div className="text-2xl font-light text-red-400 font-mono drop-shadow-[0_0_15px_rgba(239,68,68,0.35)]">{observability.errorCount}</div>
          </div>
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Cost Alerts</div>
            <div className="text-2xl font-light text-amber-400 font-mono drop-shadow-[0_0_15px_rgba(234,179,8,0.35)]">{observability.costAlertCount}</div>
          </div>
        </div>

        {/* Ecosystem Health */}
        <div className="group pt-4 border-t border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Ecosystem Health</div>
            <div className="text-[9px] text-slate-600 font-mono">LAST CHECK: {lastCheckTime}</div>
          </div>

          {(() => {
            const vitalsValues = Object.values(vitals);
            const hasDown = vitalsValues.includes('DOWN');
            const hasDegraded = vitalsValues.includes('DEGRADED');
            const hasUnknown = vitalsValues.includes('UNKNOWN');

            let overallStatus = 'HEALTHY';
            let overallColor = 'text-green-400';
            let overallGlow = 'drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]';

            if (hasDown) { overallStatus = 'DOWN'; overallColor = 'text-red-400'; overallGlow = 'drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]'; }
            else if (hasDegraded) { overallStatus = 'DEGRADED'; overallColor = 'text-yellow-400'; overallGlow = 'drop-shadow-[0_0_15px_rgba(234,179,8,0.4)]'; }
            else if (hasUnknown) { overallStatus = 'UNKNOWN'; overallColor = 'text-slate-300'; overallGlow = 'drop-shadow-[0_0_12px_rgba(148,163,184,0.35)]'; }

            return (
              <div className="mb-4">
                <div className="text-[9px] text-slate-500 mb-1 uppercase tracking-wider font-mono">System Status</div>
                <div className={`text-lg font-light tracking-widest font-mono ${overallColor} ${overallGlow}`}>{overallStatus}</div>
              </div>
            );
          })()}

          <div className="space-y-2 text-[10px] font-mono tracking-widest text-slate-300 border-t border-white/5 pt-4">
            {Object.entries(vitals).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={
                  val === 'DOWN' ? 'text-red-400'
                  : val === 'DEGRADED' ? 'text-yellow-400'
                  : val === 'HEALTHY' ? 'text-green-400'
                  : 'text-slate-400'
                }>{val}</span>
                <span>{key.replace(/([A-Z])/g, ' $1').toUpperCase().trim()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottleneck Panel */}
        <div className="group pt-4 border-t border-white/5">
          <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider font-mono">Bottleneck (P50 / P95 / P99)</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-white/5 rounded p-2">
              <div className="text-[9px] text-slate-500 font-mono">P50</div>
              <div className="text-xs text-emerald-300 font-mono">{typeof observability.latencyP50Ms === 'number' ? `${observability.latencyP50Ms}ms` : 'UNKNOWN'}</div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-[9px] text-slate-500 font-mono">P95</div>
              <div className="text-xs text-amber-300 font-mono">{typeof observability.latencyP95Ms === 'number' ? `${observability.latencyP95Ms}ms` : 'UNKNOWN'}</div>
            </div>
            <div className="bg-white/5 rounded p-2">
              <div className="text-[9px] text-slate-500 font-mono">P99</div>
              <div className="text-xs text-red-300 font-mono">{typeof observability.latencyP99Ms === 'number' ? `${observability.latencyP99Ms}ms` : 'UNKNOWN'}</div>
            </div>
          </div>
          {observability.topSlowComponents.length === 0 ? (
            <div className="text-[10px] text-slate-500 font-mono">No component latency telemetry.</div>
          ) : (
            <div className="space-y-2">
              {observability.topSlowComponents.map((c, idx) => (
                <div key={`${c.component}-${idx}`} className="bg-white/5 border border-white/5 rounded px-3 py-2">
                  <div className="text-[10px] text-slate-200 font-mono truncate">{c.component}</div>
                  <div className="text-[9px] text-slate-400 font-mono">p95:{typeof c.p95 === 'number' ? `${c.p95}ms` : 'UNKNOWN'} • p99:{typeof c.p99 === 'number' ? `${c.p99}ms` : 'UNKNOWN'} • avg:{typeof c.avg === 'number' ? `${c.avg}ms` : 'UNKNOWN'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Failures */}
        <div className="group pt-4 border-t border-white/5">
          <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider font-mono">Recent Known Failures</div>
          {observability.recentFailures.length === 0 ? (
            <div className="text-[10px] text-slate-500 font-mono">No known failures in current telemetry.</div>
          ) : (
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {observability.recentFailures.map((f, idx) => (
                <div key={`${f.type}-${idx}`} className="bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                  <div className="text-[10px] text-red-300 font-mono uppercase">{f.type}</div>
                  <div className="text-[10px] text-slate-300 mt-0.5">{String(f.message || 'Unknown').slice(0, 140)}</div>
                  <div className="text-[9px] text-slate-500 font-mono mt-1">{f.at ? new Date(f.at).toLocaleString('id-ID', { hour12: false }) : 'UNKNOWN'}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Orphan Nodes */}
        <div className="group pt-4 border-t border-white/5" title="Nodes that exist but are not connected to the Mamet knowledge graph.">
          <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Orphan Nodes</div>
          {(() => {
            const oc = stats.orphans || 0;
            let colorClass = 'text-[#00ff88] drop-shadow-[0_0_15px_rgba(0,255,136,0.4)]';
            if (oc >= 1 && oc <= 5) colorClass = 'text-[#ffcc00] drop-shadow-[0_0_15px_rgba(255,204,0,0.4)]';
            else if (oc > 5) colorClass = 'text-[#ff4444] drop-shadow-[0_0_15px_rgba(255,68,68,0.4)]';
            return <div className={`text-3xl font-light font-mono ${colorClass}`}>{oc}</div>;
          })()}
        </div>

        {/* Connected Nodes */}
        <div className="group pt-4 border-t border-white/5" title="Nodes with at least one active relation.">
          <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Connected Nodes</div>
          {(() => {
            const cc = stats.connected || 0;
            let colorClass = 'text-[#00ff88] drop-shadow-[0_0_15px_rgba(0,255,136,0.4)]';
            if (cc === 0) colorClass = 'text-[#ff4444] drop-shadow-[0_0_15px_rgba(255,68,68,0.4)]';
            else if (cc >= 1 && cc <= 20) colorClass = 'text-[#ffcc00] drop-shadow-[0_0_15px_rgba(255,204,0,0.4)]';
            return <div className={`text-3xl font-light font-mono ${colorClass}`}>{cc}</div>;
          })()}
        </div>
      </div>
    </div>
  );
}
