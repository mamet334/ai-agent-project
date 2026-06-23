import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { parseCognitiveIntent, bindCognitiveExecution } from '../lib/context_optimizer.ts';
import { compressCognitiveContext } from './context_compressor.ts';

// Helper to log audits asynchronously
const logMemoryAudit = (supabaseUrl, supabaseKey, payload) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    supabase.from('memory_audit_logs').insert([payload]).then(({error}) => {
      if (error) console.error("Audit log insert error:", error);
    });
  } catch(e) {
    console.error("Audit log setup error:", e);
  }
};

export const saveFactDirectly = async (
  payload: { user_id: string, content: string, memory_type: string, confidence: number, source: string, memory_state?: string }, 
  supabaseUrl: string, 
  supabaseKey: string
) => {
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[V1_CLEAN_INGESTION] Menerima structured payload:', payload);

  // 1. INSERT DATA
  const { data: insertData, error: insertError } = await supabase.from('user_memories').insert([{ 
    user_id: payload.user_id, 
    summary: payload.content, 
    memory_type: payload.memory_type,
    confidence: payload.confidence,
    source: payload.source,
    memory_state: payload.memory_state || 'ACTIVE',
    embedding: null
  }]).select('id').single();

  // RULE BARU: IF INSERT FAIL -> THROW ERROR (NO SILENT FAIL)
  if (insertError) {
    console.error('[V1_CLEAN_INGESTION_ERROR] Insert gagal:', insertError);
    throw new Error(`DB Write Failed: ${insertError.message}`);
  }

  // 2. EXPLICIT SELECT CONFIRM (WRITE GUARANTEE CONTRACT)
  const { data: confirmData, error: confirmError } = await supabase
    .from('user_memories')
    .select('id, summary, memory_type')
    .eq('id', insertData.id)
    .single();

  if (confirmError || !confirmData) {
    console.error('[V1_CLEAN_INGESTION_ERROR] Verify/Select gagal:', confirmError);
    throw new Error(`DB Write Verification Failed: ${confirmError?.message || 'Data missing'}`);
  }

  console.log('[V1_CLEAN_INGESTION_SUCCESS] Berhasil simpan & terverifikasi:', confirmData);
  return confirmData;
};

export const MEMORY_V2_ENABLED = Deno.env.get('MEMORY_V2_ENABLED') === 'true';

export const retrieveMemoriesV2 = async (userPrompt, userId, supabaseUrl, supabaseKey) => {
  const startTime = Date.now();
  if (!userId || userPrompt.trim().length < 4) return [];

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[COST LEAK DETECTION] memoryFetchCount: 1 (V2 Subgraph)');
    
    // 1. PIPELINE: Intent Filter (Control Plane)
    const intentSpec = parseCognitiveIntent(userPrompt);
    const contract = bindCognitiveExecution(intentSpec);
    
    const promptLower = userPrompt.toLowerCase();
    const keywords = promptLower.split(/[\s\p{P}]+/).filter(w => w.length > 3);
    
    // 2. PIPELINE: Graph Traversal (Execution Engine)
    const { data: subgraph, error } = await supabase.rpc('extract_cognitive_subgraph', {
      p_user_id: userId,
      p_keywords: keywords,
      p_intent_mode: intentSpec.intent_mode,
      p_max_nodes: contract.max_nodes,
      p_max_edges: contract.max_edges,
      p_traversal_depth: contract.graph_traversal_depth
    });
    
    if (error) throw error;
    
    console.log('[MEMORY_V2_STATS]', subgraph.stats);
    
    if (!subgraph.nodes || subgraph.nodes.length === 0) return [];
    
    // 3. PIPELINE: Context Compression (Deterministic & Synthesized)
    const compressedContext = await compressCognitiveContext({
      intent: intentSpec,
      nodes: subgraph.nodes,
      edges: subgraph.edges,
      query: userPrompt
    });

    console.log('[MEMORY_V2_COMPRESSION_STATS]', {
      token_before: compressedContext.token_before,
      token_after: compressedContext.token_after,
      confidence_score: compressedContext.confidence_score
    });

    const finalMemoryObject = {
      id: compressedContext.source_nodes[0] || 'compressed-memory-root',
      type: 'memory',
      content: compressedContext.compressed_summary + (compressedContext.emotional_context.length > 0 ? '\n\n[EMOTIONAL CONTEXT: ' + compressedContext.emotional_context.join(', ') + ']' : ''),
      score: compressedContext.confidence_score * 10,
      timestamp: new Date().toISOString(),
      is_root: true,
      is_compressed_context: true,
      metadata: { source_nodes: compressedContext.source_nodes }
    };
    
    // Asynchronous hit tracker
    if (compressedContext.source_nodes.length > 0) {
       supabase.rpc('update_memory_stats', { memory_ids: compressedContext.source_nodes }).catch(() => {});
    }
    
    return [finalMemoryObject];
  } catch (e) {
    console.error('[MEMORY_V2_ERROR] Fallback triggered', e);
    return null; // Null indicates failure, triggering fallback to V1
  }
};

