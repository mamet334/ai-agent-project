import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { supabase } from '../../supabase';
import { fetchExecutionTrace } from '../../services/ExecutionTraceService';

const EXEC_TRACE_MAX = 40;


export default function HomeDashboard() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [stats, setStats] = useState({ memories: 0, documents: 0, chats: 0, orphans: 0, connected: 0 });
  const [vitals, setVitals] = useState({
    supabase: 'UNKNOWN',
    auth: 'UNKNOWN',
    realtime: 'UNKNOWN',
    storage: 'UNKNOWN',
    edge: 'UNKNOWN',
    memory: 'UNKNOWN',
    rag: 'UNKNOWN',
    embedding: 'UNKNOWN',
    verification: 'UNKNOWN',
    provider: 'UNKNOWN'
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [activePath, setActivePath] = useState(null);
  const [lastCheckTime, setLastCheckTime] = useState('...');

  const [executionTrace, setExecutionTrace] = useState({
    traceId: null,
    timeline: [],
    pipeline: null,
    loading: false,
    error: null,
    unknown: false
  });

  const [observability, setObservability] = useState({
    memoryReads: 0,
    memoryWrites: 0,
    llmCalls: 0,
    avgLatencyMs: 0,
    errorCount: 0,
    costAlertCount: 0,
    pipelineIncidentsDown: 0,
    pipelineIncidentsTotal: 0,
    verificationFail: 0,
    verificationWarn: 0,
    latencyP50Ms: null,
    latencyP95Ms: null,
    latencyP99Ms: null,
    topSlowComponents: [],
    recentFailures: []
  });


  const fgRef = useRef();
  const containerRef = useRef();
  const graphDataRef = useRef(graphData);
  const timeoutRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);

  // Realtime Reasoning Path Listener
  useEffect(() => {
    const triggerReasoningHighlight = (nodeId) => {
      if (!graphDataRef.current) return;
      const { nodes, links } = graphDataRef.current;

      const activeNodes = new Set(['core-maef']);
      const activeLinks = new Set();

      const targetNode = nodes.find(n => n.id === nodeId);
      if (targetNode) {
        activeNodes.add(nodeId);

        // Trace path inwards to the core
        let currentNodes = new Set([nodeId]);
        
        // Max 3 steps: Node -> Subcat -> Cat -> Core
        for (let i = 0; i < 3; i++) {
          let nextNodes = new Set();
          currentNodes.forEach(cId => {
            links.forEach(l => {
              const sId = l.source.id || l.source;
              const tId = l.target.id || l.target;
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
        timeoutRef.current = setTimeout(() => setActivePath(null), 3000);
      }
    };

    // Listen to real data insertions to highlight subsystem activity in realtime
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
        setVitals(v => ({ ...v, realtime: status === 'SUBSCRIBED' ? 'HEALTHY' : 'DOWN' }));
        setLastCheckTime(new Date().toLocaleTimeString('id-ID', { hour12: false }));
      });

    window.triggerReasoningHighlight = triggerReasoningHighlight;

    return () => {
      supabase.removeChannel(channel);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
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

        // ---- Observability telemetry (ai_system_logs, verification, pipeline health) ----
        const [logsRes, checksRes, incidentsRes, verRes] = await Promise.all([
          supabase.from('ai_system_logs').select('*').order('created_at', { ascending: false }).limit(100),
          supabase.from('checks').select('status_code,response_time_ms,checked_at').order('checked_at', { ascending: false }).limit(100),
          supabase.from('incidents').select('status,started_at,resolved_at').order('started_at', { ascending: false }).limit(100),
          supabase.from('verification_audit_logs').select('decision,status,failures,execution_time_ms,created_at').order('created_at', { ascending: false }).limit(100)
        ]);

        const logs = logsRes.data || [];
        const errors = logs.filter(l => l.error_flag);
        const costAlerts = logs.filter(l => l.cost_alert_flag);
        const avgLatency = logs.length > 0 ? Math.round(logs.reduce((acc, l) => acc + (l.latency_ms || 0), 0) / logs.length) : 0;

        const pipelineIncidentsTotal = (incidentsRes.data || []).length;
        const pipelineIncidentsDown = (incidentsRes.data || []).filter(i => (i.status || '').toUpperCase() === 'DOWN').length;

        const verificationItems = verRes.data || [];
        const verificationFail = verificationItems.filter(v => (v.decision || '').toUpperCase() === 'FAIL' || (v.status || '').toUpperCase() === 'FAIL').length;
        const verificationWarn = verificationItems.filter(v => (v.decision || '').toUpperCase() === 'WARNING' || (v.decision || '').toUpperCase() === 'WARN' || (v.status || '').toUpperCase() === 'WARN' || (v.status || '').toUpperCase() === 'WARNING').length;

        const latencySamples = logs
          .map(l => Number(l.latency_ms))
          .filter(v => Number.isFinite(v))
          .sort((a, b) => a - b);

        const percentile = (arr, p) => {
          if (!arr || arr.length === 0) return null;
          const idx = Math.ceil((p / 100) * arr.length) - 1;
          const safeIdx = Math.max(0, Math.min(arr.length - 1, idx));
          return arr[safeIdx];
        };

        const latencyP50Ms = percentile(latencySamples, 50);
        const latencyP95Ms = percentile(latencySamples, 95);
        const latencyP99Ms = percentile(latencySamples, 99);

        const componentLatencyMap = {};
        logs.forEach(l => {
          const key = l.component || l.module || l.event_type || l.provider || 'unknown-component';
          const lat = Number(l.latency_ms);
          if (!Number.isFinite(lat)) return;
          if (!componentLatencyMap[key]) componentLatencyMap[key] = [];
          componentLatencyMap[key].push(lat);
        });

        const topSlowComponents = Object.entries(componentLatencyMap)
          .map(([component, arr]) => {
            const sorted = arr.slice().sort((a, b) => a - b);
            return {
              component,
              p95: percentile(sorted, 95),
              p99: percentile(sorted, 99),
              avg: Math.round(sorted.reduce((acc, v) => acc + v, 0) / sorted.length),
              sampleCount: sorted.length
            };
          })
          .sort((a, b) => (b.p95 || 0) - (a.p95 || 0))
          .slice(0, 5);

        const toolFailures = logs
          .filter(l => l.error_flag || String(l.status || '').toLowerCase().includes('fail') || String(l.status || '').toLowerCase().includes('timeout'))
          .map(l => ({
            type: String(l.error_type || l.event_type || l.component || 'unknown').toLowerCase().includes('tool') ? 'tool-timeout-or-failure' : 'provider-or-runtime-error',
            message: l.error_message || l.message || 'Unknown failure',
            at: l.created_at || null
          }));

        const verificationFailures = verificationItems
          .filter(v => {
            const s = String(v.status || v.decision || '').toLowerCase();
            return s.includes('fail') || s.includes('error');
          })
          .map(v => ({
            type: 'verification-fail',
            message: v.failures || v.decision || v.status || 'Verification failure',
            at: v.created_at || null
          }));

        const ragUnavailableFailures = (docRes.error || chunkRes.error) ? [{
          type: 'rag-unavailable',
          message: docRes.error?.message || chunkRes.error?.message || 'RAG unavailable',
          at: new Date().toISOString()
        }] : [];

        const supabaseDisconnectedFailures = (memRes.error || docRes.error) ? [{
          type: 'supabase-disconnected',
          message: memRes.error?.message || docRes.error?.message || 'Supabase disconnected',
          at: new Date().toISOString()
        }] : [];

        const recentFailures = [
          ...toolFailures,
          ...verificationFailures,
          ...ragUnavailableFailures,
          ...supabaseDisconnectedFailures
        ]
          .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
          .slice(0, 10);

        setObservability({
          memoryReads: logs.reduce((acc, l) => acc + (l.memory_fetch_count || 0), 0),
          memoryWrites: logs.reduce((acc, l) => acc + (l.memory_write_count || 0), 0),
          llmCalls: logs.reduce((acc, l) => acc + (l.llm_call_count || 0), 0),
          avgLatencyMs: avgLatency,
          errorCount: errors.length,
          costAlertCount: costAlerts.length,
          pipelineIncidentsDown: pipelineIncidentsDown,
          pipelineIncidentsTotal: pipelineIncidentsTotal,
          verificationFail,
          verificationWarn,
          latencyP50Ms,
          latencyP95Ms,
          latencyP99Ms,
          topSlowComponents,
          recentFailures
        });

        const authRes = await supabase.auth.getSession();
        const storageRes = await supabase.storage.listBuckets();

        let edgeStatus = '🟡';
        try {
          const edgeRes = await supabase.functions.invoke('ping');
          // If it throws a network error it's red, if it's just not found it's green/yellow
          if (edgeRes.error && edgeRes.error.message.includes('fetch')) edgeStatus = '🔴';
          else edgeStatus = '🟢';
        } catch (e) {
          edgeStatus = '🔴';
        }

        const normalizeHealthStatus = (raw) => {
          if (!raw) return 'UNKNOWN';
          const s = String(raw).toLowerCase();
          if (s.includes('🟢') || s.includes('healthy') || s.includes('up') || s.includes('ok') || s.includes('success')) return 'HEALTHY';
          if (s.includes('🔴') || s.includes('down') || s.includes('fail') || s.includes('error')) return 'DOWN';
          if (s.includes('🟡') || s.includes('degraded') || s.includes('warn')) return 'DEGRADED';
          if (s.includes('⚪') || s.includes('unknown')) return 'UNKNOWN';
          return 'UNKNOWN';
        };

        const providerHealthRaw = logs.some(l => l.error_flag)
          ? 'DOWN'
          : logs.some(l => l.provider || l.model || l.provider_name)
            ? 'HEALTHY'
            : 'UNKNOWN';

        const verificationHealthRaw = verificationFail > 0
          ? 'DOWN'
          : verificationWarn > 0
            ? 'DEGRADED'
            : verificationItems.length > 0
              ? 'HEALTHY'
              : 'UNKNOWN';

        setVitals(v => ({
          ...v,
          supabase: normalizeHealthStatus((memRes.error || docRes.error) ? 'DOWN' : 'HEALTHY'),
          auth: normalizeHealthStatus(authRes.error ? 'DOWN' : 'HEALTHY'),
          storage: normalizeHealthStatus(storageRes.error ? 'DOWN' : 'HEALTHY'),
          edge: normalizeHealthStatus(edgeStatus),
          memory: normalizeHealthStatus(memRes.error ? 'DOWN' : 'HEALTHY'),
          rag: normalizeHealthStatus(docRes.error ? 'DOWN' : 'HEALTHY'),
          embedding: normalizeHealthStatus((chunks && chunks.length > 0) ? 'HEALTHY' : (chunkRes.error ? 'DOWN' : 'DEGRADED')),
          verification: normalizeHealthStatus(verificationHealthRaw),
          provider: normalizeHealthStatus(providerHealthRaw)
        }));

        setLastCheckTime(new Date().toLocaleTimeString('id-ID', { hour12: false }));

        const nodes = [];
        const links = [];

        // 1. Central Node (The Sun) - Fixed at center with strongest visual weight
        nodes.push({ id: 'core-maef', name: 'MAEF KERNEL', type: 'Core', group: 'core', val: 50, isCategory: true, fx: 0, fy: 0 });

        const primaryClusters = [
          { id: 'cat-memory', name: 'Memory Cluster' },
          { id: 'cat-agent', name: 'Agent Cluster' },
          { id: 'cat-execution', name: 'Execution Cluster' },
          { id: 'cat-knowledge', name: 'Knowledge Cluster' },
          { id: 'cat-telemetry', name: 'Activity / Telemetry Cluster' }
        ];

        primaryClusters.forEach(cluster => {
          nodes.push({ id: cluster.id, name: cluster.name, type: 'Category', group: 'category', val: 25, isCategory: true });
          // Flow: Cluster -> Core
          links.push({ source: cluster.id, target: 'core-maef' });
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
            dynamicSubclusters[id] = { id, name: name.toUpperCase(), type: 'Subcluster', group: 'subcategory', val: 15, isCategory: true, parent };
          }
        };

        // Helper untuk mapping legacy name ke arsitektur baru
        const mapLegacyName = (name) => {
          if (!name) return 'General';
          const n = name.toLowerCase();
          if (n === 'owner' || n === 'ws-owner') return 'engineer';
          if (n === 'ws-agent-forge') return 'assistant';
          return name;
        };

        // Pre-register specific subclusters based on the architecture map
        const staticSubclusters = [
          { id: 'subcat-mem-rag', name: 'RAG Memory', parent: 'cat-memory' },
          { id: 'subcat-mem-user', name: 'User Memory', parent: 'cat-memory' },
          { id: 'subcat-mem-vector', name: 'Vector DB', parent: 'cat-memory' },
          
          { id: 'subcat-agent-sub', name: 'Sub Agents', parent: 'cat-agent' },
          { id: 'subcat-agent-tools', name: 'Tools', parent: 'cat-agent' },
          { id: 'subcat-agent-skills', name: 'Skills', parent: 'cat-agent' },
          
          { id: 'subcat-exec-trace', name: 'Trace Pipeline', parent: 'cat-execution' },
          { id: 'subcat-exec-verify', name: 'Verification', parent: 'cat-execution' },
          { id: 'subcat-exec-audit', name: 'Audit', parent: 'cat-execution' },
          
          { id: 'subcat-know-docs', name: 'Documents', parent: 'cat-knowledge' },
          { id: 'subcat-know-embed', name: 'Embedding', parent: 'cat-knowledge' },
          { id: 'subcat-know-pgvector', name: 'pgvector', parent: 'cat-knowledge' },
          
          { id: 'subcat-tel-dash', name: 'Dashboard + Metrics + Logs', parent: 'cat-telemetry' }
        ];

        staticSubclusters.forEach(sc => registerSubcluster(sc.id, sc.name, sc.parent));

        // HEALTH/DEGRADED/DOWN/UNKNOWN colors:
        const colorByStatus = {
          HEALTHY: '#22c55e',
          DEGRADED: '#eab308',
          DOWN: '#ef4444',
          UNKNOWN: '#94a3b8' // abu-abu
        };

        const getStatusFromTelemetry = (node) => {
          // Visual-only mapping using telemetry/state already computed in this file:
          // - vitals memory/rag/edge/realtime/storage/auth drive most domains.
          const mapVitalsToNode = (nodeIdOrGroup) => {
            if (nodeIdOrGroup === 'memory' || String(nodeIdOrGroup).startsWith('subcat-mem-')) return vitals.memory;
            if (nodeIdOrGroup === 'rag' || String(nodeIdOrGroup).startsWith('subcat-rag-')) return vitals.rag;
            if (nodeIdOrGroup === 'chat' || String(nodeIdOrGroup).startsWith('subcat-chat-') || String(nodeIdOrGroup).includes('cat-chat')) return vitals.auth;
            if (nodeIdOrGroup === 'edge' || String(nodeIdOrGroup).startsWith('cat-edge')) return vitals.edge;
            if (nodeIdOrGroup === 'realtime' || String(nodeIdOrGroup).startsWith('cat-realtime')) return vitals.realtime;
            if (nodeIdOrGroup === 'storage' || String(nodeIdOrGroup).startsWith('cat-storage')) return vitals.storage;
            // fallback
            return null;
          };

          const key = node.group || node.id || '';
          const vit = mapVitalsToNode(key) || mapVitalsToNode(node.id) || mapVitalsToNode(node.type);

          // vitals values are emoji; also initial are ⚪. We map them to the required 4-state.
          if (!vit) return 'UNKNOWN';
          const v = String(vit);
          if (v.includes('🔴')) return 'DOWN';
          if (v.includes('🟡')) return 'DEGRADED';
          if (v.includes('🟢')) return 'HEALTHY';
          if (v.includes('⚪')) return 'UNKNOWN';
          return 'UNKNOWN';
        };

        const getNodeBaseColor = (node) => {
          const status = getStatusFromTelemetry(node);
          return colorByStatus[status] || colorByStatus.UNKNOWN;
        };



        // 3. Process Actual Data into Subclusters
        memories.forEach(m => {
          let type = m.metadata?.type || m.metadata?.category || 'User';
          type = mapLegacyName(type);
          const subcatId = `subcat-mem-${type.toLowerCase()}`;
          // Fallback to static if exists, or register new dynamic one
          if (!staticSubclusters.some(s => s.id === subcatId)) {
            registerSubcluster(subcatId, `${type} Memory`, 'cat-memory');
          }

          const hits = m.memory_hits || 0;
          const causalLinks = m.causal_links || [];
          let relationsCount = causalLinks.length;
          
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

          // Flow: Memory Node -> Subcluster
          links.push({ source: `mem-${m.id}`, target: subcatId });

          causalLinks.forEach(targetId => {
            // Causal flow: Source Memory -> Target Memory
            links.push({ source: `mem-${targetId}`, target: `mem-${m.id}` });
          });
          if (sourceChatId && chats.some(c => c.id === sourceChatId)) {
            // Flow: Chat -> Memory
            links.push({ source: `chat-${sourceChatId}`, target: `mem-${m.id}` });
          }
          if (sourceDocId && documents.some(d => d.id === sourceDocId)) {
            // Flow: Document -> Memory
            links.push({ source: `doc-${sourceDocId}`, target: `mem-${m.id}` });
          }
        });

        documents.forEach(d => {
          let type = d.metadata?.file_type || d.metadata?.type || 'Docs';
          type = mapLegacyName(type);
          const subcatId = `subcat-know-${type.toLowerCase()}`;
          if (!staticSubclusters.some(s => s.id === subcatId)) {
            registerSubcluster(subcatId, type, 'cat-knowledge');
          }

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

          // Flow: Document Node -> Subcluster
          links.push({ source: `doc-${d.id}`, target: subcatId });
        });

        chats.forEach(c => {
          let type = c.workspace_type || 'Sub';
          type = mapLegacyName(type);
          const subcatId = `subcat-agent-${type.toLowerCase()}`;
          if (!staticSubclusters.some(s => s.id === subcatId)) {
            registerSubcluster(subcatId, `${type} Agents`, 'cat-agent');
          }

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

          // Flow: Chat Node -> Subcluster
          links.push({ source: `chat-${c.id}`, target: subcatId });
        });

        // Add dynamic subclusters to graph
        Object.values(dynamicSubclusters).forEach(sc => {
          nodes.push(sc);
          // Flow: Subcluster -> Primary Cluster
          links.push({ source: sc.id, target: sc.parent });
        });

        const orphanCount = nodes.filter(n => !n.isCategory && n.data && n.data.relations === 0).length;
        const totalDataNodes = nodes.filter(n => !n.isCategory && n.data).length;
        const connectedCount = totalDataNodes - orphanCount;

        setStats({
          memories: memories.length,
          documents: documents.length,
          chats: chats.length,
          orphans: orphanCount,
          connected: connectedCount
        });

        // If we have a trace_id currently selected, fetch its timeline.
        // Pipeline semantics: each trace_id == one pipeline execution.
        const activeTraceId = selectedNode?.data?.trace_id || selectedNode?.data?.metadata?.trace_id;
        if (activeTraceId) {
          setExecutionTrace({ traceId: activeTraceId, timeline: [], pipeline: null, loading: true, error: null, unknown: false });
          try {
            const res = await fetchExecutionTrace({ traceId: activeTraceId, limit: EXEC_TRACE_MAX });
            const timeline = res.timeline || [];

            // UNKNOWN rule: if no telemetry events for this trace_id, do NOT error.
            if (timeline.length === 0) {
              setExecutionTrace({
                traceId: res.traceId,
                timeline: [],
                pipeline: res.pipeline || null,
                loading: false,
                error: null,
                unknown: true
              });
            } else {
              setExecutionTrace({
                traceId: res.traceId,
                timeline,
                pipeline: res.pipeline || null,
                loading: false,
                error: null,
                unknown: false
              });

              // Minimal mapping untuk monitoring tata surya:
              // - bila ada failed/timeout di timeline → highlight kategori komunikasi/pipeline
              // KISS: highlight cat-edge + cat-chat saja agar terlihat "putus" secara cepat.
              const hasTimeout = timeline.some(e => (e.status || '').toLowerCase() === 'timeout');
              const hasFailed = timeline.some(e => (e.status || '').toLowerCase() === 'failed');

              if (hasTimeout || hasFailed) {
                const agentNodeId = 'cat-agent';
                const execNodeId = 'cat-execution';

                const nodesToActivate = new Set(['core-maef', agentNodeId, execNodeId]);
                const linksToActivate = new Set();

                // add direct links from categories we care about -> core
                links.forEach(l => {
                  const sId = l.source.id || l.source;
                  const tId = l.target.id || l.target;
                  // Flow is now Cluster -> Core (tId is core-maef)
                  if (tId === 'core-maef' && (sId === agentNodeId || sId === execNodeId)) {
                    linksToActivate.add(`${sId}->${tId}`);
                  }
                });

                setActivePath({ nodes: nodesToActivate, links: linksToActivate });
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => setActivePath(null), 4000);
              }
            }
          } catch (e) {
            // Do not block implementation due to trace imperfections.
            setExecutionTrace({
              traceId: activeTraceId,
              timeline: [],
              pipeline: null,
              loading: false,
              error: e?.message || 'Failed to load execution trace',
              unknown: true
            });
          }
        }



        setGraphData({ nodes, links });
      } catch (err) {
        console.error("Failed to load Knowledge Graph:", err);
      }
    }

    fetchData();
  }, []);

  const getNodeColor = (node) => {
    let baseColor = node.color;
    if (!baseColor) {
      switch (node.group) {
        case 'core': baseColor = '#ffffff'; break;
        case 'category': baseColor = '#94a3b8'; break;
        case 'subcategory': baseColor = '#64748b'; break;
        default: baseColor = '#475569'; break;
      }
    }

    if (activePath && !activePath.nodes.has(node.id)) {
      return baseColor + '20'; // Extreme fade out (hex alpha ~12%)
    }
    return baseColor;
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    if (window.triggerReasoningHighlight) {
      window.triggerReasoningHighlight(node.id);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-[#050505] text-slate-200 relative overflow-hidden font-body-base">

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
            linkColor={(link) => {
              const sourceId = link.source.id || link.source;
              const targetId = link.target.id || link.target;
              if (activePath) {
                if (activePath.links.has(`${sourceId}->${targetId}`)) return '#00ffcc'; // Active Glow
                return 'rgba(255,255,255,0.02)'; // Faded
              }
              return 'rgba(255,255,255,0.15)';
            }}
            linkWidth={(link) => {
              const sourceId = link.source.id || link.source;
              const targetId = link.target.id || link.target;
              return activePath && activePath.links.has(`${sourceId}->${targetId}`) ? 3 : 1;
            }}
            linkDirectionalParticles={(link) => {
              const sourceId = link.source.id || link.source;
              const targetId = link.target.id || link.target;
              return activePath && activePath.links.has(`${sourceId}->${targetId}`) ? 6 : 3;
            }}
            linkDirectionalParticleWidth={(link) => {
              const sourceId = link.source.id || link.source;
              const targetId = link.target.id || link.target;
              return activePath && activePath.links.has(`${sourceId}->${targetId}`) ? 4 : 2;
            }}
            linkDirectionalParticleSpeed={(link) => {
              const sourceId = link.source.id || link.source;
              const targetId = link.target.id || link.target;
              return activePath && activePath.links.has(`${sourceId}->${targetId}`) ? 0.02 : 0.006;
            }}
            linkDirectionalParticleColor={(link) => {
              const sourceId = link.source.id || link.source;
              const targetId = link.target.id || link.target;
              if (activePath && activePath.links.has(`${sourceId}->${targetId}`)) return '#ffffff';
              return typeof link.source === 'object' ? getNodeColor(link.source) : 'rgba(255,255,255,0.5)';
            }}
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

      {/* Right Panel: Detail / Metrics */}
      <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl p-6 flex flex-col z-20 overflow-y-auto h-1/2 md:h-full shrink-0">

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
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Status</div>
                <div className="text-xs text-slate-300">
                  {selectedNode.data?.status || (selectedNode.data?.relations === 0 ? 'FAILED' : 'SUCCESS')}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Used</div>
                <div className="text-xs text-slate-300">{selectedNode.data?.used ?? '0'} times</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Latency</div>
                <div className="text-xs text-slate-300">{selectedNode.data?.latencyMs ?? 'UNKNOWN'}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Provider</div>
                <div className="text-xs text-slate-300">{selectedNode.data?.provider || selectedNode.data?.metadata?.provider || 'UNKNOWN'}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Cost</div>
                <div className="text-xs text-slate-300">{selectedNode.data?.cost ?? selectedNode.data?.metadata?.cost ?? 'UNKNOWN'}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Trace ID</div>
                <div className="text-xs text-slate-300 break-all">{selectedNode.data?.trace_id || selectedNode.data?.metadata?.trace_id || 'UNKNOWN'}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Dependencies</div>
                <div className="text-xs text-slate-300">{Array.isArray(selectedNode.data?.dependencies) && selectedNode.data.dependencies.length > 0 ? selectedNode.data.dependencies.join(', ') : 'UNKNOWN'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Related Events</div>
                <div className="text-xs text-slate-300">{Array.isArray(selectedNode.data?.relatedEvents) && selectedNode.data.relatedEvents.length > 0 ? selectedNode.data.relatedEvents.join(' • ') : 'UNKNOWN'}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Failures</div>
                <div className="text-xs text-red-300">{Array.isArray(selectedNode.data?.failures) && selectedNode.data.failures.length > 0 ? selectedNode.data.failures.join(' | ') : 'UNKNOWN'}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Warnings</div>
                <div className="text-xs text-amber-300">{Array.isArray(selectedNode.data?.warnings) && selectedNode.data.warnings.length > 0 ? selectedNode.data.warnings.join(' | ') : 'UNKNOWN'}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Evidence</div>
                <div className="text-xs text-slate-300">{Array.isArray(selectedNode.data?.evidence) && selectedNode.data.evidence.length > 0 ? `${selectedNode.data.evidence.length} item(s)` : 'UNKNOWN'}</div>
              </div>
            </div>

              <div>
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">Relations</div>
                <div className={`text-xs font-bold ${selectedNode.data?.relations === 0 ? 'text-red-400' :
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
              Observability Dashboard
            </h2>

            <div className="space-y-5">

              {/* Feature: Execution Trace Timeline */}
              <div className="group pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                        Execution Trace Timeline
                      </div>
                      {/* minimal pipeline/chat health derived from timeline */}
                      {(() => {
                        if (!executionTrace?.timeline || executionTrace.timeline.length === 0) return null;
                        const hasTimeout = executionTrace.timeline.some(e => (e.status || '').toLowerCase() === 'timeout');
                        const hasFailed = executionTrace.timeline.some(e => (e.status || '').toLowerCase() === 'failed');
                        const hasRunning = executionTrace.timeline.some(e => (e.status || '').toLowerCase() === 'running' || (e.status || '').toLowerCase() === 'pending');

                        if (hasTimeout) return (
                          <div className="text-[9px] mt-1 text-amber-300 font-mono">
                            Status: ⏳ TIMEOUT (possible disconnect)
                          </div>
                        );
                        if (hasFailed) return (
                          <div className="text-[9px] mt-1 text-red-400 font-mono">
                            Status: ❌ FAILED (possible disconnect)
                          </div>
                        );
                        if (hasRunning) return (
                          <div className="text-[9px] mt-1 text-sky-300 font-mono">
                            Status: 🟡 RUNNING
                          </div>
                        );
                        return (
                          <div className="text-[9px] mt-1 text-emerald-300 font-mono">
                            Status: ✅ CONNECTED
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-[9px] text-slate-600 font-mono">
                      {executionTrace?.traceId ? String(executionTrace.traceId).slice(0, 10) + '…' : '—'}
                    </div>
                  </div>


                {executionTrace.loading ? (
                  <div className="text-[10px] text-slate-400 font-mono">Loading timeline…</div>
                ) : executionTrace.error ? (
                  <div className="text-[10px] text-red-400 font-mono">
                    Timeline error: {executionTrace.error}
                  </div>
                ) : executionTrace?.unknown || !executionTrace?.timeline || executionTrace.timeline.length === 0 ? (
                  <div className="text-[10px] text-slate-500 font-mono">NO TELEMETRY AVAILABLE (UNKNOWN)</div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {executionTrace.timeline
                      // ensure ascending even if backend sorts
                      .slice()
                      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                      .map((evt, idx) => {
                        const status = evt.status || 'unknown';
                        const statusColor =
                          status === 'success'
                            ? 'text-emerald-300'
                            : status === 'failed'
                              ? 'text-red-400'
                              : status === 'timeout'
                                ? 'text-amber-300'
                                : status === 'running'
                                  ? 'text-sky-300'
                                  : status === 'pending'
                                    ? 'text-slate-300'
                                    : 'text-slate-300';

                        const metadata = evt.metadata || {};
                        const metaSummaryParts = [];
                        if (metadata.provider) metaSummaryParts.push(`provider:${metadata.provider}`);
                        if (metadata.decision) metaSummaryParts.push(`decision:${metadata.decision}`);
                        if (metadata.failures) {
                          const f = metadata.failures;
                          if (typeof f === 'string') metaSummaryParts.push(`failures:${f.slice(0, 60)}`);
                          else metaSummaryParts.push('failures:present');
                        }

                        const metaSummary = metaSummaryParts.length > 0 ? metaSummaryParts.join(' | ') : null;
                        const ts = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString('id-ID', { hour12: false }) : '—';
                        const label = evt.event || evt.type || 'Event';

                        return (
                          <div
                            key={`${evt.timestamp || 't'}-${idx}`}
                            className="flex gap-3 items-start bg-white/5 border border-white/5 rounded-lg px-3 py-2"
                          >
                            <div className="pt-0.5">
                              <div className={`w-2.5 h-2.5 rounded-full ${statusColor.replace('text-', 'bg-')}`}></div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] font-mono text-slate-200 truncate">
                                  {label}
                                </div>
                                <div className="text-[9px] text-slate-500 font-mono whitespace-nowrap">{ts}</div>
                              </div>
                              <div className="text-[9px] font-mono mt-0.5">
                                <span className={statusColor}>{status}</span>
                                {metaSummary && (
                                  <span className="text-slate-500"> • {metaSummary}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* V2-B Core: Pipeline + Failure Localization */}
              {executionTrace?.pipeline?.steps && executionTrace.pipeline.steps.length > 0 && (
                <div className="group pt-4 border-t border-white/5">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono mb-3">
                    Pipeline Execution (V2 Core)
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {executionTrace.pipeline.steps.map((step) => {
                      const status = step.status || 'UNKNOWN';
                      const statusClass =
                        status === 'SUCCESS'
                          ? 'text-emerald-300'
                          : status === 'FAILED'
                            ? 'text-red-400'
                            : status === 'RUNNING'
                              ? 'text-sky-300'
                              : 'text-slate-300';

                      return (
                        <div key={step.key} className="bg-white/5 border border-white/5 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] text-slate-200 font-mono">{step.order}. {step.label}</div>
                            <div className={`text-[9px] font-mono ${statusClass}`}>{status}</div>
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono mt-1">
                            latency: {typeof step.latencyMs === 'number' ? `${step.latencyMs}ms` : 'UNKNOWN'} • provider: {step.provider || 'UNKNOWN'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 space-y-1 text-[10px] font-mono border-t border-white/5 pt-3">
                    <div className="text-slate-400">
                      ROOT CAUSE: <span className="text-red-300">{executionTrace.pipeline.summary?.rootCause || 'UNKNOWN'}</span>
                    </div>
                    <div className="text-slate-400">
                      FAILED STEP: <span className="text-red-300">{executionTrace.pipeline.summary?.failedStep || 'UNKNOWN'}</span>
                    </div>
                    <div className="text-slate-400">
                      BOTTLENECK: <span className="text-amber-300">
                        {executionTrace.pipeline.summary?.bottleneck
                          ? `${executionTrace.pipeline.summary.bottleneck.step} (${executionTrace.pipeline.summary.bottleneck.latencyMs}ms)`
                          : 'UNKNOWN'}
                      </span>
                    </div>
                  </div>
                </div>
              )}


              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-green-400 transition-colors">
                    Memory Reads
                  </div>
                  <div className="text-2xl font-light text-green-400 font-mono drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]">
                    {observability.memoryReads}
                  </div>
                </div>

                <div className="group">
                  <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-emerald-300 transition-colors">
                    Memory Writes
                  </div>
                  <div className="text-2xl font-light text-emerald-300 font-mono drop-shadow-[0_0_15px_rgba(16,185,129,0.35)]">
                    {observability.memoryWrites}
                  </div>
                </div>

                <div className="group">
                  <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-blue-300 transition-colors">
                    LLM Calls
                  </div>
                  <div className="text-2xl font-light text-blue-300 font-mono drop-shadow-[0_0_15px_rgba(59,130,246,0.35)]">
                    {observability.llmCalls}
                  </div>
                </div>

                <div className="group">
                  <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono group-hover:text-amber-200 transition-colors">
                    Avg Latency
                  </div>
                  <div className="text-2xl font-light text-amber-200 font-mono drop-shadow-[0_0_15px_rgba(245,158,11,0.35)]">
                    {observability.avgLatencyMs}
                    <span className="text-[10px] text-slate-400 ml-1">ms</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="group">
                  <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">
                    Errors
                  </div>
                  <div className="text-2xl font-light text-red-400 font-mono drop-shadow-[0_0_15px_rgba(239,68,68,0.35)]">
                    {observability.errorCount}
                  </div>
                </div>

                <div className="group">
                  <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">
                    Cost Alerts
                  </div>
                  <div className="text-2xl font-light text-amber-400 font-mono drop-shadow-[0_0_15px_rgba(234,179,8,0.35)]">
                    {observability.costAlertCount}
                  </div>
                </div>
              </div>

              <div className="group pt-4 border-t border-white/5">

                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                    Ecosystem Health
                  </div>
                  <div className="text-[9px] text-slate-600 font-mono">
                    LAST CHECK: {lastCheckTime}
                  </div>
                </div>

                {(() => {
                  const vitalsValues = Object.values(vitals);
                  const hasDown = vitalsValues.includes('DOWN');
                  const hasDegraded = vitalsValues.includes('DEGRADED');
                  const hasUnknown = vitalsValues.includes('UNKNOWN');

                  let overallStatus = 'HEALTHY';
                  let overallColor = 'text-green-400';
                  let overallGlow = 'drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]';

                  if (hasDown) {
                    overallStatus = 'DOWN';
                    overallColor = 'text-red-400';
                    overallGlow = 'drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]';
                  } else if (hasDegraded) {
                    overallStatus = 'DEGRADED';
                    overallColor = 'text-yellow-400';
                    overallGlow = 'drop-shadow-[0_0_15px_rgba(234,179,8,0.4)]';
                  } else if (hasUnknown) {
                    overallStatus = 'UNKNOWN';
                    overallColor = 'text-slate-300';
                    overallGlow = 'drop-shadow-[0_0_12px_rgba(148,163,184,0.35)]';
                  }

                  return (
                    <div className="mb-4">
                      <div className="text-[9px] text-slate-500 mb-1 uppercase tracking-wider font-mono">System Status</div>
                      <div className={`text-lg font-light tracking-widest font-mono ${overallColor} ${overallGlow}`}>
                        {overallStatus}
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2 text-[10px] font-mono tracking-widest text-slate-300 border-t border-white/5 pt-4">
                  <div className="flex items-center gap-2"><span className={vitals.supabase === 'DOWN' ? 'text-red-400' : vitals.supabase === 'DEGRADED' ? 'text-yellow-400' : vitals.supabase === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.supabase}</span> SUPABASE</div>
                  <div className="flex items-center gap-2"><span className={vitals.auth === 'DOWN' ? 'text-red-400' : vitals.auth === 'DEGRADED' ? 'text-yellow-400' : vitals.auth === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.auth}</span> AUTH</div>
                  <div className="flex items-center gap-2"><span className={vitals.realtime === 'DOWN' ? 'text-red-400' : vitals.realtime === 'DEGRADED' ? 'text-yellow-400' : vitals.realtime === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.realtime}</span> REALTIME</div>
                  <div className="flex items-center gap-2"><span className={vitals.storage === 'DOWN' ? 'text-red-400' : vitals.storage === 'DEGRADED' ? 'text-yellow-400' : vitals.storage === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.storage}</span> STORAGE</div>
                  <div className="flex items-center gap-2"><span className={vitals.edge === 'DOWN' ? 'text-red-400' : vitals.edge === 'DEGRADED' ? 'text-yellow-400' : vitals.edge === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.edge}</span> EDGE FUNCTIONS</div>
                  <div className="flex items-center gap-2"><span className={vitals.memory === 'DOWN' ? 'text-red-400' : vitals.memory === 'DEGRADED' ? 'text-yellow-400' : vitals.memory === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.memory}</span> MEMORY</div>
                  <div className="flex items-center gap-2"><span className={vitals.rag === 'DOWN' ? 'text-red-400' : vitals.rag === 'DEGRADED' ? 'text-yellow-400' : vitals.rag === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.rag}</span> RAG</div>
                  <div className="flex items-center gap-2"><span className={vitals.embedding === 'DOWN' ? 'text-red-400' : vitals.embedding === 'DEGRADED' ? 'text-yellow-400' : vitals.embedding === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.embedding}</span> EMBEDDING</div>
                  <div className="flex items-center gap-2"><span className={vitals.verification === 'DOWN' ? 'text-red-400' : vitals.verification === 'DEGRADED' ? 'text-yellow-400' : vitals.verification === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.verification}</span> VERIFICATION</div>
                  <div className="flex items-center gap-2"><span className={vitals.provider === 'DOWN' ? 'text-red-400' : vitals.provider === 'DEGRADED' ? 'text-yellow-400' : vitals.provider === 'HEALTHY' ? 'text-green-400' : 'text-slate-400'}>{vitals.provider}</span> PROVIDER</div>
                </div>
              </div>

              {/* V2-E: Bottleneck Panel */}
              <div className="group pt-4 border-t border-white/5">
                <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider font-mono">
                  Bottleneck (P50 / P95 / P99)
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-[9px] text-slate-500 font-mono">P50</div>
                    <div className="text-xs text-emerald-300 font-mono">
                      {typeof observability.latencyP50Ms === 'number' ? `${observability.latencyP50Ms}ms` : 'UNKNOWN'}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-[9px] text-slate-500 font-mono">P95</div>
                    <div className="text-xs text-amber-300 font-mono">
                      {typeof observability.latencyP95Ms === 'number' ? `${observability.latencyP95Ms}ms` : 'UNKNOWN'}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded p-2">
                    <div className="text-[9px] text-slate-500 font-mono">P99</div>
                    <div className="text-xs text-red-300 font-mono">
                      {typeof observability.latencyP99Ms === 'number' ? `${observability.latencyP99Ms}ms` : 'UNKNOWN'}
                    </div>
                  </div>
                </div>

                {observability.topSlowComponents.length === 0 ? (
                  <div className="text-[10px] text-slate-500 font-mono">No component latency telemetry.</div>
                ) : (
                  <div className="space-y-2">
                    {observability.topSlowComponents.map((c, idx) => (
                      <div key={`${c.component}-${idx}`} className="bg-white/5 border border-white/5 rounded px-3 py-2">
                        <div className="text-[10px] text-slate-200 font-mono truncate">{c.component}</div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          p95:{typeof c.p95 === 'number' ? `${c.p95}ms` : 'UNKNOWN'} • p99:{typeof c.p99 === 'number' ? `${c.p99}ms` : 'UNKNOWN'} • avg:{typeof c.avg === 'number' ? `${c.avg}ms` : 'UNKNOWN'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* V2-F: Recent Failure Panel */}
              <div className="group pt-4 border-t border-white/5">
                <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider font-mono">
                  Recent Known Failures
                </div>

                {observability.recentFailures.length === 0 ? (
                  <div className="text-[10px] text-slate-500 font-mono">No known failures in current telemetry.</div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {observability.recentFailures.map((f, idx) => (
                      <div key={`${f.type}-${idx}`} className="bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                        <div className="text-[10px] text-red-300 font-mono uppercase">{f.type}</div>
                        <div className="text-[10px] text-slate-300 mt-0.5">{String(f.message || 'Unknown').slice(0, 140)}</div>
                        <div className="text-[9px] text-slate-500 font-mono mt-1">
                          {f.at ? new Date(f.at).toLocaleString('id-ID', { hour12: false }) : 'UNKNOWN'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="group pt-4 border-t border-white/5" title="Nodes that exist but are not connected to the Mamet knowledge graph.">
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">
                  Orphan Nodes
                </div>
                {(() => {
                  const oc = stats.orphans || 0;
                  let colorClass = 'text-[#00ff88] drop-shadow-[0_0_15px_rgba(0,255,136,0.4)]'; // Green for 0
                  if (oc >= 1 && oc <= 5) colorClass = 'text-[#ffcc00] drop-shadow-[0_0_15px_rgba(255,204,0,0.4)]'; // Yellow for 1-5
                  else if (oc > 5) colorClass = 'text-[#ff4444] drop-shadow-[0_0_15px_rgba(255,68,68,0.4)]'; // Red for >5
                  return (
                    <div className={`text-3xl font-light font-mono ${colorClass}`}>
                      {oc}
                    </div>
                  );
                })()}
              </div>

              <div className="group pt-4 border-t border-white/5" title="Nodes with at least one active relation.">
                <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider font-mono">
                  Connected Nodes
                </div>
                {(() => {
                  const cc = stats.connected || 0;
                  let colorClass = 'text-[#00ff88] drop-shadow-[0_0_15px_rgba(0,255,136,0.4)]'; // Neon Green for >20
                  if (cc === 0) colorClass = 'text-[#ff4444] drop-shadow-[0_0_15px_rgba(255,68,68,0.4)]'; // Red for 0
                  else if (cc >= 1 && cc <= 20) colorClass = 'text-[#ffcc00] drop-shadow-[0_0_15px_rgba(255,204,0,0.4)]'; // Yellow for 1-20
                  return (
                    <div className={`text-3xl font-light font-mono ${colorClass}`}>
                      {cc}
                    </div>
                  );
                })()}
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
