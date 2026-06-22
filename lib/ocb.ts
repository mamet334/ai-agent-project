/**
 * Optimal Context Budgeting (OCB)
 * RESPONSIBILITY: ONLY compress and optimize token usage.
 * NO semantic decision making.
 */

export function compressContext(ranked_memories: any[], max_items: number = 3): { active: any | null, latent: any[] } {
  if (!ranked_memories || ranked_memories.length === 0) {
    return { active: null, latent: [] };
  }

  // Active truth is always the absolute top ranked node
  const active = ranked_memories[0];
  
  // Budget strictly limits the number of latent (supporting) memories to avoid token bloat
  // Ensure we fetch at least 1 item if max_items is somehow 0 or invalid
  const limit = Math.max(1, max_items);
  const latent = ranked_memories.slice(1, limit);

  return { active, latent };
}