export const retrieveMemories = async (userPrompt, userId, supabaseUrl, supabaseKey) => {
  // FEATURE FLAG & FALLBACK MECHANISM
  if (MEMORY_V2_ENABLED) {
     const v2Result = await retrieveMemoriesV2(userPrompt, userId, supabaseUrl, supabaseKey);
     if (v2Result !== null) {
         return v2Result; 
     }
  }

  const startTime = Date.now();
  if (!userId || userPrompt.trim().length < 4) {
     logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_failed', status: 'FAILED', reason: 'query_too_short', query: userPrompt, execution_time_ms: Date.now() - startTime });
     return [];
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[COST LEAK DETECTION] memoryFetchCount: 1');
    const promptLower = userPrompt.toLowerCase();
    const isTemporalQuery = ['sebelum', 'dulu', 'pernah', 'awal', 'terakhir'].some(w => promptLower.includes(w));
    const dbLimit = isTemporalQuery ? 50 : 15;
    
    // Safe select to avoid missing column PostgREST errors (PGRST204)
    let { data, error } = await supabase.from('user_memories').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(dbLimit);
    
    if (error) {
       console.error('[MEMORY_RETRIEVAL_ERROR] DB Query failed:', error);
       return [];
    }
    
    if (!data || data.length === 0) return [];
    
    // Filter out Level 5 deprecated memories safely
    data = data.filter(d => d.is_deprecated !== true);
    
    // Lightweight Scoring System (NO AI)
    const keywords = promptLower.split(/[\s\p{P}]+/).filter(w => w.length > 3);
    
    // Deduplikasi berdasar isi teks
    const uniqueMemoriesMap = new Map();
    for (const d of data) {
       if (!uniqueMemoriesMap.has(d.summary.toLowerCase())) {
          uniqueMemoriesMap.set(d.summary.toLowerCase(), d);
       }
    }
    const uniqueMemories = Array.from(uniqueMemoriesMap.values());
    
    const scoredMemories = uniqueMemories.map((mem, index) => {
       let score = 0;
       const memLower = mem.summary.toLowerCase();
       
       // Exact match (+5)
       if (promptLower.includes(memLower) || memLower.includes(promptLower)) {
          score += 5;
       }
       
       // Keyword match (+2 per keyword)
       for (const kw of keywords) {
          if (memLower.includes(kw)) score += 2;
       }
       
       // Recent memory (+1) - index 0 is most recent
       if (index < 3) score += 1;
       
       const relevanceScore = score;
       const confidenceScore = mem.confidence || 1.0;
       const ageDays = (Date.now() - new Date(mem.created_at).getTime()) / (1000 * 60 * 60 * 24);
       let recencyScore = Math.max(0, 100 - (ageDays * 2));
       const frequencyScore = Math.min(100, (mem.memory_hits || 0) * 10);
       
       // STRICT COGNITIVE STATE ENFORCEMENT
       let stateModifier = 0;
       if (mem.memory_state === 'STABILIZED') stateModifier = 15.0;
       else if (mem.memory_state === 'CONFLICTED') stateModifier = -20.0;
       else if (mem.memory_state === 'HISTORICAL') stateModifier = isTemporalQuery ? 20.0 : -10.0; // Boost historical for temporal queries

       if (isTemporalQuery) {
           recencyScore = Math.min(100, ageDays * 2); // Reverse decay: older is better
       }
       
       const cognitiveDepth = (mem.reasoning_depth_score || 0) * 10.0;
       const truthVerification = (mem.truth_verification_score || 0) * 10.0;

       // DETERMINISTIC FORMULA: Gabungan relevansi, kepercayaan, kemutakhiran, frekuensi, dan evaluasi kognitif yang direstui Level 5
       const finalScore = (relevanceScore * 0.4) + (confidenceScore * 30.0) + (recencyScore * 0.2) + (frequencyScore * 0.1) + stateModifier + cognitiveDepth + truthVerification;
       
       return { ...mem, score: finalScore, decayScore: recencyScore, frequencyScore, finalScore };
    });
    
    // Sort by score (descending) and take dynamic top K
    scoredMemories.sort((a, b) => b.score - a.score);
    
    // DYNAMIC TOP-K
    let dynamicTopK = 5;
    if (isTemporalQuery) dynamicTopK = 10;
    else if (['suka', 'favorit', 'makanan', 'minuman'].some(w => promptLower.includes(w))) dynamicTopK = 8;
    else if (['tinggal', 'dimana', 'lokasi'].some(w => promptLower.includes(w))) dynamicTopK = 3;

    const topMemories = scoredMemories.slice(0, dynamicTopK);
    
    // No legacy score===0 fallback anymore. Adaptive formula guarantees >0 score for any valid memory.
    
    let currentLen = 0;
    const finalMemories = [];
    for (const d of topMemories) {
      // STRICT SCORING GATE ENFORCEMENT: No score = no entry
      if (typeof d.finalScore !== 'number' || isNaN(d.finalScore)) continue;
      
      let enrichedContent = d.summary;
      if (d.memory_state === 'STABILIZED' && d.justification_chain) {
          enrichedContent += ` [Verified Fact: ${d.justification_chain}]`;
      } else if (d.memory_state === 'CONFLICTED') {
          enrichedContent += ` [Warning: Unresolved conflicting facts detected. Use with caution.]`;
      }
      
      finalMemories.push({ 
         id: d.id,
         type: 'memory', 
         content: enrichedContent, 
         score: d.finalScore,
         timestamp: d.created_at,
         decayScore: d.decayScore,
         frequencyScore: d.frequencyScore,
         finalScore: d.finalScore
      });
      currentLen += d.summary.length;
    }
    
    // Asynchronously update memory_hits to ensure adaptive consistency on next retrieval
    if (finalMemories.length > 0) {
       const memoryIds = finalMemories.map(m => m.id).filter(id => id);
       if (memoryIds.length > 0) {
           supabase.rpc('update_memory_stats', { memory_ids: memoryIds })
             .then(({error}) => { if (error) console.error("Update memory stats error:", error) })
             .catch(e => console.error("Update memory stats exception:", e));
       }
    }
    
    const latencyMs = Date.now() - startTime;
    
    // DETECT INTENT UNTUK REPORTING/LOOKUP (Rule-based)
    if (promptLower.includes('deadline')) {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'deadline_lookup', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    } else if (promptLower.includes('tugas')) {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'task_lookup', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    } else if (promptLower.includes('laporan')) {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'report_generation', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    } else {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_success', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    }
    
    return finalMemories;
  } catch (e) {
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_failed', status: 'FAILED', reason: e.message, query: userPrompt, execution_time_ms: Date.now() - startTime });
    return [];
  }
};

// (Dihapus: Logika lama processAndSaveMemory, extractStructuredMemory, idempotency, applyUserCorrection)
