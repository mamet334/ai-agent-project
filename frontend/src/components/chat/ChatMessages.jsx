import React, { useEffect, useRef } from 'react';
import { BrainCircuit, Activity, MessageCircle, Zap, X, Check, Copy, Clock, Code2, FileText, Download, FolderOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, CartesianGrid, Legend } from 'recharts';

// Mermaid
const Mermaid = ({ chart }) => {
  const chartRef = useRef(null);
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    if (chartRef.current) {
      try {
        const uniqueId = `mermaid-${Math.random().toString(36).substring(2)}`;
        mermaid.render(uniqueId, chart).then(({ svg }) => {
          if (chartRef.current) chartRef.current.innerHTML = svg;
        }).catch(e => {
          if (chartRef.current) chartRef.current.innerHTML = `<div class="text-red-400 p-2 text-xs">Error rendering chart: ${e.message}</div>`;
        });
      } catch (err) { console.error(err); }
    }
  }, [chart]);
  return <div ref={chartRef} className="mermaid flex justify-center my-6 bg-slate-900/60 p-6 rounded-xl border border-purple-500/20 w-full overflow-x-auto shadow-inner shadow-black/50" />;
};

// Copy Button
const CopyButton = ({ text }) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/50 hover:border-slate-600 transition-all z-10" title="Copy message">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

// Code Copy Button
const CodeCopyButton = ({ text }) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors font-medium bg-slate-800/50 hover:bg-slate-700/50 px-2 py-1 rounded" title="Copy code">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? <span className="text-green-400">Copied!</span> : 'Copy'}
    </button>
  );
};

