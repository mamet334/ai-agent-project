import React, { useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const FALLBACK_COLOR = '#475569';

export default function ActivityGraph({
  graphData,
  dimensions,
  fgRef,
  getNodeColor,
  activePath,
  handleNodeClick,
  onNodeDrag,
  onNodeDragEnd,
  onEngineStop
}) {
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'CONFLICTS' | 'RAG' | 'MEMORY' | 'CHAT'
  const [searchQuery, setSearchQuery] = useState('');

  const leafNodes = useMemo(() => {
    return (graphData?.nodes || []).filter(n => !n.isCategory && n.group !== 'core');
  }, [graphData?.nodes]);

  const counts = useMemo(() => {
    let conflicts = 0, rag = 0, memory = 0, chat = 0;
    leafNodes.forEach(n => {
      if (n.isConflict || n.data?.status === 'CONFLICT_PENDING_REVIEW') conflicts++;
      else if (n.group === 'rag' || n.type === 'Document') rag++;
      else if (n.group === 'memory' || n.type === 'Memory') memory++;
      else if (n.group === 'chat' || n.type === 'Conversation') chat++;
    });
    return { conflicts, rag, memory, chat, total: leafNodes.length };
  }, [leafNodes]);

  const filteredNodes = useMemo(() => {
    return leafNodes.filter(n => {
      const isConflict = n.isConflict || n.data?.status === 'CONFLICT_PENDING_REVIEW';
      if (activeFilter === 'CONFLICTS' && !isConflict) return false;
      if (activeFilter === 'RAG' && (n.group !== 'rag' && n.type !== 'Document')) return false;
      if (activeFilter === 'MEMORY' && ((n.group !== 'memory' && n.type !== 'Memory') || isConflict)) return false;
      if (activeFilter === 'CHAT' && (n.group !== 'chat' && n.type !== 'Conversation')) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (n.name || '').toLowerCase();
        const type = (n.type || '').toLowerCase();
        return name.includes(q) || type.includes(q);
      }
      return true;
    });
  }, [leafNodes, activeFilter, searchQuery]);

  const handleFlyToNode = (node) => {
    if (fgRef?.current && Number.isFinite(node.x) && Number.isFinite(node.y)) {
      fgRef.current.centerAt(node.x, node.y, 800);
      fgRef.current.zoom(3.0, 800);
    }
    if (handleNodeClick) {
      handleNodeClick(node);
    }
  };
  return (
    <div className="flex-1 relative h-full w-full z-10">
      {graphData.nodes.length > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel="name"
          nodeColor={getNodeColor}
          nodeRelSize={1}
          nodeCanvasObjectMode={() => 'after'}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const isConflict = node.isConflict || (node.data && node.data.status === 'CONFLICT_PENDING_REVIEW');
            const isOrphan = node.data && node.data.relations === 0 && !node.isCategory;
            const size = Math.min(node.val || 5, 8); 
            const time = Date.now();
            const pulse = Math.abs(Math.sin(time / 250));

            if (isConflict) {
              // High-visibility pulsing red alert ring for memory conflicts
              ctx.beginPath();
              ctx.arc(node.x, node.y, size * (1.6 + pulse * 0.8), 0, 2 * Math.PI, false);
              ctx.fillStyle = `rgba(239, 68, 68, ${0.3 + pulse * 0.4})`;
              ctx.fill();

              ctx.beginPath();
              ctx.arc(node.x, node.y, size * (1.2 + pulse * 0.3), 0, 2 * Math.PI, false);
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 1.5;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(node.x, node.y, size * 0.7, 0, 2 * Math.PI, false);
              ctx.fillStyle = '#ff4444';
              ctx.fill();
            } else if (isOrphan) {
              // Subtle outer halo for orphan/isolated nodes while retaining semantic color
              ctx.beginPath();
              ctx.arc(node.x, node.y, size * (1.2 + pulse * 0.2), 0, 2 * Math.PI, false);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
              ctx.fill();

              ctx.beginPath();
              ctx.arc(node.x, node.y, size * 1.05, 0, 2 * Math.PI, false);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }

            // Render node labels directly on canvas (Constitution 23 Knowledge Graph)
            if (node.name) {
              const isCategory = node.isCategory || node.group === 'core';
              // Display label if reasonably visible or if it's a category/conflict node
              if (globalScale >= 0.75 || isCategory || isConflict) {
                const baseFontSize = isCategory ? 12 : 9.5;
                const fontSize = baseFontSize / globalScale;
                ctx.font = `${isCategory ? '600 ' : '400 '}${fontSize}px sans-serif, monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                if (isConflict) {
                  ctx.fillStyle = '#fca5a5';
                } else if (isCategory) {
                  ctx.fillStyle = '#ffffff';
                } else {
                  ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
                }

                const maxLen = isCategory ? 26 : 18;
                const label = node.name.length > maxLen ? node.name.substring(0, maxLen) + '…' : node.name;
                ctx.fillText(label, node.x, node.y + size + (2.5 / globalScale));
              }
            }
          }}
          linkColor={(link) => {
            if (!link || !link.source || !link.target) return 'rgba(255,255,255,0.35)';
            const sourceId = (link.source && (link.source.id || link.source)) || '';
            const targetId = (link.target && (link.target.id || link.target)) || '';
            if (!sourceId || !targetId) return 'rgba(255,255,255,0.35)';
            if (activePath) {
              if (activePath.links.has(`${sourceId}->${targetId}`)) return '#00ffcc';
              return 'rgba(255,255,255,0.02)';
            }
            return link.color || 'rgba(255,255,255,0.35)';
          }}
          linkWidth={(link) => {
            if (!link || !link.source || !link.target) return 1.5;
            const sourceId = (link.source && (link.source.id || link.source)) || '';
            const targetId = (link.target && (link.target.id || link.target)) || '';
            if (!sourceId || !targetId) return 1.5;
            if (activePath && activePath.links.has(`${sourceId}->${targetId}`)) return 3;
            return link.width || 1.5;
          }}
          linkDirectionalParticles={(link) => {
            if (!link || !link.source || !link.target) return 3;
            const sourceId = (link.source && (link.source.id || link.source)) || '';
            const targetId = (link.target && (link.target.id || link.target)) || '';
            if (!sourceId || !targetId) return 3;
            return activePath && activePath.links.has(`${sourceId}->${targetId}`) ? 6 : 3;
          }}
          linkDirectionalParticleWidth={(link) => {
            if (!link || !link.source || !link.target) return 2;
            const sourceId = (link.source && (link.source.id || link.source)) || '';
            const targetId = (link.target && (link.target.id || link.target)) || '';
            if (!sourceId || !targetId) return 2;
            return activePath && activePath.links.has(`${sourceId}->${targetId}`) ? 4 : 2;
          }}
          linkDirectionalParticleSpeed={(link) => {
            if (!link || !link.source || !link.target) return 0.006;
            const sourceId = (link.source && (link.source.id || link.source)) || '';
            const targetId = (link.target && (link.target.id || link.target)) || '';
            if (!sourceId || !targetId) return 0.006;
            return activePath && activePath.links.has(`${sourceId}->${targetId}`) ? 0.02 : 0.006;
          }}
          linkDirectionalParticleColor={(link) => {
            if (!link || !link.source || !link.target) return 'rgba(255,255,255,0.5)';
            const sourceId = (link.source && (link.source.id || link.source)) || '';
            const targetId = (link.target && (link.target.id || link.target)) || '';
            if (!sourceId || !targetId) return 'rgba(255,255,255,0.5)';
            if (activePath && activePath.links.has(`${sourceId}->${targetId}`)) return '#ffffff';
            try {
              return typeof link.source === 'object' ? getNodeColor(link.source) : 'rgba(255,255,255,0.5)';
            } catch (e) {
              return 'rgba(255,255,255,0.5)';
            }
          }}
          backgroundColor="#00000000"
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          onEngineStop={onEngineStop}
          onNodeClick={handleNodeClick}
          onNodeDrag={onNodeDrag}
          onNodeDragEnd={onNodeDragEnd}
        />
      ) : (
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-emerald-500 animate-pulse font-mono text-sm tracking-widest uppercase">
            Initializing Neural Link...
          </div>
        </div>
      )}

      {/* Title Overlay & Semantic Legend (Constitution 23) */}
      <div className="absolute top-8 left-8 z-20 pointer-events-none">
        <h1 className="font-display-lg text-[32px] md:text-[38px] text-white font-black tracking-widest leading-none drop-shadow-2xl font-mono">
          MAMET KNOWLEDGE GRAPH
        </h1>
        <p className="text-slate-400 text-xs mt-2 tracking-[0.2em] uppercase font-mono">
          Neural Brain Constellation — Constitution 23
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3.5 text-[11px] font-mono">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.6)]"></div> Memory</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#a855f7] shadow-[0_0_6px_rgba(168,85,247,0.6)]"></div> RAG Docs</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#eab308] shadow-[0_0_6px_rgba(234,179,8,0.6)]"></div> Conversations</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"></div> Core / Infra</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#ef4444] animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div> Conflict</div>
        </div>
      </div>

      {/* Top-Right Floating Knowledge Explorer */}
      <div className="absolute top-8 right-8 z-20 w-72 md:w-80 font-mono select-none">
        <div className="bg-black/35 hover:bg-black/50 backdrop-blur-2xl border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-300">
          {/* Header */}
          <div 
            onClick={() => setIsExplorerOpen(prev => !prev)}
            className="px-3.5 py-2.5 bg-white/[0.03] hover:bg-white/[0.06] border-b border-white/5 flex items-center justify-between cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-bold tracking-wider text-slate-200 uppercase">Knowledge Directory</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-400 font-semibold">{counts.total}</span>
            </div>
            <button className="text-slate-400 hover:text-white text-[11px] px-1">
              {isExplorerOpen ? '▲ Sembunyikan' : '▼ Tampilkan'}
            </button>
          </div>

          {isExplorerOpen && (
            <div className="p-3">
              {/* Search Bar */}
              <div className="relative mb-2.5">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari entitas..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-colors"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1.5 text-[10px] text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filter Tabs (Horizontal scrollbar hidden) */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1.5 mb-2 border-b border-white/5 text-[10px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <button
                  onClick={() => setActiveFilter('ALL')}
                  className={`px-2 py-0.5 rounded transition-all shrink-0 ${activeFilter === 'ALL' ? 'bg-white/20 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Semua ({counts.total})
                </button>
                {counts.conflicts > 0 && (
                  <button
                    onClick={() => setActiveFilter('CONFLICTS')}
                    className={`px-2 py-0.5 rounded transition-all shrink-0 flex items-center gap-1 ${activeFilter === 'CONFLICTS' ? 'bg-red-500/30 text-red-300 font-bold border border-red-500/40 animate-pulse' : 'text-red-400 hover:text-red-300'}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    Konflik ({counts.conflicts})
                  </button>
                )}
                <button
                  onClick={() => setActiveFilter('RAG')}
                  className={`px-2 py-0.5 rounded transition-all shrink-0 flex items-center gap-1 ${activeFilter === 'RAG' ? 'bg-purple-500/30 text-purple-200 font-bold border border-purple-500/40' : 'text-purple-300 hover:text-purple-200'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  RAG ({counts.rag})
                </button>
                <button
                  onClick={() => setActiveFilter('MEMORY')}
                  className={`px-2 py-0.5 rounded transition-all shrink-0 flex items-center gap-1 ${activeFilter === 'MEMORY' ? 'bg-emerald-500/30 text-emerald-200 font-bold border border-emerald-500/40' : 'text-emerald-300 hover:text-emerald-200'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Memori ({counts.memory})
                </button>
                <button
                  onClick={() => setActiveFilter('CHAT')}
                  className={`px-2 py-0.5 rounded transition-all shrink-0 flex items-center gap-1 ${activeFilter === 'CHAT' ? 'bg-yellow-500/30 text-yellow-200 font-bold border border-yellow-500/40' : 'text-yellow-300 hover:text-yellow-200'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
                  Chat ({counts.chat})
                </button>
              </div>

              {/* Entity Items List (Dark sleek scrollbar) */}
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/40">
                {filteredNodes.length === 0 ? (
                  <div className="py-4 text-center text-[10px] text-slate-500 font-mono">Tidak ada entitas ditemukan.</div>
                ) : (
                  filteredNodes.map(node => {
                    const isConflict = node.isConflict || node.data?.status === 'CONFLICT_PENDING_REVIEW';
                    let dotColor = '#22c55e';
                    let typeBadge = 'MEMORI';
                    let badgeClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';

                    if (isConflict) {
                      dotColor = '#ef4444';
                      typeBadge = 'KONFLIK';
                      badgeClass = 'bg-red-500/20 text-red-300 border-red-500/30';
                    } else if (node.group === 'rag' || node.type === 'Document') {
                      dotColor = '#a855f7';
                      typeBadge = 'RAG';
                      badgeClass = 'bg-purple-500/10 text-purple-300 border-purple-500/20';
                    } else if (node.group === 'chat' || node.type === 'Conversation') {
                      dotColor = '#eab308';
                      typeBadge = 'CHAT';
                      badgeClass = 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
                    }

                    return (
                      <div
                        key={node.id}
                        onClick={() => handleFlyToNode(node)}
                        className="group/item flex items-center justify-between p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.08] border border-transparent hover:border-white/10 cursor-pointer transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span 
                            className="w-2 h-2 rounded-full shrink-0" 
                            style={{ backgroundColor: dotColor }}
                          />
                          <span className="text-[11px] text-slate-300 group-hover/item:text-white truncate">
                            {node.name || 'Entitas'}
                          </span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 uppercase font-semibold ${badgeClass}`}>
                          {typeBadge}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
