import React, { useState, useEffect } from 'react';
import { kernel } from '../../core/runtime/Kernel';
import { ShieldCheck, XCircle, CheckCircle, FileText } from 'lucide-react';

/**
 * EngineerApprovalDialog
 * Mendengarkan event Engineer:RequestApproval dan menampilkan dialog persetujuan.
 * User harus menyetujui/menolak sebelum Engineer menerapkan patch.
 */
export default function EngineerApprovalDialog() {
  const [pendingApproval, setPendingApproval] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (kernel.status !== 'RUNNING') return;

    let unsubscribe = null;
    try {
      const eventBus = kernel.serviceManager.get('EventBus');
      unsubscribe = eventBus.on('Engineer:RequestApproval', (payload) => {
        setPendingApproval(payload);
        setIsVisible(true);
      });
    } catch (e) {
      console.warn('[EngineerApprovalDialog] Gagal subscribe ke EventBus:', e);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleApprove = () => {
    if (!pendingApproval) return;
    
    const eventBus = kernel.serviceManager.get('EventBus');
    eventBus.emit('Engineer:ApprovalResponse', {
      patchId: pendingApproval.patchId,
      approved: true,
      timestamp: new Date().toISOString()
    });
    
    setIsVisible(false);
    setPendingApproval(null);
  };

  const handleReject = () => {
    if (!pendingApproval) return;
    
    const eventBus = kernel.serviceManager.get('EventBus');
    eventBus.emit('Engineer:ApprovalResponse', {
      patchId: pendingApproval.patchId,
      approved: false,
      timestamp: new Date().toISOString()
    });
    
    setIsVisible(false);
    setPendingApproval(null);
  };

  if (!isVisible || !pendingApproval) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-slate-200">Engineer Patch Approval</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Summary</p>
            <p className="text-sm text-slate-300">{pendingApproval.summary || 'No summary available'}</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Files to Modify</p>
            <div className="space-y-2">
              {pendingApproval.files && pendingApproval.files.map((file, idx) => (
                <div key={idx} className="bg-slate-950 rounded-lg p-3 border border-slate-800 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 truncate">{file.path}</p>
                    <p className="text-[10px] text-slate-500">{file.size} bytes • {file.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {pendingApproval.diff && (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Diff Preview</p>
              <pre className="bg-slate-950 rounded-lg p-3 border border-slate-800 text-xs text-slate-400 font-mono max-h-32 overflow-y-auto">
                {pendingApproval.diff}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-800 px-6 py-4 border-t border-slate-700 flex gap-3 justify-end">
          <button
            onClick={handleReject}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 transition-colors text-sm"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
          <button
            onClick={handleApprove}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors text-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}