// Message Content
const MessageContent = ({ text, workspaceHandle }) => {
  if (!text) return null;
  return (
    <div className="relative group prose prose-sm prose-invert prose-purple max-w-none leading-normal prose-pre:bg-slate-950/80 prose-pre:border prose-pre:border-purple-500/20 prose-code:text-purple-300 prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-td:border-purple-500/20 prose-th:border-purple-500/20 prose-tr:border-purple-500/20">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({node, inline, className, children, ...props}) {
            const match = /language-([a-zA-Z0-9_-]+)/i.exec(className || '');
            let lang = match ? match[1].toLowerCase().replace('-', '_') : '';
            const rawContent = String(children);
            if (!inline && lang === 'mermaid') return <Mermaid chart={rawContent.replace(/\n$/, '')} />
            const isZipBlock = lang === 'json_zip' || lang === 'xml_zip' || rawContent.includes('<file name=');
            if (!inline && isZipBlock) {
              try {
                let config = { filename: 'project.zip', files: [] };
                if (lang === 'json_zip') {
                  config = JSON.parse(rawContent.replace(/\n$/, ''));
                } else {
                  const filenameMatch = rawContent.match(/<filename>([\s\S]*?)<\/filename>/i);
                  if (filenameMatch) config.filename = filenameMatch[1].trim();
                  const fileRegex = /<file\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/file>/gi;
                  let fileMatch;
                  while ((fileMatch = fileRegex.exec(rawContent)) !== null) {
                    let fileContent = fileMatch[2];
                    if (fileContent.startsWith('\n')) fileContent = fileContent.substring(1);
                    if (fileContent.endsWith('\n')) fileContent = fileContent.substring(0, fileContent.length - 1);
                    config.files.push({ name: fileMatch[1].trim(), content: fileContent });
                  }
                  if (config.files.length === 0) throw new Error("No XML file tags found");
                }
                const handleDownloadZip = async () => {
                  const zip = new JSZip();
                  if (config.files && Array.isArray(config.files)) {
                    config.files.forEach(f => zip.file(f.name, f.content));
                  }
                  const content = await zip.generateAsync({ type: 'blob' });
                  saveAs(content, config.filename || 'mamet_project.zip');
                };
                const handleSaveToWorkspace = async () => {
                  alert('Fitur Simpan ke Workspace akan diaktifkan di ChatInput');
                };
                return (
                  <div className="w-full mt-4 mb-4 bg-slate-900/80 p-4 rounded-xl border border-emerald-500/30 shadow-lg shadow-emerald-500/10 flex flex-col items-center justify-center">
                    <div className="text-emerald-400 mb-2 font-bold flex items-center gap-2"><FileText className="w-5 h-5" /> File Project Siap Dieksekusi</div>
                    <p className="text-xs text-slate-400 mb-4 text-center">Mamet telah merakit {config.files?.length || 0} file untuk Anda ({config.filename || 'project.zip'})</p>
                    <div className="flex items-center gap-3">
                      <button onClick={handleDownloadZip} className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-semibold transition-all"><Download className="w-4 h-4" /> Download ZIP</button>
                      <button onClick={handleSaveToWorkspace} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-all shadow-lg shadow-emerald-500/20"><FolderOpen className="w-4 h-4" /> Simpan ke Workspace</button>
                    </div>
                  </div>
                );
              } catch(e) {
                if (e.message === "No XML file tags found") {
                  return (
                    <div className="relative group rounded-xl overflow-hidden my-4 border border-purple-500/20 shadow-lg shadow-purple-500/10">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-purple-500/20"><span className="text-[10px] text-purple-400 font-mono uppercase tracking-wider">{lang || 'Code'}</span><CodeCopyButton text={rawContent} /></div>
                      <pre className="p-4 overflow-x-auto whitespace-pre-wrap break-words text-sm text-slate-300" {...props}><code className={className}>{children}</code></pre>
                    </div>
                  );
                }
                return <div className="text-red-400 text-xs p-2 border border-red-500/20 bg-red-500/10 rounded">Gagal membuat ZIP: {e.message}</div>;
              }
            }
            if (!inline && lang === 'json_chart') {
              try {
                const config = JSON.parse(String(children).replace(/\n$/, ''));
                const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
                return (
                  <div className="w-full h-64 mt-4 mb-4 bg-slate-900/50 p-4 rounded-xl border border-purple-500/20">
                    <h4 className="text-center text-xs font-bold text-slate-300 mb-2">{config.title || 'Data Chart'}</h4>
                    <ResponsiveContainer width="100%" height="100%">
                      {config.type === 'line' ? (
                        <LineChart data={config.data}><CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey={config.xKey || 'name'} stroke="#94a3b8" fontSize={10} /><YAxis stroke="#94a3b8" fontSize={10} /><Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #8b5cf6', borderRadius: '8px' }} /><Legend /><Line type="monotone" dataKey={config.yKey || 'value'} stroke="#8b5cf6" strokeWidth={2} activeDot={{ r: 8 }} /></LineChart>
                      ) : config.type === 'pie' ? (
                        <PieChart><Pie data={config.data} cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={5} dataKey={config.yKey || 'value'}>{config.data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #8b5cf6', borderRadius: '8px' }} /><Legend /></PieChart>
                      ) : (
                        <BarChart data={config.data}><CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey={config.xKey || 'name'} stroke="#94a3b8" fontSize={10} /><YAxis stroke="#94a3b8" fontSize={10} /><Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #8b5cf6', borderRadius: '8px' }} /><Legend /><Bar dataKey={config.yKey || 'value'} fill="#8b5cf6" radius={[4, 4, 0, 0]} /></BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                );
              } catch(e) { return <div className="text-red-400 text-xs p-2 border border-red-500/20 bg-red-500/10 rounded">Gagal merender grafik: {e.message}</div>; }
            }
            return !inline ? (
              <div className="relative group rounded-xl overflow-hidden my-4 border border-purple-500/20 shadow-lg shadow-purple-500/10">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-purple-500/20"><span className="text-[10px] text-purple-400 font-mono uppercase tracking-wider">{lang || 'Code'}</span><CodeCopyButton text={rawContent} /></div>
                <pre className="p-4 overflow-x-auto whitespace-pre-wrap break-words text-sm text-slate-300" {...props}><code className={className}>{children}</code></pre>
              </div>
            ) : (
              <code className="bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded-md text-xs border border-purple-500/20" {...props}>{children}</code>
            )
          },
          table({node, ...props}) { return <div className="overflow-x-auto my-4 rounded-xl border border-purple-500/20"><table className="w-full text-left" {...props} /></div> }
        }}
      >{text}</ReactMarkdown>
    </div>
  );
};

// Typewriter Text
const TypewriterText = ({ text, onComplete, workspaceHandle }) => {
  const [displayed, setDisplayed] = React.useState('');
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    if (!text) return;
    let i = 0;
    const speed = 12;
    const chars = 3;
    const interval = setInterval(() => {
      i += chars;
      if (i >= text.length) { setDisplayed(text); setDone(true); clearInterval(interval); if (onComplete) onComplete(); }
      else { setDisplayed(text.substring(0, i)); }
    }, speed);
    return () => clearInterval(interval);
  }, [text]);
  return <MessageContent text={done ? text : displayed + ' ▍'} workspaceHandle={workspaceHandle} />;
};

