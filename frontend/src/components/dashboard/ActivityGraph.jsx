import React, { useRef, useEffect } from 'react';
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
linkColor={(link) => {
            if (!link || !link.source || !link.target) return 'rgba(255,255,255,0.15)';
            const sourceId = (link.source && (link.source.id || link.source)) || '';
            const targetId = (link.target && (link.target.id || link.target)) || '';
            if (!sourceId || !targetId) return 'rgba(255,255,255,0.15)';
            if (activePath) {
              if (activePath.links.has(`${sourceId}->${targetId}`)) return '#00ffcc';
              return 'rgba(255,255,255,0.02)';
            }
            return 'rgba(255,255,255,0.15)';
          }}
          linkWidth={(link) => {
            if (!link || !link.source || !link.target) return 1;
            const sourceId = (link.source && (link.source.id || link.source)) || '';
            const targetId = (link.target && (link.target.id || link.target)) || '';
            if (!sourceId || !targetId) return 1;
            return activePath && activePath.links.has(`${sourceId}->${targetId}`) ? 3 : 1;
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

      {/* Title Overlay */}
      <div className="absolute top-8 left-8 z-20 pointer-events-none">
        <h1 className="font-display-lg text-[40px] text-white font-black tracking-widest leading-none drop-shadow-2xl">
          MAMET ACTIVITY
        </h1>
        <p className="text-slate-400 text-sm mt-2 tracking-[0.2em] uppercase font-mono">
          Activity Cluster Visualization V4
        </p>
        <div className="mt-6 flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#22c55e]"></div> Healthy</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#eab308]"></div> Low Relations</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#ef4444]"></div> Orphan</div>
        </div>
      </div>
    </div>
  );
}
