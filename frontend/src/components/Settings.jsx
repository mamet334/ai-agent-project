import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { kernel } from '../core/runtime/Kernel';
import { User, Mail, Shield, LogOut, Palette, Activity, Monitor, Bell, Cpu, Clock } from 'lucide-react';

export default function Settings() {
  const [owner, setOwner] = useState(null);
  const [health, setHealth] = useState(null);
  
  useEffect(() => {
    // Get owner from Kernel identity
    setOwner(kernel.identity.owner);
    setHealth(kernel.getHealth());
    
    // Periodically update health
    const interval = setInterval(() => {
      setHealth(kernel.getHealth());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (ms) => {
    if (!ms) return '0s';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    
    return parts.join(' ');
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-950 p-6 md:p-8 custom-scrollbar">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">System Settings</h2>
          <p className="text-slate-400 text-sm">Manage your Mamet Ecosystem profile and preferences.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column - Profile & Danger Zone */}
          <div className="space-y-6">
            
            {/* Identity Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg shadow-black/20">
              <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <User className="w-5 h-5 text-emerald-500" />
                </div>
                <h3 className="font-medium text-slate-200">Owner Identity</h3>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Full Name</label>
                  <div className="text-sm text-slate-300 font-medium bg-slate-950/50 px-3 py-2 rounded-md border border-slate-800/50">
                    {owner?.name || 'Loading...'}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Email Address
                  </label>
                  <div className="text-sm text-slate-300 bg-slate-950/50 px-3 py-2 rounded-md border border-slate-800/50">
                    {owner?.email || 'Loading...'}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block flex items-center gap-1">
                    <Shield className="w-3 h-3" /> System Role
                  </label>
                  <div className="text-sm text-emerald-400 bg-emerald-950/30 px-3 py-2 rounded-md border border-emerald-900/50 flex items-center gap-2 font-mono">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                    ADMINISTRATOR
                  </div>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-slate-900 border border-red-900/30 rounded-xl overflow-hidden shadow-lg shadow-black/20 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none"></div>
              <div className="p-4 bg-red-950/20 border-b border-red-900/30 flex items-center gap-3">
                <LogOut className="w-5 h-5 text-red-500" />
                <h3 className="font-medium text-red-200">Session</h3>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-400 mb-4">
                  Terminating your session will lock the control plane and stop background UI polling. Kernel state may persist locally.
                </p>
                <button
                  onClick={async () => await supabase.auth.signOut()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg transition-all duration-300 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] font-medium text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out of Ecosystem
                </button>
              </div>
            </div>
            
          </div>

          {/* Right Column - System & Preferences */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Preferences */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg shadow-black/20">
              <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  <Palette className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="font-medium text-slate-200">Preferences</h3>
              </div>
              <div className="p-0 divide-y divide-slate-800/50">
                <div className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                  <div>
                    <div className="text-sm font-medium text-slate-300">Interface Theme</div>
                    <div className="text-xs text-slate-500 mt-0.5">Customize the visual appearance</div>
                  </div>
                  <select className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 transition-colors">
                    <option>MAEF Dark (Default)</option>
                    <option>Light Mode</option>
                    <option>System Sync</option>
                  </select>
                </div>
                <div className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                  <div>
                    <div className="text-sm font-medium text-slate-300">Notification Sounds</div>
                    <div className="text-xs text-slate-500 mt-0.5">Play sounds on orchestration events</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" value="" className="sr-only peer" defaultChecked />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Kernel Status */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg shadow-black/20 relative">
              <div className="absolute top-0 right-0 p-4">
                <div className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </div>
              </div>
              <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Activity className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="font-medium text-slate-200">MAEF Kernel Diagnostics</h3>
              </div>
              
              <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                    <Activity className="w-3 h-3" /> Status
                  </div>
                  <div className="text-emerald-400 font-mono text-sm">{health?.status || 'UNKNOWN'}</div>
                </div>
                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                    <Clock className="w-3 h-3" /> Uptime
                  </div>
                  <div className="text-slate-300 font-mono text-sm">{formatUptime(health?.uptime)}</div>
                </div>
                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                    <Cpu className="w-3 h-3" /> Phase
                  </div>
                  <div className="text-slate-300 font-mono text-sm">Level {health?.phase || 0}</div>
                </div>
                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                    <Monitor className="w-3 h-3" /> Events
                  </div>
                  <div className="text-slate-300 font-mono text-sm">{health?.totalEvents || 0} Traced</div>
                </div>
              </div>
              
            </div>

          </div>
        </div>
        
      </div>
    </div>
  );
}
