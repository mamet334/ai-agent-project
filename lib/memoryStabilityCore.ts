/**
 * Memory Governor + Cognitive Stability Core (MSC)
 * SYSTEM STABILIZER. Runs in background to maintain Truth Graph Memory Layer (TGML).
 * PURE DETERMINISTIC, NO LLM. 
 */

export interface MSCGraphState {
  nodes: any[];
  edges: any[];
}

export const LEGACY_COGNITION_ENABLED = false;

export function runMemoryStabilityCore(graph: MSCGraphState) {
  if (!LEGACY_COGNITION_ENABLED) {
    return {
      timestamp: Date.now(),
      health: { orphan_nodes: 0, overconnected_nodes: 0, circular_contradictions: 0 },
      lifecycle: { active: 0, latent: 0, archived: 0 },
      noise_filtering: { to_remove_count: 0 },
      stability_score: 1.0,
      cleanup_mode_triggered: false
    };
  }

  // STEP 1: GRAPH HEALTH CHECK
  let orphan_nodes = 0;
  let overconnected_nodes = 0;
  let circular_contradictions = 0;

  const nodeMap = new Map();
  (graph.nodes || []).forEach(n => nodeMap.set(n.id, { ...n, edge_count: 0 }));

  (graph.edges || []).forEach(e => {
    if (nodeMap.has(e.source_id)) nodeMap.get(e.source_id).edge_count++;
    if (nodeMap.has(e.target_id)) nodeMap.get(e.target_id).edge_count++;
    
    // Naive circular contradiction detection
    if (e.source_id === e.target_id && e.relationType === 'CONTRADICTS') {
      circular_contradictions++;
    }
  });

  nodeMap.forEach(n => {
    if (n.edge_count === 0) orphan_nodes++;
    if (n.edge_count > 10) overconnected_nodes++; // Over-connected threshold = 10
  });

  // STEP 2: MEMORY LIFECYCLE MANAGEMENT
  let active_count = 0;
  let latent_count = 0;
  let archived_count = 0;

  nodeMap.forEach(n => {
    const ts = n.truth_score || 0;
    // Categorize purely deterministically
    if (ts > 0.75) active_count++;
    else if (ts > 0.40) latent_count++;
    else archived_count++;
  });

  // STEP 3: NOISE FILTERING
  // Nodes < 0.3 should be tagged for removal in real pipeline
  const low_quality_nodes = (graph.nodes || []).filter(n => (n.truth_score || 0) < 0.3);

  // STEP 4: STABILITY INDEX COMPUTATION
  const total_nodes = Math.max(1, (graph.nodes || []).length);
  const integrity = 1.0 - (orphan_nodes / total_nodes);
  const conflict_density = (graph.edges || []).filter(e => e.relationType === 'CONTRADICTS').length / Math.max(1, (graph.edges || []).length);
  const distribution_balance = active_count / total_nodes; // simplistic balance

  // stability_score = weighted(graph_integrity, truth_distribution_balance, conflict_density)
  const stability_score = (integrity * 0.5) + (distribution_balance * 0.3) + ((1.0 - conflict_density) * 0.2);

  let trigger_cleanup = false;
  if (stability_score < 0.6) {
    trigger_cleanup = true; // TRIGGERS CLEANUP MODE
  }

  return {
    timestamp: Date.now(),
    health: {
      orphan_nodes,
      overconnected_nodes,
      circular_contradictions,
    },
    lifecycle: {
      active: active_count,
      latent: latent_count,
      archived: archived_count
    },
    noise_filtering: {
      to_remove_count: low_quality_nodes.length
    },
    stability_score: Number(stability_score.toFixed(3)),
    cleanup_mode_triggered: trigger_cleanup
  };
}
