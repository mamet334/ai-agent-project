/**
 * ChatMessageList.jsx
 *
 * Daftar pesan (user + agent) + loading indicator.
 * Diekstrak dari AIAgent.jsx (baris 1523-1778).
 *
 * Props:
 *   - messages: Message[]
 *   - loading: boolean
 *   - logs: string[]
 *   - currentlyTypingId: number | null
 *   - setCurrentlyTypingId: React setState function
 *   - selectedTools: string[]
 *   - workspaceHandle: FileSystemDirectoryHandle | null
 *   - toolIcons: Record<string, JSX.Element>
 *   - messagesEndRef: React.RefObject
 *   - setInspectorFocusedId: React setState function
 *   - setOpenInspectorSection: React setState function
 *   - parseThinkingContent: (text: string) => { thinking, answer, isThinkingComplete }
 *   - ThinkingBlock: React.Component
 *   - TypewriterText: React.Component
 *   - MessageContent: React.Component
 *   - CopyButton: React.Component
 *
 * DEBUG POINTS:
 *   - messages.length === 0: tampil welcome screen
 *   - isStreaming: pesan masih streaming, content bertambah real-time
 *   - currentlyTypingId: ID pesan yang sedang typewriter effect
 *   - message.subagentRuns: lihat detail orkestrasi sub-agent
 *   - message.groundingSources: lihat referensi web yang digunakan
 */
import React from 'react';
import { BrainCircuit, Code2, Zap, MessageCircle } from 'lucide-react';

