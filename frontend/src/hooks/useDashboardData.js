import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { fetchExecutionTrace } from '../../services/ExecutionTraceService';

const EXEC_TRACE_MAX = 40;

/**
 * Safely push a link only if both source and target nodes exist.
 * Prevents "node not found" / "Cannot create property 'vx' on string" errors.
 */
function safeLink(links, nodes, source, target, extra = {}) {
  const sourceId = (typeof source === 'object' && source !== null) ? (source.id || source) : source;
  const targetId = (typeof target === 'object' && target !== null) ? (target.id || target) : target;
  if (!nodes.some(n => n.id === sourceId)) {
    console.warn(`[safeLink] Skipped — source node "${sourceId}" not found`);
    return;
  }
  if (!nodes.some(n => n.id === targetId)) {
    console.warn(`[safeLink] Skipped — target node "${targetId}" not found`);
    return;
  }
  links.push({ source, target, ...extra });
}

export default function useDashboardData() {
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
    provider: 'UNKNOWN',
    agentProcess: 'UNKNOWN'
  });
  const [selectedNode, setSelectedNode] = useState(null);
  const [activePath, setActivePath] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
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
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Fetch Supabase Data
  useEffect(() => {
    async function fetchData() {
      try {
        const [memRes, docRes, chatRes, chunkRes] = await Promise.all([
          supabase.from('user_memories').select('id, summary, created_at, memory_hits, metadata').limit(500),
          supabase.from('documents').select('id, title, created_at').limit(500),
          supabase.from('chats').select('id, title, workspace_type, created_at').limit(500),
          supabase.from('document_chunks').select('id, document_id').limit(5000)
        ]);

        const memories = memRes.data || [];
        const documents = docRes.data || [];
        const chats = chatRes.data || [];
        const chunks = chunkRes.data || [];

        const docChunkCounts = {};
        chunks.forEach(c => {
          if (c.document_id) {
            docChunkCounts[c.document_id] = (docChunkCounts[c.document_id] || 0) + 1;
          }
        });

        // ---- Observability telemetry ----
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
          pipelineIncidentsDown,
          pipelineIncidentsTotal,
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

        const { data: heartbeatData } = await supabase
          .from('service_heartbeat')
          .select('status, last_heartbeat_at')
          .eq('service_name', 'agent-process')
          .maybeSingle();

        let agentProcessHealth = 'UNKNOWN';
        if (heartbeatData) {
          const now = new Date();
          const heartbeatTs = heartbeatData.last_heartbeat_at;
          const lastBeat = heartbeatTs ? new Date(heartbeatTs) : null;
          const diffMinutes = lastBeat ? (now - lastBeat) / (1000 * 60) : Number.POSITIVE_INFINITY;

          if (heartbeatData.status === 'DOWN' || diffMinutes > 5) {
            agentProcessHealth = 'DOWN';
          } else if (diffMinutes <= 5) {
            agentProcessHealth = 'HEALTHY';
          }
        }

        let edgeStatus = '🟡';
        try {
          const edgeRes = await supabase.functions.invoke('ping');
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
          provider: normalizeHealthStatus(providerHealthRaw),
          agentProcess: agentProcessHealth
        }));

        setLastCheckTime(new Date().toLocaleTimeString('id-ID', { hour12: false }));

        // =============== BUILD GRAPH NODES & LINKS ===============
        const nodes = [];
        const links = [];

        // Helper to determine health color
        const getHealthColor = (relations) => {
          if (relations === 0) return '#ef4444';
          if (relations < 3) return '#eab308';
          return '#22c55e';
        };

        // Helper untuk mapping legacy name ke arsitektur baru
        const mapLegacyName = (name) => {
          if (!name) return 'General';
          const n = name.toLowerCase();
          if (n === 'owner' || n === 'ws-owner') return 'engineer';
          if (n === 'ws-agent-forge') return 'assistant';
          return name;
        };

        // 1. Central Node
        nodes.push({ id: 'core-maef', name: 'MAEF KERNEL', type: 'Core', group: 'core', val: 50, isCategory: true, fx: 0, fy: 0 });

        // 2. Primary Clusters
        const primaryClusters = [
          { id: 'cat-memory', name: 'Memory Cluster' },
          { id: 'cat-agent', name: 'Agent Cluster' },
          { id: 'cat-execution', name: 'Execution Cluster' },
          { id: 'cat-knowledge', name: 'Knowledge Cluster' },
          { id: 'cat-telemetry', name: 'Activity / Telemetry Cluster' }
        ];

        primaryClusters.forEach(cluster => {
          nodes.push({ id: cluster.id, name: cluster.name, type: 'Category', group: 'category', val: 25, isCategory: true });
          safeLink(links, nodes, cluster.id, 'core-maef');
        });

        // Dynamic subclusters registry
        const dynamicSubclusters = {};
        const registerSubcluster = (id, name, parent) => {
          if (!dynamicSubclusters[id]) {
            dynamicSubclusters[id] = { id, name: name.toUpperCase(), type: 'Subcluster', group: 'subcategory', val: 15, isCategory: true, parent };
          }
        };

        // Pre-register static subclusters
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
        ];

        staticSubclusters.forEach(sc => registerSubcluster(sc.id, sc.name, sc.parent));

        // 3. Pipeline Services
        const pipelineServices = [
          { id: 'pipe-supabase',     name: 'Supabase (DB/Auth)',   statusKey: 'supabase' },
          { id: 'pipe-auth',         name: 'Auth',                 statusKey: 'auth' },
          { id: 'pipe-realtime',     name: 'Realtime',             statusKey: 'realtime' },
          { id: 'pipe-storage',      name: 'Storage',              statusKey: 'storage' },
          { id: 'pipe-edge',         name: 'Edge Function',        statusKey: 'edge' },
          { id: 'pipe-memory',       name: 'Memory Service',       statusKey: 'memory' },
          { id: 'pipe-rag',          name: 'RAG Service',          statusKey: 'rag' },
          { id: 'pipe-embedding',    name: 'Embedding',            statusKey: 'embedding' },
          { id: 'pipe-verification', name: 'Verification Engine',  statusKey: 'verification' },
          { id: 'pipe-provider',     name: 'LLM Provider',         statusKey: 'provider' },
          { id: 'pipe-agent',        name: 'Agent Process',        statusKey: 'agentProcess' },
        ];

        pipelineServices.forEach(service => {
          const status = vitals[service.statusKey] || 'UNKNOWN';
          let color = '#94a3b8';
          if (status === 'HEALTHY') color = '#22c55e';
          else if (status === 'DEGRADED') color = '#eab308';
          else if (status === 'DOWN') color = '#ef4444';

          nodes.push({
            id: service.id,
            name: service.name,
            type: 'Pipeline Service',
            group: 'pipeline',
            val: 12,
            isCategory: false,
            status,
            color,
            data: { status }
          });

          const linkColor = (status === 'HEALTHY') ? '#22c55e' : (status === 'DEGRADED' ? '#eab308' : '#ef4444');
          const linkWidth = (status === 'HEALTHY') ? 2 : 0.8;
          safeLink(links, nodes, service.id, 'core-maef', { color: linkColor, width: linkWidth, isPipelineLink: true });
          safeLink(links, nodes, service.id, 'cat-telemetry');
        });

        // 4. Push all dynamic subclusters to nodes (before data nodes reference them)
        Object.values(dynamicSubclusters).forEach(sc => {
          nodes.push(sc);
          safeLink(links, nodes, sc.id, sc.parent);
        });

        // 5. Process Memories
        memories.forEach(m => {
          let type = m.metadata?.type || m.metadata?.category || 'User';
          type = mapLegacyName(type);
          const subcatId = `subcat-mem-${type.toLowerCase()}`;
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

          if (relationsCount > 0) {
            safeLink(links, nodes, `mem-${m.id}`, subcatId);
          }

          causalLinks.forEach(targetId => {
            safeLink(links, nodes, `mem-${targetId}`, `mem-${m.id}`);
          });
          if (sourceChatId && chats.some(c => c.id === sourceChatId)) {
            safeLink(links, nodes, `chat-${sourceChatId}`, `mem-${m.id}`);
          }
          if (sourceDocId && documents.some(d => d.id === sourceDocId)) {
            safeLink(links, nodes, `doc-${sourceDocId}`, `mem-${m.id}`);
          }
        });

        // 6. Process Documents
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

          if (chunkCount > 0) {
            safeLink(links, nodes, `doc-${d.id}`, subcatId);
          }
        });

        // 7. Process Chats
        // IMPORTANT: Also push any newly registered dynamic subclusters from steps 5-6 before chat links reference them
        Object.values(dynamicSubclusters).forEach(sc => {
          if (!nodes.some(n => n.id === sc.id)) {
            nodes.push(sc);
            safeLink(links, nodes, sc.id, sc.parent);
          }
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

          safeLink(links, nodes, `chat-${c.id}`, subcatId);
        });

        // 8. Final push any remaining dynamic subclusters registered during chat processing
        Object.values(dynamicSubclusters).forEach(sc => {
          if (!nodes.some(n => n.id === sc.id)) {
            nodes.push(sc);
            safeLink(links, nodes, sc.id, sc.parent);
          }
        });

        // ---- STATS ----
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

        // ---- Execution Trace ----
        const activeTraceId = selectedNode?.data?.trace_id || selectedNode?.data?.metadata?.trace_id;
        if (activeTraceId) {
          setExecutionTrace({ traceId: activeTraceId, timeline: [], pipeline: null, loading: true, error: null, unknown: false });
          try {
            const res = await fetchExecutionTrace({ traceId: activeTraceId, limit: EXEC_TRACE_MAX });
            const timeline = res.timeline || [];

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

              const hasTimeout = timeline.some(e => (e.status || '').toLowerCase() === 'timeout');
              const hasFailed = timeline.some(e => (e.status || '').toLowerCase() === 'failed');

              if (hasTimeout || hasFailed) {
                const agentNodeId = 'cat-agent';
                const execNodeId = 'cat-execution';
                const nodesToActivate = new Set(['core-maef', agentNodeId, execNodeId]);
                const linksToActivate = new Set();

                links.forEach(l => {
                  const sId = l.source.id || l.source;
                  const tId = l.target.id || l.target;
                  if (tId === 'core-maef' && (sId === agentNodeId || sId === execNodeId)) {
                    linksToActivate.add(`${sId}->${tId}`);
                  }
                });

                setActivePath({ nodes: nodesToActivate, links: linksToActivate });
              }
            }
          } catch (e) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
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
  };
}

