/**
 * Memory Governor
 * RESPONSIBILITY: ONLY filter and rank memory relevance.
 * NO final decision authority. NO prompt building.
 */

export function filterAndRankMemory(memory_results: any[]): any[] {
  if (!memory_results || memory_results.length === 0) return [];

  // 1. FILTERING: Strip out pure noise (truth_score < 0.3)
  const filtered = memory_results.filter(m => (m.truth_score || 0) >= 0.3);

  // 2. RANKING: Purely by Truth Score > Recency > Confidence
  // This serves as the SINGLE source of truth ranking for the entire pipeline
  return filtered.sort((a, b) => {
    const scoreA = a.truth_score || 0;
    const scoreB = b.truth_score || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    if (timeA !== timeB) return timeB - timeA;
    
    return (b.confidence || 0) - (a.confidence || 0);
  });
}
