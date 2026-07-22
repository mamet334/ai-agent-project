import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { kernel } from '../core/runtime/Kernel';
import { User, Mail, Shield, LogOut, Palette, Activity, Monitor, Bell, Cpu, Clock, Brain, Key } from 'lucide-react';

export default function Settings() {
  const [user, setUser] = useState(null);
  const [health, setHealth] = useState(null);
  
  // AI Config State
  const [aiProvider, setAiProvider] = useState('openrouter');
  const [aiModel, setAiModel] = useState('anthropic/claude-3.5-sonnet');
  const [aiKey, setAiKey] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  
  useEffect(() => {
    // Get user from Kernel identity
    setUser(kernel.identity.user);
    setHealth(kernel.getHealth());

    // Fetch initial state from services
    const brainService = kernel.serviceManager?.get('BrainService');
    const vaultService = kernel.serviceManager?.get('VaultService');

    if (brainService) {
      const config = brainService.getBrainConfig();
      setAiProvider(config.provider);
      setAiModel(config.model);
    }
    if (vaultService && brainService) {
      const key = vaultService.getKey(brainService.getBrainConfig().provider) || '';
      setAiKey(key);
    }
    
    // Periodically update health
    const interval = setInterval(() => {
      setHealth(kernel.getHealth());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const handleSaveAiConfig = () => {
    const brainService = kernel.serviceManager?.get('BrainService');
    const vaultService = kernel.serviceManager?.get('VaultService');

    if (brainService) {
      brainService.setBrain(aiProvider, aiModel); // sekarang menyimpan model juga
    }
    if (vaultService) {
      vaultService.setKey(aiProvider, aiKey);
    }

    setSaveStatus('Saved!');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const [testStatus, setTestStatus] = useState('');
  const handleTestConnection = async () => {
    setTestStatus('testing');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        alert('Silakan login terlebih dahulu untuk tes koneksi.');
        setTestStatus('');
        return;
      }

      const endpoint = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: 'Halo, tes koneksi. Balas dengan "OK".',
          provider: aiProvider,
          model: aiModel,
          apiKey: aiKey,
          history: []
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setTestStatus('success');
      setTimeout(() => setTestStatus(''), 4000);
    } catch (err) {
      console.error('[Settings] Test connection failed:', err);
      setTestStatus(`error:${err.message}`);
      setTimeout(() => setTestStatus(''), 6000);
    }
  };


  const handleProviderChange = (newProvider) => {
    setAiProvider(newProvider);
    const vaultService = kernel.serviceManager?.get('VaultService');
    if (vaultService) {
      setAiKey(vaultService.getKey(newProvider) || '');
    }
  };

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
    <div className="flex-1 overflow-auto bg-background p-4 md:p-6 lg:p-8 custom-scrollbar font-body-base text-on-surface">
      <div className="max-w-screen-container-max mx-auto space-y-6 md:space-y-8">
        
        {/* Header */}
        <div className="mb-6 md:mb-12">
          <h1 className="font-display-lg text-display-lg text-on-surface mb-2">Settings</h1>
          <p className="text-on-surface-variant text-body-base">Configure your deep-dark AI workspace and management parameters.</p>
        </div>

        <div className="grid grid-cols-12 gap-4 md:gap-gutter">
          
          {/* AI Model Management — full width di mobile, 8/12 di desktop */}
          <section className="col-span-12 lg:col-span-8 glass-panel rim-light p-4 md:p-gutter rounded-xl border border-outline-variant relative overflow-hidden">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-primary-container/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">psychology</span>
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md">AI Model Management</h2>
                <p className="text-body-sm text-on-surface-variant">Select and provision inference engines</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <label className="text-label-mono text-on-surface-variant uppercase tracking-widest pl-1">Provider</label>
                <input
                  type="text"
                  list="provider-suggestions"
                  value={aiProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  placeholder="e.g. openrouter, openai, custom-provider"
                  className="w-full bg-surface-container-lowest border border-outline-variant px-5 py-4 rounded-lg text-on-surface font-body-base focus:border-primary focus:ring-0 pulse-focus transition-all"
                />
                <datalist id="provider-suggestions">
                  <option value="openrouter" />
                  <option value="openai" />
                  <option value="anthropic" />
                  <option value="groq" />
                  <option value="gemini" />
                  <option value="local" />
                </datalist>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-label-mono text-on-surface-variant uppercase tracking-widest pl-1">Model ID</label>
                <input 
                  type="text"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="e.g. anthropic/claude-3.5-sonnet"
                  className="w-full bg-surface-container-lowest border border-outline-variant px-5 py-4 rounded-lg text-on-surface font-body-base focus:border-primary focus:ring-0 pulse-focus transition-all"
                />
              </div>

              {/* Status Grid */}
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="bg-surface-container-low border border-outline-variant/50 p-4 rounded-lg flex flex-col items-center gap-2 text-center group/card hover:border-primary/50 transition-colors">
                  <span className="material-symbols-outlined text-primary-fixed-dim" style={{fontVariationSettings: "'FILL' 1"}}>speed</span>
                  <span className="text-label-mono text-[10px] uppercase">Status</span>
                  <span className="text-on-surface font-semibold">{health?.status || 'UNKNOWN'}</span>
                </div>
                <div className="bg-surface-container-low border border-outline-variant/50 p-4 rounded-lg flex flex-col items-center gap-2 text-center group/card hover:border-primary/50 transition-colors">
                  <span className="material-symbols-outlined text-primary-fixed-dim" style={{fontVariationSettings: "'FILL' 1"}}>memory</span>
                  <span className="text-label-mono text-[10px] uppercase">Uptime</span>
                  <span className="text-on-surface font-semibold">{formatUptime(health?.uptime)}</span>
                </div>
                <div className="bg-surface-container-low border border-outline-variant/50 p-4 rounded-lg flex flex-col items-center gap-2 text-center group/card hover:border-primary/50 transition-colors">
                  <span className="material-symbols-outlined text-primary-fixed-dim" style={{fontVariationSettings: "'FILL' 1"}}>token</span>
                  <span className="text-label-mono text-[10px] uppercase">Events</span>
                  <span className="text-on-surface font-semibold">{health?.totalEvents || 0}</span>
                </div>
              </div>
            </div>
          </section>

          {/* API Key Management */}
          <section className="col-span-12 lg:col-span-4 glass-panel rim-light p-gutter rounded-xl border border-outline-variant flex flex-col">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-secondary-container/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-on-secondary-container">key</span>
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md">API Key</h2>
                <p className="text-body-sm text-on-surface-variant">Multi-key AI Access</p>
              </div>
            </div>
            
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input 
                    type="password" 
                    value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)}
                    placeholder="Enter API Key" 
                    className="w-full bg-surface-container-lowest border border-outline-variant px-4 py-3 rounded-lg text-on-surface font-label-mono focus:border-primary focus:ring-0 pulse-focus transition-all"
                  />
                </div>
                <button 
                  onClick={handleSaveAiConfig}
                  title="Save configuration"
                  className="w-12 h-12 flex items-center justify-center bg-surface-container-highest border border-outline-variant hover:border-primary text-primary rounded-lg transition-all active:scale-90"
                >
                  <span className="material-symbols-outlined">{saveStatus ? 'check' : 'save'}</span>
                </button>
              </div>

              {/* Test Connection Button */}
              <button
                onClick={handleTestConnection}
                disabled={testStatus === 'testing' || !aiKey}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm
                  border-primary/40 text-primary hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {testStatus === 'testing' ? 'hourglass_top' : testStatus === 'success' ? 'check_circle' : testStatus.startsWith('error') ? 'error' : 'wifi_tethering'}
                </span>
                {testStatus === 'testing' ? 'Menghubungkan...' 
                  : testStatus === 'success' ? '✓ Koneksi Berhasil!' 
                  : testStatus.startsWith('error') ? 'Koneksi Gagal' 
                  : 'Test Connection'}
              </button>

              {/* Error detail */}
              {testStatus.startsWith('error:') && (
                <div className="p-3 rounded-lg bg-error/10 border border-error/30">
                  <p className="text-[11px] text-error leading-relaxed break-words">{testStatus.replace('error:', '')}</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 p-4 rounded-lg bg-primary-container/5 border border-primary/20">
              <p className="text-body-sm text-primary/80 leading-relaxed italic">"Masukkan API Key yang sesuai dengan provider pilihan Anda. Jika menggunakan OpenRouter, gunakan OpenRouter API Key. Klik <strong>Save</strong>, kemudian <strong>Test Connection</strong> untuk memastikan koneksi AI berhasil."</p>
            </div>
          </section>


          {/* Identity & Danger Zone */}
          <section className="col-span-12 glass-panel rim-light p-gutter rounded-xl border border-outline-variant">
             <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-headline-md text-headline-md mb-2">User Identity</h3>
                  <div className="text-body-base text-on-surface-variant">
                    Name: {user?.name || 'Loading...'} <br/>
                    Email: {user?.email || 'Loading...'}
                  </div>
                </div>
                <div className="flex-1 flex justify-end">
                  <button
                    onClick={async () => await supabase.auth.signOut()}
                    className="px-6 py-3 bg-error-container/20 text-error rounded-lg font-semibold flex items-center gap-2 hover:bg-error-container/40 transition-all active:scale-95 border border-error/30"
                  >
                    <span className="material-symbols-outlined text-[20px]">logout</span>
                    <span>Sign Out of Ecosystem</span>
                  </button>
                </div>
             </div>
          </section>

        </div>
      </div>
    </div>
  );
}
