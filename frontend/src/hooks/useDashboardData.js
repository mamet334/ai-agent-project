import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { fetchExecutionTrace } from '../services/ExecutionTraceService';

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
  const [stats, setStats] = useState({ memories: 0, documents: 0, chats: 0, orphans: 0, connected: 0, memoryConflicts: 0 });
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
        const authRes = await supabase.auth.getSession();
        const currentUserId = authRes?.data?.session?.user?.id;

        let memQuery = supabase.from('user_memories').select('id, summary, created_at, memory_hits, metadata, status').limit(500);
        let docQuery = supabase.from('documents').select('id, title, created_at').limit(500);
        let chatQuery = supabase.from('chats').select('id, title, workspace_type, created_at').limit(500);
        let chunkQuery = currentUserId
          ? supabase.from('document_chunks').select('id, document_id, documents!inner(user_id)').eq('documents.user_id', currentUserId).limit(5000)
          : supabase.from('document_chunks').select('id, document_id').limit(5000);

        if (currentUserId) {
          memQuery = memQuery.eq('user_id', currentUserId);
          docQuery = docQuery.eq('user_id', currentUserId);
          chatQuery = chatQuery.eq('user_id', currentUserId);
        }

        const [memRes, docRes, chatRes, chunkRes] = await Promise.all([
          memQuery,
          docQuery,
          chatQuery,
          chunkQuery
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

        // ---- Observability telemetry (0 LLM Tokens, Zero-Cost DB read) ----
        const [logsRes, checksRes, incidentsRes, verRes, agentLogsRes, apiUsageRes] = await Promise.all([
          supabase.from('ai_system_logs').select('*').order('created_at', { ascending: false }).limit(100),
          supabase.from('checks').select('status_code,response_time_ms,checked_at').order('checked_at', { ascending: false }).limit(100),
          supabase.from('incidents').select('status,started_at,resolved_at').order('started_at', { ascending: false }).limit(100),
          supabase.from('verification_audit_logs').select('decision,status,failures,execution_time_ms,timestamp,metadata').order('timestamp', { ascending: false }).limit(100),
          supabase.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(100),
          supabase.from('api_usage').select('*').order('created_at', { ascending: false }).limit(100)
        ]);

        const logs = logsRes.data || [];
        const agentLogs = agentLogsRes.data || [];
        const apiUsages = apiUsageRes.data || [];
        const checks = checksRes.data || [];
        const verificationItems = verRes.data || [];

        const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
        const nowTs = Date.now();
        const isRecent = (ts) => {
          if (!ts) return false;
          return (nowTs - new Date(ts).getTime()) <= FIFTEEN_MINUTES_MS;
        };

        const errors = logs.filter(l => l.error_flag);
        const costAlerts = logs.filter(l => l.cost_alert_flag);
        const avgLatency = logs.length > 0 ? Math.round(logs.reduce((acc, l) => acc + (l.latency_ms || 0), 0) / logs.length) : 0;

        const pipelineIncidentsTotal = (incidentsRes.data || []).length;
        const pipelineIncidentsDown = (incidentsRes.data || []).filter(i => (i.status || '').toUpperCase() === 'DOWN').length;

        // Audit counts (all historical)
        const verificationFail = verificationItems.filter(v => (v.decision || '').toUpperCase() === 'FAIL' || (v.status || '').toUpperCase() === 'FAIL').length;
        const verificationWarn = verificationItems.filter(v => (v.decision || '').toUpperCase() === 'WARNING' || (v.decision || '').toUpperCase() === 'WARN' || (v.status || '').toUpperCase() === 'WARN' || (v.status || '').toUpperCase() === 'WARNING').length;

        // Live recent failures for status evaluation (< 15 mins)
        const recentVerificationFail = verificationItems.filter(v => {
          const isFail = (v.decision || '').toUpperCase() === 'FAIL' || (v.status || '').toUpperCase() === 'FAIL';
          return isFail && isRecent(v.created_at);
        }).length;

        const recentVerificationWarn = verificationItems.filter(v => {
          const isWarn = (v.decision || '').toUpperCase() === 'WARNING' || (v.decision || '').toUpperCase() === 'WARN' || (v.status || '').toUpperCase() === 'WARN';
          return isWarn && isRecent(v.created_at);
        }).length;

        const percentile = (arr, p) => {
          if (!arr || arr.length === 0) return null;
          const idx = Math.ceil((p / 100) * arr.length) - 1;
          const safeIdx = Math.max(0, Math.min(arr.length - 1, idx));
          return arr[safeIdx];
        };

        // Collect latency samples across all telemetry sources (checks, verification, agent_logs, ai_system_logs)
        const latencySamples = [
          ...logs.map(l => Number(l.latency_ms)),
          ...checks.map(c => Number(c.response_time_ms)),
          ...verificationItems.map(v => Number(v.execution_time_ms)),
          ...agentLogs.map(l => Number(l.metadata?.latency_ms || l.metadata?.execution_time_ms || l.metadata?.duration_ms))
        ]
          .filter(v => Number.isFinite(v) && v > 0)
          .sort((a, b) => a - b);

        const latencyP50Ms = percentile(latencySamples, 50);
        const latencyP95Ms = percentile(latencySamples, 95);
        const latencyP99Ms = percentile(latencySamples, 99);

        const componentLatencyMap = {};
        logs.forEach(l => {
          const key = l.component || l.module || l.event_type || l.provider || 'AI Service';
          const lat = Number(l.latency_ms);
          if (!Number.isFinite(lat) || lat <= 0) return;
          if (!componentLatencyMap[key]) componentLatencyMap[key] = [];
          componentLatencyMap[key].push(lat);
        });

        checks.forEach(c => {
          const lat = Number(c.response_time_ms);
          if (!Number.isFinite(lat) || lat <= 0) return;
          const key = 'System Monitor Check';
          if (!componentLatencyMap[key]) componentLatencyMap[key] = [];
          componentLatencyMap[key].push(lat);
        });

        verificationItems.forEach(v => {
          const lat = Number(v.execution_time_ms);
          if (!Number.isFinite(lat) || lat <= 0) return;
          const key = 'Verification Engine';
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

        // Robust recursive failure sanitizer to prevent [object Object]
        const sanitizeFailureMessage = (raw) => {
          if (!raw) return 'Unknown failure';
          if (typeof raw === 'string') {
            try {
              const parsed = JSON.parse(raw);
              if (typeof parsed === 'object' && parsed !== null) {
                return sanitizeFailureMessage(parsed);
              }
            } catch (_) {}
            return raw;
          }
          if (Array.isArray(raw)) {
            const joined = raw.map(sanitizeFailureMessage).filter(Boolean).join('; ');
            return joined || 'Empty failure array';
          }
          if (typeof raw === 'object') {
            return raw.reason || raw.message || raw.rule || raw.error || raw.violation || JSON.stringify(raw);
          }
          return String(raw);
        };

        const toolFailures = logs
          .filter(l => l.error_flag || String(l.status || '').toLowerCase().includes('fail') || String(l.status || '').toLowerCase().includes('timeout'))
          .map(l => ({
            type: String(l.error_type || l.event_type || l.component || 'unknown').toLowerCase().includes('tool') ? 'tool-timeout-or-failure' : 'provider-or-runtime-error',
            message: sanitizeFailureMessage(l.error_message || l.message || 'Unknown failure'),
            at: l.created_at || null
          }));

        const verificationFailures = verificationItems
          .filter(v => {
            const s = String(v.status || v.decision || '').toLowerCase();
            return s.includes('fail') || s.includes('error') || s.includes('warn');
          })
          .map(v => ({
            type: (v.decision || v.status || 'verification-fail').toUpperCase(),
            message: sanitizeFailureMessage(v.failures || v.decision || v.status || 'Verification failure'),
            at: v.created_at || null
          }));

        const ragUnavailableFailures = (docRes.error || chunkRes.error) ? [{
          type: 'rag-unavailable',
          message: sanitizeFailureMessage(docRes.error?.message || chunkRes.error?.message || 'RAG unavailable'),
          at: new Date().toISOString()
        }] : [];

        const supabaseDisconnectedFailures = (memRes.error || docRes.error) ? [{
          type: 'supabase-disconnected',
          message: sanitizeFailureMessage(memRes.error?.message || docRes.error?.message || 'Supabase disconnected'),
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

        const totalMemoryReads = logs.reduce((acc, l) => acc + (l.memory_fetch_count || 0), 0) +
          agentLogs.filter(l => (l.event_type || '').toLowerCase().includes('memory.read') || (l.event_type || '').toLowerCase().includes('retrieval')).length;

        const totalMemoryWrites = logs.reduce((acc, l) => acc + (l.memory_write_count || 0), 0) +
          agentLogs.filter(l => (l.event_type || '').toLowerCase().includes('memory.write') || (l.event_type || '').toLowerCase().includes('memory_save')).length;

        const totalLlmCalls = Math.max(
          logs.reduce((acc, l) => acc + (l.llm_call_count || 0), 0),
          apiUsages.length,
          agentLogs.filter(l => (l.event_type || '').toLowerCase().includes('provider') || (l.event_type || '').toLowerCase().includes('response')).length
        );

        const computedAvgLatency = avgLatency || (latencySamples.length > 0 ? Math.round(latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length) : 0);

        setObservability({
          memoryReads: totalMemoryReads,
          memoryWrites: totalMemoryWrites,
          llmCalls: totalLlmCalls,
          avgLatencyMs: computedAvgLatency,
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

        const storageRes = await supabase.storage.listBuckets();

        const { data: heartbeatData } = await supabase
          .from('service_heartbeat')
          .select('status, last_heartbeat_at')
          .eq('service_name', 'agent-process')
          .maybeSingle();

        let edgeStatus = '🟡';
        try {
          const edgeRes = await supabase.functions.invoke('ping');
          if (edgeRes.error && edgeRes.error.message.includes('fetch')) edgeStatus = '🔴';
          else edgeStatus = '🟢';
        } catch (e) {
          edgeStatus = '🔴';
        }

        let agentProcessHealth = 'UNKNOWN';
        if (heartbeatData) {
          const now = new Date();
          const heartbeatTs = heartbeatData.last_heartbeat_at;
          const lastBeat = heartbeatTs ? new Date(heartbeatTs) : null;
          const diffMinutes = lastBeat ? (now - lastBeat) / (1000 * 60) : Number.POSITIVE_INFINITY;

          if (heartbeatData.status === 'DOWN') {
            agentProcessHealth = 'DOWN';
          } else if (diffMinutes <= 15) {
            agentProcessHealth = 'HEALTHY';
          } else if (edgeStatus === '🟢') {
            agentProcessHealth = 'HEALTHY';
          } else {
            agentProcessHealth = 'DEGRADED';
          }
        } else if (edgeStatus === '🟢') {
          agentProcessHealth = 'HEALTHY';
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

        const recentProviderErrors = logs.filter(l => l.error_flag && isRecent(l.created_at));
        const providerHealthRaw = recentProviderErrors.length > 0
          ? 'DEGRADED'
          : (logs.some(l => l.provider || l.model || l.provider_name) || agentLogs.some(l => l.provider))
            ? 'HEALTHY'
            : 'HEALTHY';

        const verificationHealthRaw = recentVerificationFail > 0
          ? 'DEGRADED'
          : recentVerificationWarn > 0
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

        const mapLegacyName = (name) => {
          if (!name) return 'General';
          let n = name.toLowerCase();
          
          // Remove legacy 'ws-' prefix
          if (n.startsWith('ws-')) n = n.substring(3);
          
          // Map to the 3 canonical roles
          if (n === 'owner') return 'engineer';
          if (n === 'agent-forge' || n === 'asisten' || n === 'assistant') return 'assistant';
          if (n === 'lite') return 'lite';
          
          return n;
        };

        // ====================================================================
        // PHASE 1: Register ALL possible subcluster IDs upfront
        // This prevents "node not found: subcat-agent-engineer" because we
        // pre-compute all possible workspace_type mappings from chats data.
        // ====================================================================

        // Collect ALL possible subcluster IDs from data before building graph
        const allPossibleSubclusterIds = new Set();

        // Static subclusters
        const staticSubclusterDefs = [
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

        staticSubclusterDefs.forEach(sc => allPossibleSubclusterIds.add(sc.id));

        // Pre-compute all possible memory subcluster IDs from actual memory data
        memories.forEach(m => {
          const type = mapLegacyName(m.metadata?.type || m.metadata?.category || 'User');
          allPossibleSubclusterIds.add(`subcat-mem-${type.toLowerCase()}`);
        });

        // Pre-compute all possible document subcluster IDs from actual doc data
        documents.forEach(d => {
          const type = mapLegacyName(d.metadata?.file_type || d.metadata?.type || 'Docs');
          allPossibleSubclusterIds.add(`subcat-know-${type.toLowerCase()}`);
        });

        // Pre-compute all possible chat subcluster IDs from actual chat data
        // THIS PREVENTS the "subcat-agent-engineer" error!
        chats.forEach(c => {
          const type = mapLegacyName(c.workspace_type || 'Sub');
          allPossibleSubclusterIds.add(`subcat-agent-${type.toLowerCase()}`);
        });

        // Build a lookup of all subcluster definitions
        const allSubclusterDefs = new Map();

        // Add static ones first
        staticSubclusterDefs.forEach(sc => {
          allSubclusterDefs.set(sc.id, sc);
        });

        // Helper to register (with definition)
        const ensureSubclusterDef = (id, name, parent) => {
          if (!allSubclusterDefs.has(id)) {
            allSubclusterDefs.set(id, { id, name: name.toUpperCase(), type: 'Subcluster', group: 'subcategory', val: 15, isCategory: true, parent });
          }
        };

        // Add definitions for all pre-computed IDs
        allPossibleSubclusterIds.forEach(id => {
          if (!allSubclusterDefs.has(id)) {
            // Infer parent from ID pattern
            let parent = 'cat-memory';
            let label = id;
            if (id.startsWith('subcat-mem-')) { parent = 'cat-memory'; label = id.replace('subcat-mem-', '') + ' Memory'; }
            else if (id.startsWith('subcat-agent-')) { parent = 'cat-agent'; label = id.replace('subcat-agent-', '') + ' Agents'; }
            else if (id.startsWith('subcat-exec-')) { parent = 'cat-execution'; label = id.replace('subcat-exec-', '') + ' Pipeline'; }
            else if (id.startsWith('subcat-know-')) { parent = 'cat-knowledge'; label = id.replace('subcat-know-', '') + ' Knowledge'; }
            ensureSubclusterDef(id, label, parent);
          }
        });

        // ====================================================================
        // PHASE 2: Build nodes — ALL nodes are created BEFORE any links
        // ====================================================================

        // 2a. Central Node (Constitution 23: Central node is Supabase / MAEF Kernel)
        nodes.push({ id: 'core-maef', name: 'SUPABASE KERNEL', type: 'Core', group: 'core', val: 50, color: '#ffffff', isCategory: true, fx: 0, fy: 0 });

        // 2b. Primary Clusters (Constitution 23 Semantic Clustering)
        const primaryClusters = [
          { id: 'cat-memory', name: 'Memory Cluster', color: '#16a34a' },
          { id: 'cat-agent', name: 'Agent Cluster', color: '#ca8a04' },
          { id: 'cat-execution', name: 'Execution Cluster', color: '#0284c7' },
          { id: 'cat-knowledge', name: 'Knowledge Cluster', color: '#9333ea' },
          { id: 'cat-telemetry', name: 'Activity / Telemetry Cluster', color: '#38bdf8' }
        ];

        primaryClusters.forEach(cluster => {
          nodes.push({ id: cluster.id, name: cluster.name, type: 'Category', group: 'category', color: cluster.color, val: 26, isCategory: true });
        });

        // 2c. All Subclusters (static + dynamic pre-computed)
        allSubclusterDefs.forEach(def => {
          nodes.push({ ...def });
        });

        // 2d. Pipeline Services
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
        });

        // 2e. Data Nodes — memories (Constitution 23: Green, or Red for conflicts)
        memories.forEach(m => {
          const type = mapLegacyName(m.metadata?.type || m.metadata?.category || 'User');
          const subcatId = `subcat-mem-${type.toLowerCase()}`;
          const hits = m.memory_hits || 0;
          const causalLinks = m.causal_links || [];
          let relationsCount = causalLinks.length;
          const sourceChatId = m.metadata?.chat_id || m.metadata?.source_id;
          const sourceDocId = m.metadata?.document_id;
          if (sourceChatId) relationsCount++;
          if (sourceDocId) relationsCount++;

          const isConflict = m.status === 'CONFLICT_PENDING_REVIEW' || m.metadata?.status === 'CONFLICT_PENDING_REVIEW';
          // Constitution 23: Green for memory, Red for conflicts
          const memColor = isConflict ? '#ef4444' : '#22c55e';

          nodes.push({
            id: `mem-${m.id}`,
            name: m.summary || 'Memory',
            type: 'Memory',
            group: 'memory',
            isConflict,
            val: isConflict ? 14 : Math.max(3, Math.min(25, 3 + hits * 2)),
            color: memColor,
            data: { created: m.created_at, used: hits, relations: relationsCount, status: m.status, metadata: m.metadata || {} }
          });
        });

        // 2f. Data Nodes — documents (Constitution 23: Purple for RAG)
        documents.forEach(d => {
          const type = mapLegacyName(d.metadata?.file_type || d.metadata?.type || 'Docs');
          const subcatId = `subcat-know-${type.toLowerCase()}`;
          const chunkCount = docChunkCounts[d.id] || 0;
          nodes.push({
            id: `doc-${d.id}`,
            name: d.title || 'Document',
            type: 'Document',
            group: 'rag',
            val: Math.max(3, Math.min(25, 3 + chunkCount * 0.5)),
            color: '#a855f7', // Constitution 23: Purple for RAG Knowledge
            data: { created: d.created_at, used: 'N/A', relations: chunkCount, metadata: d.metadata || {} }
          });
        });

        // 2g. Data Nodes — chats (Constitution 23: Yellow for Conversations)
        chats.forEach(c => {
          const type = mapLegacyName(c.workspace_type || 'Sub');
          const subcatId = `subcat-agent-${type.toLowerCase()}`;
          nodes.push({
            id: `chat-${c.id}`,
            name: c.title || 'Chat',
            type: 'Conversation',
            group: 'chat',
            val: 8,
            color: '#eab308', // Constitution 23: Yellow for Conversation
            data: { created: c.created_at, used: 1, source: c.workspace_type, relations: 1 }
          });
        });

        // ====================================================================
        // PHASE 3: Build links — ALL nodes exist, so safeLink will never skip
        // ====================================================================

        // 3a. Primary Cluster → Core
        primaryClusters.forEach(cluster => {
          safeLink(links, nodes, cluster.id, 'core-maef');
        });

        // 3b. Subcluster → Parent
        allSubclusterDefs.forEach(def => {
          safeLink(links, nodes, def.id, def.parent);
        });

        // 3c. Pipeline Services → Core + Telemetry
        pipelineServices.forEach(service => {
          const status = vitals[service.statusKey] || 'UNKNOWN';
          const linkColor = (status === 'HEALTHY') ? '#22c55e' : (status === 'DEGRADED' ? '#eab308' : '#ef4444');
          const linkWidth = (status === 'HEALTHY') ? 2 : 0.8;
          safeLink(links, nodes, service.id, 'core-maef', { color: linkColor, width: linkWidth, isPipelineLink: true });
          safeLink(links, nodes, service.id, 'cat-telemetry');
        });

        // 3d. Memory → Subcluster + causal links
        memories.forEach(m => {
          const type = mapLegacyName(m.metadata?.type || m.metadata?.category || 'User');
          const subcatId = `subcat-mem-${type.toLowerCase()}`;
          const hits = m.memory_hits || 0;
          const causalLinks = m.causal_links || [];
          let relationsCount = causalLinks.length;
          const sourceChatId = m.metadata?.chat_id || m.metadata?.source_id;
          const sourceDocId = m.metadata?.document_id;
          if (sourceChatId) relationsCount++;
          if (sourceDocId) relationsCount++;

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

        // 3e. Document → Subcluster
        documents.forEach(d => {
          const type = mapLegacyName(d.metadata?.file_type || d.metadata?.type || 'Docs');
          const subcatId = `subcat-know-${type.toLowerCase()}`;
          const chunkCount = docChunkCounts[d.id] || 0;
          if (chunkCount > 0) {
            safeLink(links, nodes, `doc-${d.id}`, subcatId);
          }
        });

        // 3f. Chat → Subcluster
        chats.forEach(c => {
          const type = mapLegacyName(c.workspace_type || 'Sub');
          const subcatId = `subcat-agent-${type.toLowerCase()}`;
          safeLink(links, nodes, `chat-${c.id}`, subcatId);
        });

        // ---- STATS ----
        const orphanCount = nodes.filter(n => !n.isCategory && n.data && n.data.relations === 0).length;
        const totalDataNodes = nodes.filter(n => !n.isCategory && n.data).length;
        const connectedCount = totalDataNodes - orphanCount;
        const memoryConflicts = memories.filter(m => m.status === 'CONFLICT_PENDING_REVIEW').length;

        setStats({
          memories: memories.length,
          documents: documents.length,
          chats: chats.length,
          orphans: orphanCount,
          connected: connectedCount,
          memoryConflicts
        });

        // ---- Execution Trace ----
        let activeTraceId = selectedNode?.data?.trace_id || selectedNode?.data?.metadata?.trace_id;
        if (!activeTraceId) {
          // Auto-load latest trace from agent_logs or verificationItems on initial render (0 Token, realtime DB read)
          const latestAgentWithTrace = agentLogs.find(l => l.metadata?.trace_id || l.metadata?.traceId);
          const latestVerWithTrace = verificationItems.find(v => v.metadata?.trace_id || v.metadata?.traceId);
          activeTraceId = latestAgentWithTrace?.metadata?.trace_id ||
                          latestAgentWithTrace?.metadata?.traceId ||
                          latestVerWithTrace?.metadata?.trace_id ||
                          latestVerWithTrace?.metadata?.traceId ||
                          null;
        }
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

