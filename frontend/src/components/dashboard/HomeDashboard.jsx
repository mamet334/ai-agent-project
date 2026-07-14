import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { supabase } from '../../supabase';

export default function HomeDashboard() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [stats, setStats] = useState({ memories: 0, documents: 0, chats: 0 });
  const [selectedNode, setSelectedNode] = useState(null);
  
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
        const [memRes, docRes, chatRes, chunkRes] = await Promise.all([
          // Try to fetch causal_links and memory_hits, ignore errors if missing using graceful fallback in map
          supabase.from('user_memories').select('id, summary, created_at, memory_hits, causal_links, metadata').limit(500),
          supabase.from('documents').select('id, title, created_at, metadata').limit(500),
          supabase.from('chats').select('id, title, workspace_type, created_at').limit(500),
          supabase.from('document_chunks').select('id, document_id').limit(5000)
        ]);

        const memories = memRes.data || [];
        const documents = docRes.data || [];
        const chats = chatRes.data || [];
        const chunks = chunkRes.data || [];

        // Precompute chunk counts
        const docChunkCounts = {};
        chunks.forEach(c => {
          if (c.document_id) {
            docChunkCounts[c.document_id] = (docChunkCounts[c.document_id] || 0) + 1;
          }
        });

        setStats({
          memories: memories.length,
          documents: documents.length,
          chats: chats.length,
        });

        const nodes = [];
        const links = [];

        // 1. Central Node (The Sun) - Fixed at center with strongest visual weight
        nodes.push({ id: 'core-supabase', name: 'SUPABASE CORE', type: 'Core', group: 'core', val: 50, isCategory: true, fx: 0, fy: 0 });

        // 2. First Layer Nodes (Primary Planets)
        const primaryClusters = [
          { id: 'cat-memory', name: 'USER MEMORY' },
          { id: 'cat-rag', name: 'RAG KNOWLEDGE' },
          { id: 'cat-chat', name: 'CONVERSATION' },
          { id: 'cat-workspace', name: 'WORKSPACE' },
          { id: 'cat-auth', name: 'AUTH' },
          { id: 'cat-storage', name: 'STORAGE' },
          { id: 'cat-edge', name: 'EDGE FUNCTIONS' },
          { id: 'cat-realtime', name: 'REALTIME' }
        ];

        primaryClusters.forEach(cluster => {
          nodes.push({ id: cluster.id, name: cluster.name, type: 'Category', group: 'category', val: 20, isCategory: true });
          // Link planets to the sun
          links.push({ source: 'core-supabase', target: cluster.id });
        });

        // Helper to determine health color
        const getHealthColor = (relations) => {
          if (relations === 0) return '#ef4444'; // RED (Orphan)
          if (relations < 3) return '#eab308'; // YELLOW (Few relations)
          return '#22c55e'; // GREEN (Healthy)
        };

        const dynamicSubclusters = {};
        const registerSubcluster = (id, name, parent) => {
          if (!dynamicSubclusters[id]) {
            dynamicSubclusters[id] = { id, name: name.toUpperCase(), type: 'Subcluster', group: 'subcategory', val: 12, isCategory: true, parent };
          }
        };

        // 3. Process Actual Data into Subclusters
        memories.forEach(m => {
          const type = m.metadata?.type || m.metadata?.category || 'General';
          const subcatId = `subcat-mem-${type.toLowerCase()}`;
          registerSubcluster(subcatId, type, 'cat-memory');

          const hits = m.memory_hits || 0;
          const causalLinks = m.causal_links || [];
          
          let relationsCount = causalLinks.length;
          // Feature 4: Detect cross-relations to chat or document
          const sourceChatId = m.metadata?.chat_id || m.metadata?.source_id;
          const sourceDocId = m.metadata?.document_id;
          
          if (sourceChatId) relationsCount++;
          if (sourceDocId) relationsCount++;

          nodes.push({ 
            id: `mem-${m.id}`, 
            name: m.summary || 'Memory', 
            type: 'Memory',
            group: 'memory', 
            val: Math.max(3, Math.min(25, 3 + hits * 2)), 
            color: getHealthColor(relationsCount), 
            data: {
              created: m.created_at,
              used: hits,
              relations: relationsCount,
              metadata: m.metadata || {}
            }
          });
          
          // Connect to its subcluster instead of main category
          links.push({ source: subcatId, target: `mem-${m.id}` });
          
          // Connect causal links
          causalLinks.forEach(targetId => {
            links.push({ source: `mem-${m.id}`, target: `mem-${targetId}` });
          });

          // Connect cross-cluster relations if they exist
          if (sourceChatId && chats.some(c => c.id === sourceChatId)) {
            links.push({ source: `chat-${sourceChatId}`, target: `mem-${m.id}` });
          }
          if (sourceDocId && documents.some(d => d.id === sourceDocId)) {
            links.push({ source: `doc-${sourceDocId}`, target: `mem-${m.id}` });
          }
        });

        documents.forEach(d => {
          const type = d.metadata?.file_type || d.metadata?.type || 'Document';
          const subcatId = `subcat-rag-${type.toLowerCase()}`;
          registerSubcluster(subcatId, type, 'cat-rag');

          const chunkCount = docChunkCounts[d.id] || 0;
          
          nodes.push({ 
            id: `doc-${d.id}`, 
            name: d.title || 'Document', 
            type: 'Document',
            group: 'rag', 
            val: Math.max(3, Math.min(25, 3 + chunkCount * 0.5)),
            color: getHealthColor(chunkCount),
            data: {
              created: d.created_at,
              used: 'N/A', 
              relations: chunkCount,
              metadata: d.metadata || {}
            }
          });
          
          links.push({ source: subcatId, target: `doc-${d.id}` });
        });

        chats.forEach(c => {
          const type = c.workspace_type || 'Unknown';
          const subcatId = `subcat-chat-${type.toLowerCase()}`;
          registerSubcluster(subcatId, type, 'cat-chat');

          nodes.push({ 
            id: `chat-${c.id}`, 
            name: c.title || 'Chat', 
            type: 'Conversation',
            group: 'chat', 
            val: 8, 
            color: '#22c55e', 
            data: {
              created: c.created_at,
              used: 1,
              source: c.workspace_type,
              relations: 1
            }
          });
          
          links.push({ source: subcatId, target: `chat-${c.id}` });
        });

        // Add dynamic subclusters to graph
        Object.values(dynamicSubclusters).forEach(sc => {
          nodes.push(sc);
          links.push({ source: sc.parent, target: sc.id });
        });

        setGraphData({ nodes, links });
      } catch (err) {
        console.error("Failed to load Knowledge Graph:", err);
      }
    }

    fetchData();
  }, []);

  const getNodeColor = (node) => {
    if (node.color) return node.color; // From Orphan Detector
    
    switch(node.group) {
      case 'core': return '#ffffff'; // White
      case 'category': return '#94a3b8'; // Slate
      case 'subcategory': return '#64748b'; // Darker Slate
      default: return '#475569';
    }
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(8, 2000);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
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
            nodeRelSize={1}
            linkColor={() => 'rgba(255,255,255,0.15)'}
            linkWidth={1}
            linkDirectionalParticles={3}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleColor={link => typeof link.source === 'object' ? getNodeColor(link.source) : 'rgba(255,255,255,0.5)'}
            backgroundColor="#00000000"
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
            onEngineStop={() => {
              // Re-center after physics stabilizes
              if (fgRef.current) {
                fgRef.current.zoomToFit(400, 50);
              }
            }}
            onNodeClick={handleNodeClick}
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
            Brain Cluster Visualization V4
          </p>
          
          <div className="mt-6 flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#22c55e]"></div> Healthy</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#eab308]"></div> Low Relations</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#ef4444]"></div> Orphan</div>
          </div>
        </div>
      </div>

      {/* Right Panel: Detail / Metrics */}
      <div className="w-80 border-l border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl p-6 flex flex-col z-20 overflow-y-auto">
        
        {/* Feature 2: Node Detail Panel */}
        {selectedNode && !selectedNode.isCategory ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
              <h2 className="text-xs font-bold text-primary tracking-[0.2em] uppercase">
                Node Inspector
              </h2>
              <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="mb-6">
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Label</div>
                <div className="text-sm font-semibold text-white break-words">{selectedNode.name}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Type</div>
                  <div className="text-xs text-slate-300 bg-white/5 py-1 px-2 rounded inline-block">{selectedNode.type}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Used</div>
                  <div className="text-xs text-slate-300">{selectedNode.data?.used ?? '0'} times</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Relations</div>
                <div className={`text-xs font-bold ${
                  selectedNode.data?.relations === 0 ? 'text-red-400' : 
                  selectedNode.data?.relations < 3 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {selectedNode.data?.relations ?? 0} active links
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Created</div>
                <div className="text-xs text-slate-300">{formatDate(selectedNode.data?.created)}</div>
              </div>

              {selectedNode.data?.source && (
                <div>
                  <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Source Workspace</div>
                  <div className="text-xs text-slate-300 capitalize">{selectedNode.data.source}</div>
                </div>
              )}

              {selectedNode.data?.metadata && Object.keys(selectedNode.data.metadata).length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider font-mono">Metadata</div>
                  <pre className="text-[10px] text-slate-400 bg-black/50 p-2 rounded overflow-x-auto">
                    {JSON.stringify(selectedNode.data.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
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
          </div>
        )}

        <div className="mt-auto pt-6 border-t border-white/5">
           <div className="text-[9px] text-slate-600 font-mono text-center tracking-widest uppercase">
             MAEF Observatory V4.0
           </div>
        </div>
      </div>

      {/* Atmospheric Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 blur-[150px] rounded-full pointer-events-none z-0"></div>
    </div>
  );
}
