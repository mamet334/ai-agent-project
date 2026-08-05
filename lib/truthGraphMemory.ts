/**
 * Truth Graph Memory Layer (TGML)
 * Stores and connects knowledge nodes purely as a structured graph.
 * RULES:
 * - NO decision making allowed.
 * - Only stores and connects knowledge.
 * - Does not decide what is true.
 */

export interface GraphNode {
  id: string;
  fact: any;
  weight: number;
}

export interface GraphEdge {
  source_id: string;
  target_id: string;
  relationType: 'SUPPORTS' | 'CONTRADICTS' | 'RELATES' | 'EVOLVES_TO';
}

export interface TruthGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

// In-memory representation of the Truth Graph for deterministic execution
const memoryGraph: TruthGraph = {
  nodes: new Map(),
  edges: []
};

export const LEGACY_COGNITION_ENABLED = false;

export function createNode(id: string, fact: any): GraphNode {
  if (!LEGACY_COGNITION_ENABLED) return { id, fact, weight: 0 };
  const node: GraphNode = { id, fact, weight: 0 };
  memoryGraph.nodes.set(id, node);
  return node;
}

export function addEdge(source_id: string, target_id: string, relationType: 'SUPPORTS' | 'CONTRADICTS' | 'RELATES' | 'EVOLVES_TO'): GraphEdge {
  if (!LEGACY_COGNITION_ENABLED) return { source_id, target_id, relationType };
  const edge: GraphEdge = { source_id, target_id, relationType };
  memoryGraph.edges.push(edge);
  return edge;
}

export function computeNodeWeight(node_id: string, truth_score: number, recency_timestamp: number, confidence: number): number {
  if (!LEGACY_COGNITION_ENABLED) return 0;
  const node = memoryGraph.nodes.get(node_id);
  if (!node) return 0;

  // Purely structural weight representation, not for decision making
  const now = Date.now();
  const age_ms = now - recency_timestamp;
  const recency_factor = age_ms < 86400000 ? 1.0 : (86400000 / Math.max(1, age_ms)); 

  const weight = (truth_score * 0.5) + (confidence * 0.3) + (recency_factor * 0.2);
  node.weight = Number(weight.toFixed(3));
  return node.weight;
}

export function detectConflictEdges(): GraphEdge[] {
  if (!LEGACY_COGNITION_ENABLED) return [];
  // Returns all structural contradictions without resolving them
  return memoryGraph.edges.filter(edge => edge.relationType === 'CONTRADICTS');
}

export function traverseTruthGraph(query_source_id: string, max_depth: number = 2): GraphNode[] {
  if (!LEGACY_COGNITION_ENABLED) return [];
  const visited = new Set<string>();
  const result: GraphNode[] = [];
  
  function traverse(current_id: string, depth: number) {
    if (depth > max_depth || visited.has(current_id)) return;
    visited.add(current_id);
    
    const node = memoryGraph.nodes.get(current_id);
    if (node) result.push(node);

    // Find immediate neighbors structurally
    const neighbors = memoryGraph.edges
      .filter(e => e.source_id === current_id || e.target_id === current_id)
      .map(e => e.source_id === current_id ? e.target_id : e.source_id);

    for (const neighbor_id of neighbors) {
      traverse(neighbor_id, depth + 1);
    }
  }

  traverse(query_source_id, 0);
  return result;
}

export function getFullGraph() {
  if (!LEGACY_COGNITION_ENABLED) return { nodes: new Map(), edges: [] };
  return memoryGraph;
}
