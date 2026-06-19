import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 1. TRUTH JUSTIFICATION ENGINE & CAUSAL REASONING
async function evaluateCausalTruth(memA: any, memB: any, groqKey: string) {
    if (!groqKey) {
        return { isContradiction: false, action: "KEEP_BOTH", justification: "No LLM key provided for causal reasoning." };
    }
    try {
        const prompt = `Analyze these two memory entries for causal consistency and truth alignment.
Memory A (Age: ${Math.floor((Date.now() - new Date(memA.created_at).getTime())/(1000*60*60*24))} days): "${memA.summary}"
Memory B (Age: ${Math.floor((Date.now() - new Date(memB.created_at).getTime())/(1000*60*60*24))} days): "${memB.summary}"

Determine if they are causally consistent or contradicting.
DO NOT use simple scoring. Provide a step-by-step reasoning chain explaining WHY one is more logically sound, or if they should be merged.
Respond ONLY in JSON format:
{
  "isContradiction": boolean,
  "action": "KEEP_A" | "KEEP_B" | "MERGE" | "MARK_CONFLICTED",
  "resolution_reasoning": "Explain WHY based on causality, not confidence score.",
  "justification_chain": "Step 1: ..., Step 2: ..., Step 3: ...",
  "memory_type": "FACT" | "PREFERENCE" | "INTERPRETATION" | "DERIVED" | "CONFLICTED",
  "rewrittenFact": "Canonical fact if merged, else null",
  "causal_link_type": "CAUSED_BY" | "RESULT_OF" | "SUPPORTS" | "CONTRADICTS"
}`;
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3-8b-8192',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' }
            })
        });
        const result = await response.json();
        return JSON.parse(result.choices[0].message.content);
    } catch (e) {
        console.error("Causal Evaluator API Failed", e);
        return { isContradiction: false, action: "KEEP_BOTH", justification: "API Failure" };
    }
}

