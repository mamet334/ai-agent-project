import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { supabase } from '../../supabase';

export default function HomeDashboard() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [stats, setStats] = useState({ memories: 0, documents: 0, chats: 0 });
  const fgRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Handle Resize for ForceGraph
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Fetch Supabase Data
  useEffect(() => {
    async function fetchData() {
      try {
        const [memRes, docRes, chatRes] = await Promise.all([
          supabase.from('user_memories').select('id, summary').limit(500),
          supabase.from('documents').select('id, title').limit(500),
          supabase.from('chats').select('id, title, workspace_type').limit(500)
        ]);

        const memories = memRes.data || [];
        const documents = docRes.data || [];
        const chats = chatRes.data || [];

        setStats({
          memories: memories.length,
          documents: documents.length,
          chats: chats.length,
        });

        const nodes = [];
        const links = [];

        // 1. Central Node
        nodes.push({ id: 'core-supabase', name: 'SUPABASE', group: 'core', val: 25 });

        // 2. First Layer Nodes (Categories)
        nodes.push({ id: 'cat-memory', name: 'USER MEMORY', group: 'category', val: 15 });
        nodes.push({ id: 'cat-rag', name: 'RAG KNOWLEDGE', group: 'category', val: 15 });
        nodes.push({ id: 'cat-chat', name: 'CONVERSATION', group: 'category', val: 15 });
        nodes.push({ id: 'cat-workspace', name: 'WORKSPACE', group: 'category', val: 15 });

        // Connect Central to First Layer
        links.push({ source: 'core-supabase', target: 'cat-memory' });
        links.push({ source: 'core-supabase', target: 'cat-rag' });
        links.push({ source: 'core-supabase', target: 'cat-chat' });
        links.push({ source: 'core-supabase', target: 'cat-workspace' });

        // 3. Second Layer Nodes (Actual Data)
        memories.forEach(m => {
          nodes.push({ id: `mem-${m.id}`, name: m.summary || 'Memory', group: 'memory', val: 3 });
          links.push({ source: 'cat-memory', target: `mem-${m.id}` });
        });

        documents.forEach(d => {
          nodes.push({ id: `doc-${d.id}`, name: d.title || 'Document', group: 'rag', val: 5 });
          links.push({ source: 'cat-rag', target: `doc-${d.id}` });
        });

        chats.forEach(c => {
          // Group chats by workspace_type if needed, for now just connect to conversation
          nodes.push({ id: `chat-${c.id}`, name: c.title || 'Chat', group: 'chat', val: 3 });
          links.push({ source: 'cat-chat', target: `chat-${c.id}` });
        });

        setGraphData({ nodes, links });
      } catch (err) {
        console.error("Failed to load Knowledge Graph:", err);
      }
    }

    fetchData();
  }, []);

  const getNodeColor = (node) => {
    switch(node.group) {
      case 'core': return '#ffffff'; // White
      case 'category': return '#94a3b8'; // Slate
      case 'memory': return '#22c55e'; // Green
      case 'rag': return '#a855f7'; // Purple
      case 'chat': return '#eab308'; // Yellow
      case 'workspace': return '#3b82f6'; // Blue
      default: return '#64748b';
    }
  };

  return (
    <div className="flex h-full w-full bg-[#050505] text-slate-200 relative overflow-hidden font-body-base">
      
      {/* Main Graph Area */}
      <div ref={containerRef} className="flex-1 relative h-full w-full z-10">
        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeLabel="name"
            nodeColor={getNodeColor}
            nodeRelSize={6}
            linkColor={() => 'rgba(255,255,255,0.15)'}
            linkWidth={1}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleSpeed={0.005}
            backgroundColor="#00000000"
            onNodeClick={(node) => {
              fgRef.current.centerAt(node.x, node.y, 1000);
              fgRef.current.zoom(8, 2000);
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full w-full">
            <div className="text-emerald-500 animate-pulse font-mono text-sm tracking-widest uppercase">
              Initializing Neural Link...
            </div>
          </div>
        )}

        {/* Title Overlay */}
        <div className="absolute top-8 left-8 z-20 pointer-events-none">
          <h1 className="font-display-lg text-[40px] text-white font-black tracking-widest leading-none drop-shadow-2xl">
            MAMET BRAIN
          </h1>
          <p className="text-slate-400 text-sm mt-2 tracking-[0.2em] uppercase font-mono">
            Ecosystem Knowledge Graph
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-72 border-l border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl p-6 flex flex-col z-20 overflow-y-auto">
        <h2 className="text-xs font-bold text-slate-500 tracking-[0.2em] mb-8 uppercase border-b border-white/5 pb-4">
          Realtime Metrics
        </h2>
        
        <div className="space-y-6">
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-green-400 transition-colors">
              Total Memories
            </div>
            <div className="text-3xl font-light text-green-400 font-mono drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]">
              {stats.memories}
            </div>
          </div>
          
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-purple-400 transition-colors">
              Total Documents
            </div>
            <div className="text-3xl font-light text-purple-400 font-mono drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]">
              {stats.documents}
            </div>
          </div>
          
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-yellow-400 transition-colors">
              Total Conversations
            </div>
            <div className="text-3xl font-light text-yellow-400 font-mono drop-shadow-[0_0_15px_rgba(234,179,8,0.4)]">
              {stats.chats}
            </div>
          </div>
          
          <div className="group pt-4 border-t border-white/5">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">
              Database Core
            </div>
            <div className="text-lg font-light text-white tracking-widest">
              SUPABASE
            </div>
          </div>
          
          <div className="group">
            <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">
              Health Score
            </div>
            <div className="text-lg font-light text-emerald-400 tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              OPTIMAL
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-white/5">
           <div className="text-[9px] text-slate-600 font-mono text-center tracking-widest uppercase">
             MAEF Observatory V1.0
           </div>
        </div>
      </div>

      {/* Atmospheric Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 blur-[150px] rounded-full pointer-events-none z-0"></div>
    </div>
  );
}
