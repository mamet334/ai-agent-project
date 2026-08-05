import { MemoryNode } from '../types/memory';

/**
 * Recalculates truth_score for a set of memory nodes belonging to the same key.
 * Modifies nodes in-place.
 */
export function recalculateTruthScores(nodes: MemoryNode[]): void {
  if (nodes.length === 0) return;

  const now = Date.now();
  
  // Calculate consistency frequency mapping
  const identityFreq: Record<string, number> = {};
  for (const n of nodes) {
    const ident = n.semantic_identity;
    identityFreq[ident] = (identityFreq[ident] || 0) + 1;
  }
  const maxFreq = Math.max(...Object.values(identityFreq), 1);

  nodes.forEach(node => {
    // Recency (0.0 to 1.0)
    const nodeTime = new Date(node.created_at).getTime();
    const ageMs = Math.max(0, now - nodeTime);
    // Arbitrary decay max 30 days for score scaling
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const recency = Math.max(0, 1.0 - (ageMs / thirtyDays));

    // Consistency (0.0 to 1.0)
    const freq = identityFreq[node.semantic_identity];
    const consistency = freq / maxFreq;

    node.truth_score = (node.confidence * 0.5) + (recency * 0.3) + (consistency * 0.2);
  });
}