export default function ChatMessageList({
  messages,
  loading,
  logs,
  currentlyTypingId,
  setCurrentlyTypingId,
  selectedTools,
  workspaceHandle,
  toolIcons,
  messagesEndRef,
  setInspectorFocusedId,
  setOpenInspectorSection,
  parseThinkingContent,
  ThinkingBlock,
  TypewriterText,
  MessageContent,
  CopyButton
}) {
  if (messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-slate-800/80 border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-2xl text-purple-400">
          <Zap className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Selamat datang di AI Agent</h2>
        <p className="text-slate-400 max-w-md mb-8">
          Pilih tools yang ingin digunakan, kemudian mulai percakapan. Agent akan memproses
          permintaan menggunakan kombinasi tools yang Anda aktifkan.
        </p>
        <div className="flex gap-2">
          {selectedTools.map(tool => (
            <div key={tool} className="flex items-center gap-2 px-3 py-1 bg-purple-500/20 rounded-full text-sm text-purple-300">
              {toolIcons[tool]}
              {tool.replace('_', ' ')}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {messages.map(message => (
        <div
          key={message.id}
          className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}
        >
          <div
            className={`relative max-w-[95%] md:max-w-4xl ${
              message.type === 'user'
                ? 'bg-slate-800 border border-white/5 rounded-2xl rounded-tr-sm text-slate-200'
                : 'bg-slate-800/50 backdrop-blur rounded-2xl rounded-tl-sm border border-purple-500/30 pb-10'
            } px-3 md:px-5 py-2.5 md:py-3.5`}
          >
            {/* View Reasoning Shortcut */}
            {message.type === 'agent' && !message.isStreaming && message.content && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => {
                    setInspectorFocusedId(message.id);
                    setOpenInspectorSection('reasoning');
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1.5 border border-white/5 rounded-md px-2.5 py-1.5 bg-[#0A0A0A]/50 transition-colors w-max shadow-sm"
                >
                  <BrainCircuit className="w-3 h-3 opacity-70" /> View Reasoning
                </button>
              </div>
            )}

            {/* Chain-of-Thought / Thinking Block */}
            {message.type === 'agent' && (() => {
              const { thinking, isThinkingComplete } = parseThinkingContent(message.content);
              return (thinking || (message.processingSteps?.length > 0)) ? (
                <ThinkingBlock
                  thinking={thinking}
                  processingSteps={message.processingSteps}
                  duration={message.thinkingDuration}
                  isThinkingComplete={!message.isStreaming || isThinkingComplete}
                />
              ) : null;
            })()}

            {/* Message Content */}
            {message.type === 'agent' && currentlyTypingId === message.id && !message.isStreaming
              ? <TypewriterText
                  text={parseThinkingContent(message.content).answer}
                  onComplete={() => setCurrentlyTypingId(null)}
                  workspaceHandle={workspaceHandle}
                />
              : message.type === 'agent'
                ? (() => {
                    const parsed = parseThinkingContent(message.content);
                    let answerText = parsed.answer;
                    if (message.isStreaming && parsed.isThinkingComplete) {
                      answerText += ' ▍';
                    }
                    return <MessageContent text={answerText} workspaceHandle={workspaceHandle} />;
                  })()
                : <MessageContent text={message.content || ''} workspaceHandle={workspaceHandle} />
            }

            {/* Copy Button */}
            {message.type === 'agent' && !message.isStreaming && message.content && (
              <CopyButton text={parseThinkingContent(message.content).answer} />
            )}

            {/* Tools Used */}
            {message.tools?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 mb-2">
                {message.tools.map(tool => (
                  <span key={tool} className="text-xs px-2 py-1 bg-slate-700/50 rounded-full flex items-center gap-1">
                    {toolIcons[tool]}
                    {tool.replace('_', ' ')}
                  </span>
                ))}
              </div>
            )}

            {/* Grounding Sources */}
            {message.groundingSources?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-purple-500/10">
                <p className="text-[10px] text-slate-400 font-semibold mb-1.5 uppercase tracking-wider">Sumber Referensi:</p>
                <div className="flex flex-wrap gap-1.5">
                  {message.groundingSources.map((source, index) => (
                    <a
                      key={index}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/25 transition-all truncate max-w-xs inline-flex items-center gap-1"
                    >
                      <Zap className="w-2.5 h-2.5 shrink-0" />
                      {source.title}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Tool Execution Details */}
            {message.toolExecution && (
              <div className="mt-3 p-3 bg-slate-900/80 rounded-lg text-[11px] border border-purple-500/20 font-mono">
                <div className="flex items-center gap-1.5 text-purple-400 font-semibold mb-1.5">
                  <Code2 className="w-3.5 h-3.5" />
                  Eksekusi Tool: {message.toolExecution.name}
                </div>
                <div className="text-slate-300 bg-black/40 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {message.toolExecution.name === 'execute_javascript' && (
                    <>
                      <span className="text-slate-500">// Kode yang dijalankan:</span>
                      <pre className="text-blue-300 mt-1">{message.toolExecution.args.code}</pre>
                    </>
                  )}
                  {message.toolExecution.name === 'make_api_call' && (
                    <>
                      <span className="text-slate-500">// HTTP Request:</span>
                      <div className="text-green-300 mt-1">{message.toolExecution.args.method} {message.toolExecution.args.url}</div>
                      {message.toolExecution.args.body && (
                        <pre className="text-yellow-300 mt-1 text-[10px]">{message.toolExecution.args.body}</pre>
                      )}
                    </>
                  )}
                  {message.toolExecution.name === 'post_to_slack' && (
                    <>
                      <span className="text-slate-500">// Kirim Slack:</span>
                      <div className="text-yellow-300 mt-1">{message.toolExecution.args.message}</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Sub-agent Runs */}
            {message.subagentRuns?.length > 0 && (
              <details className="mt-4 group">
                <summary className="text-xs font-semibold text-slate-400 hover:text-purple-400 flex items-center gap-2 cursor-pointer list-none transition-colors select-none">
                  <div className="flex items-center gap-1 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-700/50 group-hover:border-purple-500/30">
                    <BrainCircuit className="w-3.5 h-3.5 animate-pulse text-purple-400" />
                    <span>Proses Orkestrasi AI ({message.subagentRuns.length} langkah)</span>
                    <svg className="w-3.5 h-3.5 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </summary>
                <div className="mt-3 border-l-2 border-purple-500/30 pl-4 space-y-4 ml-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  {message.subagentRuns.map((run, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-purple-500 border border-slate-950 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                      <div className="bg-slate-950/60 rounded-xl p-3 border border-purple-500/10 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-blue-400 capitalize">🤖 Sub-Agent: {run.subagent}</span>
                          <span className="text-[9px] text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded font-mono">SUCCESS</span>
                        </div>
                        <div className="text-slate-400 italic mb-1.5">Tugas: {run.task}</div>
                        <div className="text-slate-300 bg-black/40 p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto font-sans leading-relaxed text-[11px]">
                          {run.output}
                        </div>
                        {run.sources?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-800/40">
                            <div className="text-[10px] text-slate-400 mb-1">Referensi:</div>
                            <div className="flex flex-wrap gap-1.5">
                              {run.sources.map((src, sIdx) => (
                                <a key={sIdx} href={src.uri} target="_blank" rel="noopener noreferrer"
                                  className="text-[10px] text-purple-300 hover:text-purple-100 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full transition-all truncate max-w-xs flex items-center gap-1">
                                  <Zap className="w-2.5 h-2.5" /> {src.title}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {run.toolExecution && (
                          <div className="mt-2 pt-2 border-t border-slate-800/40 font-mono text-[9px] text-purple-400 flex items-center gap-1">
                            <Code2 className="w-3 h-3" /> Eksekusi Tool: {run.toolExecution.name}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Timestamp */}
            <div className="text-xs opacity-50 mt-2">
              {message.timestamp instanceof Date
                ? message.timestamp.toLocaleTimeString('id-ID')
                : new Date(message.timestamp).toLocaleTimeString('id-ID')}
            </div>
          </div>
        </div>
      ))}

      {/* Loading / Thinking Indicator */}
      {loading && (
        <div className="flex justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-slate-800/50 backdrop-blur rounded-3xl rounded-tl-lg border border-purple-500/30 px-4 py-3 max-w-md w-full">
            <details className="group" open>
              <summary className="text-xs font-semibold text-slate-400 hover:text-purple-400 flex items-center gap-2 cursor-pointer list-none transition-colors select-none">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-100" />
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-200" />
                  <span className="ml-1 text-purple-400 italic font-mono">Berpikir dan Orkestrasi...</span>
                  <svg className="w-3.5 h-3.5 text-slate-500 group-open:rotate-180 transition-transform ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </summary>
              <div className="mt-3 ml-2 border-l-2 border-purple-500/20 pl-3">
                <div className="font-mono text-[10px] text-purple-300 space-y-1 bg-slate-950/70 p-3 rounded-lg border border-purple-500/10 max-h-40 overflow-y-auto w-full">
                  {logs.map((log, index) => (
                    <div key={index} className="flex items-start gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300">
                      <span className="text-green-500 select-none mt-0.5">&gt;</span>
                      <span className="leading-relaxed">{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  );
}
