import React, { useState, useEffect, useRef } from 'react';
import useDashboardData from '../../hooks/useDashboardData';
import ActivityGraph from './ActivityGraph';
import NodeInspector from './NodeInspector';
import ObservabilityPanel from './ObservabilityPanel';
import { supabase } from '../../supabase';

const FALLBACK_COLOR = '#475569';

export default function HomeDashboard() {
  const {
    graphData,
    stats,
    vitals,
    selectedNode,
    setSelectedNode,
    activePath,
    setActivePath,
    isDragging,
    setIsDragging,
    lastCheckTime,
    executionTrace,
    observability,
    dimensions,
    setDimensions
  } = useDashboardData();

  const fgRef = useRef();
  const containerRef = useRef();
  const graphDataRef = useRef(graphData);
  const timeoutRef = useRef(null);
  const isDraggingRef = useRef(false);
  const activePathRef = useRef(null);

  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);

  // Realtime Reasoning Path Listener (moved from original file)
  useEffect(() => {
    const triggerReasoningHighlight = (nodeId) => {
      if (!graphDataRef.current) return;
      const { nodes, links } = graphDataRef.current;

      const activeNodes = new Set(['core-maef']);
      const activeLinks = new Set();

      const targetNode = nodes.find(n => n.id === nodeId);
      if (targetNode) {
        activeNodes.add(nodeId);
        let currentNodes = new Set([nodeId]);

        for (let i = 0; i < 3; i++) {
          let nextNodes = new Set();
          currentNodes.forEach(cId => {
            links.forEach(l => {
              const sId = l.source?.id || l.source;
              const tId = l.target?.id || l.target;
              if (sId === cId) {
                activeNodes.add(tId);
                activeLinks.add(`${sId}->${tId}`);
                nextNodes.add(tId);
              }
            });
          });
          currentNodes = nextNodes;
        }

        setActivePath({ nodes: activeNodes, links: activeLinks });

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (!isDraggingRef.current) {
          timeoutRef.current = setTimeout(() => {
            setActivePath(null);
          }, 3000);
        }
      }
    };

    const channel = supabase.channel('activity-tracing')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_memories' }, payload => {
        triggerReasoningHighlight(`mem-${payload.new.id}`);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, payload => {
        triggerReasoningHighlight(`chat-${payload.new.id}`);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'documents' }, payload => {
        triggerReasoningHighlight(`doc-${payload.new.id}`);
      })
      .subscribe((status) => {
        // vitals update is handled by useDashboardData
      });

    window.triggerReasoningHighlight = triggerReasoningHighlight;

    return () => {
      supabase.removeChannel(channel);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- GRAPH COLORING FUNCTIONS ---
  const getNodeColor = (node) => {
    if (!node) return FALLBACK_COLOR;

    let baseColor = node.color;

    if (node.id === 'cat-agent' || node.id === 'core-maef') {
      if (vitals.agentProcess === 'HEALTHY') baseColor = '#22c55e';
      else if (vitals.agentProcess === 'DOWN') baseColor = '#ef4444';
      else baseColor = '#94a3b8';
    }
    if (!baseColor) {
      switch (node.group) {
        case 'core': baseColor = '#ffffff'; break;
        case 'category': baseColor = '#94a3b8'; break;
        case 'subcategory': baseColor = '#64748b'; break;
        default: baseColor = FALLBACK_COLOR; break;
      }
    }
    if (!baseColor) baseColor = FALLBACK_COLOR;

    // DEBUG: Uncomment to disable activePath entirely
    // return baseColor;

    if (activePath && !activePath.nodes.has(node.id)) {
      return baseColor + '20';
    }
    return baseColor;
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    if (window.triggerReasoningHighlight) {
      window.triggerReasoningHighlight(node.id);
    }
  };

  const handleNodeDrag = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleNodeDragEnd = (node) => {
    isDraggingRef.current = false;
    setIsDragging(false);
    if (activePathRef.current) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setActivePath(null);
      }, 3000);
    }
  };

  const handleEngineStop = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 50);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-[#050505] text-slate-200 relative overflow-hidden font-body-base">
      {/* Main Graph Area */}
      <div ref={containerRef} className="flex-1 relative h-full w-full z-10">
        <ActivityGraph
          graphData={graphData}
          dimensions={dimensions}
          fgRef={fgRef}
          getNodeColor={getNodeColor}
          activePath={activePath}
          handleNodeClick={handleNodeClick}
          onNodeDrag={handleNodeDrag}
          onNodeDragEnd={handleNodeDragEnd}
          onEngineStop={handleEngineStop}
        />
      </div>

      {/* Right Panel: Detail / Metrics */}
      <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl p-6 flex flex-col z-20 overflow-y-auto h-1/2 md:h-full shrink-0">
        {selectedNode && !selectedNode.isCategory ? (
          <NodeInspector selectedNode={selectedNode} onClose={() => setSelectedNode(null)} />
        ) : (
          <ObservabilityPanel
            executionTrace={executionTrace}
            observability={observability}
            vitals={vitals}
            stats={stats}
            lastCheckTime={lastCheckTime}
          />
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