// Thinking Block
const ThinkingBlock = ({ thinking, processingSteps, duration, isThinkingComplete }) => {
  if (!thinking && (!processingSteps || processingSteps.length === 0)) return null;
  const [liveDuration, setLiveDuration] = React.useState(duration || 0);
  React.useEffect(() => {
    if (isThinkingComplete) { if (duration) setLiveDuration(duration); return; }
    const timer = setInterval(() => setLiveDuration(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isThinkingComplete, duration]);
  return (
    <details className="mb-4 group border-l border-slate-600/30 pl-3 ml-1" open={true}>
      <summary className="text-xs font-semibold text-slate-500 hover:text-purple-400 flex items-center gap-1.5 cursor-pointer list-none transition-colors select-none">
        <BrainCircuit className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
        <span>{!isThinkingComplete && !duration ? 'Berpikir...' : `Berpikir selama ${liveDuration || duration || 1} detik`}</span>
        <svg className="w-3 h-3 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </summary>
      <div className="mt-2.5 text-xs text-slate-400/90 space-y-2.5 leading-relaxed">
        {processingSteps && processingSteps.length > 0 && (
          <div className="space-y-1.5 pb-2.5 border-b border-slate-700/30 font-mono text-[10px] text-slate-500">
            {processingSteps.map((step, idx) => <div key={`step-${idx}`} className="flex items-start gap-1.5"><span className="text-blue-500 select-none">✓</span><span>{step}</span></div>)}
          </div>
        )}
        {thinking && (
          <div className="space-y-2 text-slate-400/80">
            {thinking.split('\n').filter(l => l.trim()).map((line, idx) => <p key={`thinking-${idx}`} className="m-0 leading-relaxed">{line.trim()}</p>)}
          </div>
        )}
      </div>
    </details>
  );
};

// Parser
const parseThinkingContent = (text) => {
  if (!text) return { thinking: '', answer: '', isThinkingComplete: false };
  let normalizedText = text.replace(/(?:&lt;|<)think(?:&gt;|>)/gi, '<think>').replace(/(?:&lt;|<)\/think(?:&gt;|>)/gi, '</think>');
  if (normalizedText.trim().toLowerCase().startsWith('think ') || normalizedText.trim().toLowerCase().startsWith('think\n')) {
    const idx = normalizedText.toLowerCase().indexOf('think');
    normalizedText = normalizedText.slice(0, idx) + '<think>' + normalizedText.slice(idx + 5);
  }
  if (normalizedText.includes('<think>') && !normalizedText.includes('</think>')) {
    let splitIdx = normalizedText.indexOf('\n\n');
    if (splitIdx === -1) {
      const greetingMatch = normalizedText.match(/(?:\bhalo\b|\bhai\b|\bhi\b|selamat pagi|selamat siang|selamat sore|selamat malam|assalamualaikum)/i);
      if (greetingMatch && greetingMatch.index > 10) splitIdx = greetingMatch.index;
    }
    if (splitIdx !== -1) normalizedText = normalizedText.slice(0, splitIdx) + '</think>\n\n' + normalizedText.slice(splitIdx);
  }
  const thinkCompleteRegex = /<think>([\s\S]*?)<\/think>/i;
  const completeMatch = normalizedText.match(thinkCompleteRegex);
  if (completeMatch) {
    const thinking = completeMatch[1].trim();
    const answer = normalizedText.replace(thinkCompleteRegex, '').trim();
    return { thinking, answer, isThinkingComplete: true };
  }
  const thinkStartRegex = /<think>([\s\S]*?)$/i;
  const startMatch = normalizedText.match(thinkStartRegex);
  if (startMatch) {
    const thinking = startMatch[1].trim();
    return { thinking, answer: '', isThinkingComplete: false };
  }
  return { thinking: '', answer: normalizedText, isThinkingComplete: true };
};

export default function ChatMessages({ messages, loading, logs, currentlyTypingId, workspaceHandle, messagesEndRef, onOpenInspector }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0A0A0A] relative">
      <div className="max-w-6xl mx-auto w-full min-h-full flex flex-col space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center flex-1">
            <div className="w-20 h-20 bg-slate-800/80 border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-2xl text-purple-400">
              <Zap className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-bold mb-2">Selamat datang di AI Agent</h2>
            <p className="text-slate-400 max-w-md mb-8">Pilih tools yang ingin digunakan, kemudian mulai percakapan.</p>
          </div>
        ) : (
          <>
            {messages.map(message => {
              const parsed = parseThinkingContent(message.content);
              // --- PERBAIKAN: Guard clause untuk timestamp ---
              let timeStr = '';
              if (message.timestamp) {
                try {
                  const dateObj = typeof message.timestamp === 'string' ? new Date(message.timestamp) : message.timestamp;
                  if (!isNaN(dateObj.getTime())) {
                    timeStr = dateObj.toLocaleTimeString('id-ID');
                  }
                } catch (e) { /* abaikan error date */ }
              }
              
              return (
                <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                  <div className={`relative max-w-[95%] md:max-w-4xl ${message.type === 'user' ? 'bg-slate-800 border border-white/5 rounded-2xl rounded-tr-sm text-slate-200' : 'bg-slate-800/50 backdrop-blur rounded-2xl rounded-tl-sm border border-purple-500/30 pb-10'} px-3 md:px-5 py-2.5 md:py-3.5`}>
                    {message.type === 'agent' && !message.isStreaming && message.content && (
                      <div className="flex justify-end mb-2">
                        <button onClick={() => onOpenInspector && onOpenInspector(message.id)} className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1.5 border border-white/5 rounded-md px-2.5 py-1.5 bg-[#0A0A0A]/50 transition-colors w-max shadow-sm">
                          <BrainCircuit className="w-3 h-3 opacity-70" /> View Reasoning
                        </button>
                      </div>
                    )}
                    {message.type === 'agent' && (parsed.thinking || (message.processingSteps && message.processingSteps.length > 0)) && (
                      <ThinkingBlock thinking={parsed.thinking} processingSteps={message.processingSteps} duration={message.thinkingDuration} isThinkingComplete={!message.isStreaming || parsed.isThinkingComplete} />
                    )}
                    {message.type === 'agent' && currentlyTypingId === message.id && !message.isStreaming ? (
                      <TypewriterText text={parsed.answer} onComplete={() => {}} workspaceHandle={workspaceHandle} />
                    ) : message.type === 'agent' ? (
                      <MessageContent text={parsed.answer + (message.isStreaming && parsed.isThinkingComplete ? ' ▍' : '')} workspaceHandle={workspaceHandle} />
                    ) : (
                      <MessageContent text={message.content || ''} workspaceHandle={workspaceHandle} />
                    )}
                    {message.type === 'agent' && !message.isStreaming && message.content && (
                      <CopyButton text={parsed.answer} />
                    )}
                    {message.tools && message.tools.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3 mb-2">
                        {message.tools.map(tool => <span key={tool} className="text-xs px-2 py-1 bg-slate-700/50 rounded-full flex items-center gap-1">{tool.replace('_', ' ')}</span>)}
                      </div>
                    )}
                    {message.subagentRuns && message.subagentRuns.length > 0 && (
                      <details className="mt-4 group">
                        <summary className="text-xs font-semibold text-slate-400 hover:text-purple-400 flex items-center gap-2 cursor-pointer list-none transition-colors select-none">
                          <div className="flex items-center gap-1 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-700/50 group-hover:border-purple-500/30">
                            <BrainCircuit className="w-3.5 h-3.5 animate-pulse text-purple-400" />
                            <span>Proses Orkestrasi AI ({message.subagentRuns.length} langkah)</span>
                            <svg className="w-3.5 h-3.5 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
                                <div className="text-slate-300 bg-black/40 p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto font-sans leading-relaxed text-[11px]">{run.output}</div>
                                {run.sources && run.sources.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-slate-800/40">
                                    <div className="text-[10px] text-slate-400 mb-1">Referensi:</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {run.sources.map((src, sIdx) => <a key={sIdx} href={src.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-300 hover:text-purple-100 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full transition-all truncate max-w-xs flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> {src.title}</a>)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {/* --- PERBAIKAN: Render timestamp dengan safe access --- */}
                    <div className="text-xs opacity-50 mt-2">
                      {timeStr || '—'}
                    </div>
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl rounded-tl-lg border border-purple-500/30 px-4 py-3 max-w-md w-full">
                  <details className="group" open>
                    <summary className="text-xs font-semibold text-slate-400 hover:text-purple-400 flex items-center gap-2 cursor-pointer list-none transition-colors select-none">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-100"></div>
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce delay-200"></div>
                        <span className="ml-1 text-purple-400 italic font-mono">Berpikir dan Orkestrasi...</span>
                        <svg className="w-3.5 h-3.5 text-slate-500 group-open:rotate-180 transition-transform ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </summary>
                    <div className="mt-3 ml-2 border-l-2 border-purple-500/20 pl-3">
                      <div className="font-mono text-[10px] text-purple-300 space-y-1 bg-slate-950/70 p-3 rounded-lg border border-purple-500/10 max-h-40 overflow-y-auto w-full">
                        {logs.map((log, index) => <div key={index} className="flex items-start gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300"><span className="text-green-500 select-none mt-0.5">&gt;</span><span className="leading-relaxed">{log}</span></div>)}
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  );
}