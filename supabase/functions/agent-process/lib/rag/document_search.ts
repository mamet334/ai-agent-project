import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { RuntimeContext } from '../runtime_context.ts';
import { RagDocument, FormattedRagContext, RoutingDecision } from './types.ts';

export const searchDocuments = async (
  queryEmbedding: number[],
  finalMessage: string,
  effectiveRagThreshold: number,
  effectiveRagMatchCount: number,
  routingDecision: RoutingDecision,
  userId: string,
  rctx: RuntimeContext
): Promise<FormattedRagContext[]> => {
  const supabaseClient = createClient(
    rctx.env.supabaseUrl,
    rctx.env.supabaseServiceKey
  );

  const { data: matchedDocs, error: matchError } = await supabaseClient.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: effectiveRagThreshold,
    match_count: effectiveRagMatchCount,
    p_user_id: userId,
    p_space_id: routingDecision.workspace_id
  });

  if (matchError) {
    throw new Error(`RAG_DB_FAIL: ${matchError.message}`);
  }

  if (!matchedDocs || matchedDocs.length === 0) {
    return [];
  }

  // 1. DEDUPLICATION LAYER (POST-RAG)
  const calculateCosineSimilarity = (strA: string, strB: string) => {
    const getWords = (s: string) => s.toLowerCase().match(/\w+/g) || [];
    const wordsA = getWords(strA);
    const wordsB = getWords(strB);
    
    if (wordsA.length === 0 || wordsB.length === 0) return 0;

    const freqA = new Map<string, number>();
    for (const w of wordsA) freqA.set(w, (freqA.get(w) || 0) + 1);
    
    const freqB = new Map<string, number>();
    for (const w of wordsB) freqB.set(w, (freqB.get(w) || 0) + 1);

    let dotProduct = 0; let normA = 0; let normB = 0;
    
    for (const count of freqA.values()) { normA += count * count; }
    for (const [w, countB] of freqB.entries()) {
      normB += countB * countB;
      const countA = freqA.get(w) || 0;
      dotProduct += countA * countB;
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  const deduplicatedDocs: RagDocument[] = [];
  for (const doc of matchedDocs) {
    let isDuplicate = false;
    for (const savedDoc of deduplicatedDocs) {
      if (calculateCosineSimilarity(doc.content, savedDoc.content) > 0.92) {
        if ((doc.similarity || 0) > (savedDoc.similarity || 0)) {
           savedDoc.content = doc.content;
           savedDoc.similarity = doc.similarity;
        }
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) deduplicatedDocs.push(doc);
  }

  // 2. CONTEXT RE-RANKING LAYER
  const queryWords = finalMessage.toLowerCase().match(/\w+/g) || [];
  const validQueryWords = queryWords.filter((w: string) => w.length > 3);
  
  deduplicatedDocs.forEach((doc: any, idx: number) => {
    const vector_similarity = doc.similarity || 0;
    const position_weight = 1.0 - (idx / deduplicatedDocs.length);
    
    const docWordsStr = doc.content.toLowerCase();
    let matchCount = 0;
    for(const qw of validQueryWords) {
       if (docWordsStr.includes(qw)) matchCount++;
    }
    const query_coverage_score = validQueryWords.length > 0 ? Math.min(1.0, matchCount / validQueryWords.length) : 0;
    
    doc.hybrid_score = (vector_similarity * 0.7) + (position_weight * 0.2) + (query_coverage_score * 0.1);
  });

  deduplicatedDocs.sort((a: any, b: any) => b.hybrid_score - a.hybrid_score);

  return deduplicatedDocs.map((doc: any) => ({
    type: 'rag',
    content: `[Dari file "${doc.title}"]: "${doc.content}"`,
    score: doc.hybrid_score
  }));
};
