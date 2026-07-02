import React, { useState, useEffect } from 'react';
import { Bot, Cpu, Settings, Play, Pause, Plus, RefreshCw } from 'lucide-react';
import { kernel } from '../../core/runtime/Kernel';

/**
 * AgentForge - Dashboard untuk mengelola sub-agen dan tools
 * Menampilkan daftar agen yang terdaftar, tools yang tersedia, dan statusnya
 */
export default function AgentForge() {
  const [agents, setAgents] = useState([]);
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load data dari services
  const loadData = async () => {
    if (kernel.status !== 'RUNNING') {
      console.warn('[AgentForge] Kernel belum siap');
      setLoading(false);
      return;
    }

    try {
      const agentOrchestrator = kernel.serviceManager.get('AgentOrchestratorService');
      const toolRegistry = kernel.serviceManager.get('ToolRegistryService');

      // Load agents
      if (agentOrchestrator && agentOrchestrator.agents) {
        const agentList = Array.from(agentOrchestrator.agents.entries()).map(([name, config]) => ({
          name,
          ...config,
          status: config.status || 'active'
        }));
        setAgents(agentList);
      }

      // Load tools
      if (toolRegistry && toolRegistry.listTools) {
        const toolList = toolRegistry.listTools();
        setTools(toolList);
      }
    } catch (err) {
      console.error('[AgentForge] Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadData();
  }, []);

  // Listen to EventBus untuk refresh otomatis
  useEffect(() => {
    if (kernel.status !== 'RUNNING') return;

    const eventBus = kernel.serviceManager.get('EventBus');
    
    const unsubscribeAgent = eventBus.on('Agent:Registered', () => {
      console.log('[AgentForge] Agent registered, refreshing...');
      loadData();
    });

    const unsubscribeTool = eventBus.on('Tool:Registered', () => {
      console.log('[AgentForge] Tool registered, refreshing...');
      loadData();
    });

    const unsubscribeAgentExec = eventBus.on('Agent:ExecutionComplete', () => {
      console.log('[AgentForge] Agent execution complete, refreshing...');
      loadData();
    });

    return () => {
      unsubscribeAgent();
      unsubscribeTool();
      unsubscribeAgentExec();
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading Agent Forge...
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-950 text-white p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 rounded-lg border border-purple-500/30">
            <Bot className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Agent Forge
            </h1>
            <p className="text-xs text-slate-400">Kelola sub-agen dan tools</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-2xl font-bold text-emerald-400">{agents.length}</div>
              <div className="text-xs text-slate-400">Active Agents</div>
            </div>
          </div>
        </div>
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-blue-400" />
            <div>
              <div className="text-2xl font-bold text-blue-400">{tools.length}</div>
              <div className="text-xs text-slate-400">Available Tools</div>
            </div>
          </div>
        </div>
      </div>

      {/* Agents Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-300">Registered Agents</h2>
          <button className="flex items-center gap-2 text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 px-3 py-1.5 rounded-lg border border-purple-500/30 transition-all">
            <Plus className="w-3.5 h-3.5" />
            Add Agent
          </button>
        </div>
        
        {agents.length === 0 ? (
          <div className="bg-slate-900/30 p-8 rounded-xl border border-slate-800 text-center text-slate-500">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No agents registered yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent, idx) => (
              <div key={idx} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 hover:border-purple-500/30 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${agent.status === 'active' ? 'bg-emerald-500/20' : 'bg-slate-700'}`}>
                      <Bot className={`w-4 h-4 ${agent.status === 'active' ? 'text-emerald-400' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <div className="font-medium text-slate-200">{agent.name}</div>
                      <div className="text-xs text-slate-500">{agent.description || 'No description'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${agent.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                      {agent.status}
                    </span>
                    <button className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all">
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tools Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-300">Available Tools</h2>
          <button className="flex items-center gap-2 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg border border-blue-500/30 transition-all">
            <Plus className="w-3.5 h-3.5" />
            Add Tool
          </button>
        </div>
        
        {tools.length === 0 ? (
          <div className="bg-slate-900/30 p-8 rounded-xl border border-slate-800 text-center text-slate-500">
            <Settings className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No tools registered yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tools.map((tool, idx) => (
              <div key={idx} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 hover:border-blue-500/30 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/20">
                      <Settings className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-200">{tool.name}</div>
                      <div className="text-xs text-slate-500">{tool.description || 'No description'}</div>
                    </div>
                  </div>
                  <button className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all">
                    <Play className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
