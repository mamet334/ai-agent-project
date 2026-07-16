/**
 * RightPanel.jsx
 *
 * Panel kanan (Inspector) — menampilkan detail eksekusi agent:
 * reasoning, knowledge base, audit, tools, subagents, debug JSON.
 * Diekstrak dari AIAgent.jsx (baris 1895-2075).
 *
 * Props:
 *   - inspectorData: object | null  (data dari pesan agent terakhir)
 *   - inspectorParsedContent: { thinking, answer, isThinkingComplete }
 *   - openInspectorSection: string | null  (section yang terbuka: 'reasoning', dll)
 *   - knowledgeBase: Array<{ id, title }>
 *   - ThinkingBlock: React.Component
 *
 * DEBUG POINTS:
 *   - inspectorData === null: belum ada respons agent → tampil "Waiting..."
 *   - inspectorData.isStreaming: agent masih streaming → indikator "Live"
 *   - inspectorData.execution: array processing steps dari backend
 *   - inspectorData.rawJson: full JSON respons untuk debug mendalam
 *   - openInspectorSection: kontrol auto-open section 'reasoning' dari ChatMessageList
 */
import React from 'react';
import { Activity, BrainCircuit, Database, Settings, AlertTriangle } from 'lucide-react';

export default function RightPanel({
  inspectorData,
  inspectorParsedContent,
  openInspectorSection,
  knowledgeBase = [],
  ThinkingBlock
}) {
  return (
    <div className="hidden xl:flex w-[var(--right-width)] shrink-0 bg-[#0A0A0A] border-l border-white/5 flex-col overflow-hidden z-30 font-sans text-slate-300">

      {/* Header */}
      <div className="h-14 px-4 border-b border-white/5 flex items-center justify-between bg-[#0A0A0A] shrink-0">
        <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          Inspector
        </h2>
        {inspectorData?.isStreaming && (
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-[#0A0A0A] flex flex-col scrollbar-thin scrollbar-thumb-white/10">
        {inspectorData ? (
          <div className="flex flex-col">

            {/* ── EXECUTION CARD (Sticky) ── */}
            <div className="sticky top-0 z-10 bg-[#0A0A0A] border-b border-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-medium text-slate-400">Execution</h3>
                <div className="flex items-center gap-1.5">
                  {inspectorData.isStreaming ? (
                    <>
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] text-emerald-500 font-medium tracking-wider uppercase">Live</span>
                    </>
                  ) : (
                    <>
                      <span className="text-blue-500 text-[10px]">✓</span>
                      <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">Complete</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Duration</span>
                <span className="text-[11px] font-mono text-slate-300">{inspectorData.duration}s</span>
              </div>

              {inspectorData.execution?.length > 0 && (
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Processing Steps</span>
                  <div className="space-y-1.5">
                    {inspectorData.execution.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-300 leading-snug">
                        <span className="text-blue-500 mt-0.5 opacity-70">✓</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── REASONING CARD ── */}
            {(inspectorParsedContent?.thinking || inspectorData.execution?.length > 0) && (
              <details
                className="group border-b border-white/5"
                open={openInspectorSection === 'reasoning'}
              >
                <summary className="text-[11px] font-medium text-slate-400 p-4 cursor-pointer select-none flex items-center gap-1.5 outline-none transition-colors hover:text-slate-300">
                  <BrainCircuit className="w-3 h-3 opacity-70" /> Reasoning
                  <svg className="w-2.5 h-2.5 ml-auto group-open:rotate-180 transition-transform opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-4 pb-4">
                  <ThinkingBlock
                    thinking={inspectorParsedContent?.thinking}
                    processingSteps={inspectorData.execution}
                    duration={inspectorData.duration}
                    isThinkingComplete={!inspectorData.isStreaming || inspectorParsedContent?.isThinkingComplete}
                  />
                </div>
              </details>
            )}

            {/* ── KNOWLEDGE BASE CARD ── */}
            <div className="border-b border-white/5 p-4 space-y-2">
              <h3 className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                <Database className="w-3 h-3 opacity-70" /> Knowledge Base
              </h3>
              <div className="text-[11px] text-slate-300">{knowledgeBase.length} Files Loaded</div>
              {knowledgeBase.length > 0 && (
                <details className="group cursor-pointer">
                  <summary className="text-[10px] text-slate-500 hover:text-slate-300 select-none flex items-center gap-1 mt-1 transition-colors outline-none">
                    <svg className="w-2.5 h-2.5 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    View Details
                  </summary>
                  <div className="mt-2 space-y-1.5 pl-3 border-l border-white/5">
                    {knowledgeBase.map(doc => (
                      <div key={doc.id} className="text-[10px] text-slate-400 truncate" title={doc.title}>
                        {doc.title}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* ── AUDIT CARD ── */}
            <div className="border-b border-white/5 p-4 space-y-2">
              <h3 className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 opacity-70" /> Audit
              </h3>
              <div className="text-[11px] text-slate-500 italic">No audit data available</div>
            </div>

            {/* ── ADVANCED SECTION ── */}
            <div className="p-4">
              <details className="group cursor-pointer">
                <summary className="text-[11px] font-medium text-slate-400 hover:text-slate-300 select-none flex items-center gap-1.5 outline-none transition-colors">
                  <Settings className="w-3 h-3 opacity-70" /> Advanced
                  <svg className="w-2.5 h-2.5 ml-auto group-open:rotate-180 transition-transform opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="mt-3 space-y-3 pl-1">

                  {/* Tools */}
                  <details className="group/sub cursor-pointer">
                    <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                      <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Tools
                    </summary>
                    <div className="mt-1.5 pl-4 text-[10px] text-slate-500">
                      {inspectorData.tools?.length > 0 ? inspectorData.tools.join(', ') : 'No tools used'}
                    </div>
                  </details>

                  {/* Subagents */}
                  <details className="group/sub cursor-pointer">
                    <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                      <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Subagents
                    </summary>
                    <div className="mt-1.5 pl-4 text-[10px] text-slate-500 italic">No subagents active</div>
                  </details>

                  {/* Memory */}
                  <details className="group/sub cursor-pointer">
                    <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                      <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Memory
                    </summary>
                    <div className="mt-1.5 pl-4 text-[10px] text-slate-500 italic">No memory accessed</div>
                  </details>

                  {/* Workspace */}
                  <details className="group/sub cursor-pointer">
                    <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                      <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Workspace
                    </summary>
                    <div className="mt-1.5 pl-4 text-[10px] text-slate-500 italic">No workspace context</div>
                  </details>

                  {/* Debug JSON — paling berguna saat debugging response backend */}
                  <details className="group/sub cursor-pointer">
                    <summary className="text-[11px] text-slate-500 hover:text-slate-400 select-none flex items-center gap-1 outline-none">
                      <svg className="w-2.5 h-2.5 group-open/sub:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Debug JSON
                    </summary>
                    <div className="mt-2 pl-2">
                      <pre className="text-[9px] text-slate-500 font-mono bg-white/5 p-2 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(inspectorData.rawJson, null, 2)}
                      </pre>
                    </div>
                  </details>

                </div>
              </details>
            </div>

          </div>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-600 text-center">
            <Activity className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-[11px]">Waiting for agent response...</p>
          </div>
        )}
      </div>
    </div>
  );
}
