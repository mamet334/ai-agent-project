import React, { useState, useEffect, useMemo } from 'react';
import { kernel } from '../../core/runtime/Kernel';
import { 
  ShieldCheck, ShieldAlert, XCircle, CheckCircle, FileText, 
  AlertTriangle, ChevronDown, ChevronRight, CheckSquare, Square, Lock
} from 'lucide-react';

export default function EngineerApprovalDialog() {
  const [pendingApproval, setPendingApproval] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [expandedFiles, setExpandedFiles] = useState(new Set());

  useEffect(() => {
    if (kernel.status !== 'RUNNING') return;

    let unsubscribe = null;
    try {
      const eventBus = kernel.serviceManager.get('EventBus');
      unsubscribe = eventBus.on('Engineer:RequestApproval', (payload) => {
        setPendingApproval(payload.data || payload); // Handle wrapped/unwrapped payload
        setIsVisible(true);
        // Default: select all mutable files
        const mutableFiles = (payload.data?.files || payload.files || [])
          .filter(f => !f.isImmutable)
          .map(f => f.path);
        setSelectedFiles(new Set(mutableFiles));
      });
    } catch (e) {
      console.warn('[EngineerApprovalDialog] Gagal subscribe ke EventBus:', e);
    }

    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const toggleFileSelection = (path) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleExpand = (path) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleApproveSelected = () => {
    if (!pendingApproval || selectedFiles.size === 0) return;
    const eventBus = kernel.serviceManager.get('EventBus');
    eventBus.emit('Engineer:ApprovalResponse', {
      patchId: pendingApproval.patchId,
      approved: true,
      approvedFiles: Array.from(selectedFiles), // Granular approval
      timestamp: new Date().toISOString()
    });
    setIsVisible(false);
    setPendingApproval(null);
  };

  const handleRejectAll = () => {
    if (!pendingApproval) return;
    const eventBus = kernel.serviceManager.get('EventBus');
    eventBus.emit('Engineer:ApprovalResponse', {
      patchId: pendingApproval.patchId,
      approved: false,
      approvedFiles: [],
      timestamp: new Date().toISOString()
    });
    setIsVisible(false);
    setPendingApproval(null);
  };

  // Compute Alerts
  const alerts = useMemo(() => {
    if (!pendingApproval) return { critical: [], warnings: [] };
    const files = pendingApproval.files || [];
    const critical = [];
    const warnings = [];

    if (files.some(f => f.isImmutable)) {
      critical.push('🚫 PERCOBAAN MODIFIKASI CORE DIBLOKIR OLEH SISTEM (IMMUTABLE FILES DETECTED)');
    }
    if (files.some(f => f.isProtected)) {
      warnings.push('⚠️ Patch ini mengubah file PROTECTED (Service Layer / Agent Process). Tinjau dengan sangat hati-hati.');
    }
    
    const compliance = pendingApproval.compliance;
    if (compliance?.violations?.length > 0) {
      critical.push(`🔴 Ditemukan ${compliance.violations.length} Pelanggaran MAEF (Lihat detail di bawah).`);
    }
    if (compliance?.warnings?.length > 0) {
      warnings.push(`🟡 Ditemukan ${compliance.warnings.length} Peringatan MAEF.`);
    }

    return { critical, warnings };
  }, [pendingApproval]);

  if (!isVisible || !pendingApproval) return null;

  const confidence = pendingApproval.confidence || { level: 'UNKNOWN', coverage: 0, evidence: 0 };
  const confColor = confidence.level === 'HIGH' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 
                    confidence.level === 'MEDIUM' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' : 
                    'text-red-400 bg-red-500/10 border-red-500/30';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* HEADER & METRICS */}
        <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-100">Executive Engineering Approval</h2>
              <p className="text-xs text-slate-400">Patch ID: {pendingApproval.patchId}</p>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider ${confColor}`}>
            Confidence: {confidence.level}
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scrollbar">
          
          {/* SUMMARY */}
          <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
            <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Executive Summary</p>
            <p className="text-sm text-slate-200 leading-relaxed">{pendingApproval.summary || 'No summary provided by Engineer.'}</p>
          </div>

          {/* CRITICAL ALERTS (CORE PROTECTION & MAEF VIOLATIONS) */}
          {alerts.critical.length > 0 && (
            <div className="bg-red-950/40 border border-red-500/50 p-4 rounded-xl flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                {alerts.critical.map((msg, i) => <p key={i} className="text-sm text-red-300 font-medium">{msg}</p>)}
              </div>
            </div>
          )}

          {/* WARNINGS */}
          {alerts.warnings.length > 0 && (
            <div className="bg-yellow-950/30 border border-yellow-500/30 p-4 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                {alerts.warnings.map((msg, i) => <p key={i} className="text-sm text-yellow-300">{msg}</p>)}
              </div>
            </div>
          )}

          {/* METRICS BAR */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-center">
              <p className="text-[10px] text-slate-500 uppercase">Coverage</p>
              <p className="text-lg font-bold text-slate-200">{confidence.coverage}%</p>
            </div>
            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-center">
              <p className="text-[10px] text-slate-500 uppercase">Evidence</p>
              <p className="text-lg font-bold text-slate-200">{confidence.evidence}/100</p>
            </div>
            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-center">
              <p className="text-[10px] text-slate-500 uppercase">Files</p>
              <p className="text-lg font-bold text-slate-200">{pendingApproval.files?.length || 0}</p>
            </div>
          </div>

          {/* GRANULAR FILE LIST & DIFF VIEWER */}
          <div>
            <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Proposed Changes (Select to Approve)</p>
            <div className="space-y-2">
              {pendingApproval.files?.map((file, idx) => {
                const isSelected = selectedFiles.has(file.path);
                const isExpanded = expandedFiles.has(file.path);
                const isImmutable = file.isImmutable;

                return (
                  <div key={idx} className={`border rounded-xl overflow-hidden transition-all ${isImmutable ? 'border-red-500/50 bg-red-950/10' : isSelected ? 'border-emerald-500/50 bg-slate-800/40' : 'border-slate-700 bg-slate-800/20'}`}>
                    
                    {/* File Header */}
                    <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => !isImmutable && toggleFileSelection(file.path)}>
                      {!isImmutable ? (
                        isSelected ? <CheckSquare className="w-5 h-5 text-emerald-400 shrink-0" /> : <Square className="w-5 h-5 text-slate-500 shrink-0" />
                      ) : (
                        <Lock className="w-5 h-5 text-red-400 shrink-0" />
                      )}
                      
                      <button onClick={(e) => { e.stopPropagation(); toggleExpand(file.path); }} className="text-slate-400 hover:text-slate-200">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 font-mono truncate">{file.path}</p>
                        <p className="text-[10px] text-slate-500">
                          {file.size} bytes 
                          {isImmutable && <span className="text-red-400 font-bold ml-2">IMMUTABLE (AUTO-REJECTED)</span>}
                          {file.isProtected && <span className="text-yellow-400 font-bold ml-2">PROTECTED</span>}
                        </p>
                      </div>
                    </div>

                    {/* Expanded Code Viewer */}
                    {isExpanded && (
                      <div className="border-t border-slate-700/50 bg-slate-950 p-4 max-h-64 overflow-auto custom-scrollbar">
                        <p className="text-[10px] text-slate-500 uppercase mb-2">Proposed New Content:</p>
                        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">
                          {file.newContent || '(Empty file)'}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="bg-slate-800/80 px-6 py-4 border-t border-slate-700 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-400">
            {selectedFiles.size} dari {pendingApproval.files?.filter(f => !f.isImmutable).length} file dipilih.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleRejectAll}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 transition-colors text-sm font-medium"
            >
              <XCircle className="w-4 h-4" /> Reject All
            </button>
            <button
              onClick={handleApproveSelected}
              disabled={selectedFiles.size === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors text-sm font-bold shadow-lg shadow-emerald-500/20"
            >
              <CheckCircle className="w-4 h-4" /> Approve Selected ({selectedFiles.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}