export const runSelfHealingLoopAsync = async (userId: string, supabaseUrl: string, supabaseKey: string, groqKey: string = '') => {
    try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        const cognitive_trace_id = `CT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        console.log(`[COGNITIVE_LOOP_START] TraceID: ${cognitive_trace_id} - User: ${userId}`);

        // Causal Graph limits: fetch recent and highly accessed active memories
        const { data: memories } = await supabase.from('user_memories')
            .select('id, summary, confidence, memory_type, created_at, embedding, belief_strength, truth_score, last_healed_at')
            .eq('user_id', userId)
            .eq('is_deprecated', false) 
            .order('created_at', { ascending: false })
            .limit(20);
            
        if (!memories || memories.length < 2) return;

        const mergeQueue = [];
        const stateUpdates = new Map();

        for (let i = 0; i < memories.length; i++) {
            for (let j = i + 1; j < memories.length; j++) {
                const memA = memories[i];
                const memB = memories[j];
                
                if (stateUpdates.has(memA.id) || stateUpdates.has(memB.id)) continue;
                
                // GUARDRAIL: Healing Cooldown Window (10 minutes)
                const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
                if (memA.last_healed_at && new Date(memA.last_healed_at) > tenMinsAgo) continue;
                if (memB.last_healed_at && new Date(memB.last_healed_at) > tenMinsAgo) continue;
                
                const similarity = (memA.embedding && memB.embedding) ? cosineSimilarity(memA.embedding, memB.embedding) : 0.85; 
                
                if (similarity > 0.75) {
                    // CONTRADICTION RESOLUTION ENGINE v2
                    const evaluation = await evaluateCausalTruth(memA, memB, groqKey);
                    
                    if (evaluation.isContradiction) {
                        
                        if (evaluation.action === 'MARK_CONFLICTED' || !evaluation.justification_chain || evaluation.justification_chain.length < 10) {
                            stateUpdates.set(memA.id, { memory_state: 'CONFLICTED', memory_type: 'CONFLICTED', justification_chain: 'Awaiting deeper reasoning.', last_healed_at: new Date().toISOString() });
                            stateUpdates.set(memB.id, { memory_state: 'CONFLICTED', memory_type: 'CONFLICTED', justification_chain: 'Awaiting deeper reasoning.', last_healed_at: new Date().toISOString() });
                            continue;
                        }

                        // FULLY JUSTIFIED REWRITE / MERGE
                        if (evaluation.action === 'MERGE' && evaluation.rewrittenFact) {
                            stateUpdates.set(memA.id, { memory_state: 'OBSOLETE', is_deprecated: true, causal_links: [`MERGED_INTO_NEW`], last_healed_at: new Date().toISOString() });
                            stateUpdates.set(memB.id, { memory_state: 'OBSOLETE', is_deprecated: true, causal_links: [`MERGED_INTO_NEW`], last_healed_at: new Date().toISOString() });
                            
                            mergeQueue.push({
                                user_id: userId,
                                summary: evaluation.rewrittenFact,
                                memory_type: evaluation.memory_type || 'DERIVED',
                                memory_state: 'MERGED',
                                confidence: Math.max(memA.confidence, memB.confidence),
                                truth_verification_score: 1.0, 
                                belief_stability_score: 1.0,
                                reasoning_depth_score: 0.9,
                                justification_chain: evaluation.justification_chain,
                                evidence_sources: ['MEMORY_CLUSTER', 'CAUSAL_LLM'],
                                causal_links: [`${evaluation.causal_link_type}_${memA.id}`, `${evaluation.causal_link_type}_${memB.id}`],
                                source: 'level5_reasoning_engine',
                                merged_from_ids: [memA.id, memB.id],
                                rewrite_reason: evaluation.resolution_reasoning,
                                message_hash: `causal_${memA.id}_${memB.id}_${Date.now()}`,
                                healing_version: 1,
                                last_healed_at: new Date().toISOString(),
                                healing_confidence_score: 1.0
                            });
                        } else if (evaluation.action === 'KEEP_A') {
                            stateUpdates.set(memB.id, { memory_state: 'OBSOLETE', is_deprecated: true, justification_chain: evaluation.justification_chain, causal_links: [`CONTRADICTED_BY_${memA.id}`], last_healed_at: new Date().toISOString() });
                            stateUpdates.set(memA.id, { memory_state: 'STABILIZED', reasoning_depth_score: 0.8, justification_chain: evaluation.justification_chain, healing_version: (memA.healing_version || 0) + 1, last_healed_at: new Date().toISOString(), healing_confidence_score: 0.9 });
                        } else if (evaluation.action === 'KEEP_B') {
                            stateUpdates.set(memA.id, { memory_state: 'OBSOLETE', is_deprecated: true, justification_chain: evaluation.justification_chain, causal_links: [`CONTRADICTED_BY_${memB.id}`], last_healed_at: new Date().toISOString() });
                            stateUpdates.set(memB.id, { memory_state: 'STABILIZED', reasoning_depth_score: 0.8, justification_chain: evaluation.justification_chain, healing_version: (memB.healing_version || 0) + 1, last_healed_at: new Date().toISOString(), healing_confidence_score: 0.9 });
                        }
                    }
                }
            }
        }

        // ASYNC TRUTH AUDIT EXECUTION
        const updates = Array.from(stateUpdates.entries()).map(([id, data]) => ({ id, ...data }));
        for (const update of updates) {
            await supabase.from('user_memories').update(update).eq('id', update.id);
        }

        if (mergeQueue.length > 0) {
            await supabase.from('user_memories').insert(mergeQueue);
            console.log(`[LEVEL 5 - CAUSAL REASONING] TraceID: ${cognitive_trace_id} - Executed ${mergeQueue.length} justified memory rewrites.`);
        } else if (updates.length > 0) {
            console.log(`[LEVEL 5 - COGNITIVE AUDIT] TraceID: ${cognitive_trace_id} - Updated ${updates.length} state machines without rewrite.`);
        } else {
            console.log(`[LEVEL 5 - COGNITIVE AUDIT] TraceID: ${cognitive_trace_id} - No contradictory overlaps detected.`);
        }

    } catch (e) {
        console.error('[CAUSAL-ENGINE-ERROR]', e);
    }
};
