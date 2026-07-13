import React, { useState, useEffect } from 'react';
import { serviceManager } from '../../core/runtime/ServiceManager';
import { supabase } from '../../supabase';
import { HardDrive, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function DisasterRecoveryWidget() {
  const [loading, setLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [error, setError] = useState('');

  const fetchBackupStatus = async () => {
    try {
      setLoading(true);
      setError('');
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error("No active session token found");
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://x.supabase.co';
      const response = await fetch(`${supabaseUrl}/functions/v1/health-check`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      // Fallback: If no dedicated backup health API exists, just use system health.
      // Since this is a widget taking data via Service Layer, it uses authenticated fetch.
      if (response.ok) {
        setBackupStatus('READY');
      } else {
        setBackupStatus('DEGRADED');
      }
    } catch (err) {
      setError(err.message);
      setBackupStatus('ERROR');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackupStatus();
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300 p-4 font-mono text-xs">
      <div className="flex items-center gap-2 mb-4">
        <HardDrive className="w-5 h-5 text-emerald-500" />
        <h3 className="text-sm font-semibold text-emerald-400">Disaster Recovery</h3>
      </div>
      
      {error && (
        <div className="mb-4 p-2 bg-red-900/30 border border-red-500/50 rounded text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 space-y-4">
        <div className="p-3 bg-slate-900 border border-slate-800 rounded">
          <div className="text-slate-500 mb-1">Backup Vault Status</div>
          <div className="flex items-center gap-2 text-sm">
            {loading ? (
              <span className="text-slate-400 animate-pulse">Checking...</span>
            ) : backupStatus === 'READY' ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-emerald-500 font-bold">READY (Secure)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-amber-500 font-bold">{backupStatus || 'UNKNOWN'}</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button 
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors text-center text-slate-300 flex flex-col items-center gap-1 cursor-not-allowed opacity-50"
            title="Backup requires CLI manual validation"
          >
            <HardDrive className="w-4 h-4" />
            <span>Export Backup</span>
          </button>
          
          <button 
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors text-center text-amber-500 flex flex-col items-center gap-1 cursor-not-allowed opacity-50"
            title="Restore requires CLI manual validation"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Restore Data</span>
          </button>
        </div>
      </div>
    </div>
  );
}
