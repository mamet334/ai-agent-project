// =========================================================================
// MAMET AI - CONTEXT COMPRESSOR AGENT
// =========================================================================
// Architecture: Strict Separation of Concerns (Deterministic vs LLM)
// Prevents "Compression Hallucination" by establishing hard facts before
// executing inference-time cognitive synthesis.

export interface CompressContextParams {
  intent: {
    intent_mode: string;
    target_entity_types: string[];
  };
  nodes: any[];
  edges: any[];
  query: string;
  rctx?: any;
}

export interface CompressedMemoryContext {
  // Layer A: Deterministic Facts
  current_state: string[];
  important_history: string[];
  contradictions: string[];
  confidence_score: number;
  source_nodes: string[];
  token_before: number;
  token_after: number;

  // Layer B: Synthesized Cognitive Facts
  compressed_summary: string;
  emotional_context: string[];
}

/**
 * Compresses the raw memory subgraph into an efficient cognitive payload.
 */
export async function compressCognitiveContext(params: CompressContextParams): Promise<CompressedMemoryContext> {
  const { intent, nodes, edges, query, rctx } = params;

  // =========================================================================
  // LAYER A: DETERMINISTIC EXTRACTOR
  // No LLM involved here. Strictly algorithmic evaluation.
  // =========================================================================
  
  const currentState: string[] = [];
  const importantHistory: string[] = [];
  const contradictions: string[] = [];
  const sourceNodes: string[] = [];
  
  let totalConfidence = 0;
  let confidenceCount = 0;

  // 1. Trace the Relational Graph
  const overriddenNodeIds = new Set<string>();
  const contradictionsSet = new Set<string>();

  // B. CompressionGuard
  if (nodes.some(n => n.is_compressed_context === true)) {
     console.warn(`[CompressionGuard] BLOCKED: Attempting to compress an already compressed context.`);
     throw new Error("DOUBLE_COMPRESSION_BLOCKED");
  }

  // A. MemoryGraphValidator
  const validEdges = [];
  const nodeMap = new Map((nodes || []).map(n => [n.id, n]));
  for (const edge of (edges || [])) {
    if (edge.source_memory_id === edge.target_memory_id) {
      console.warn(`[MemoryGraphValidator] Blocked self-loop edge for node ${edge.source_memory_id}`);
      continue;
    }
    if (!nodeMap.has(edge.source_memory_id) || !nodeMap.has(edge.target_memory_id)) {
       console.warn(`[MemoryGraphValidator] Blocked edge with missing source/target: ${edge.source_memory_id} -> ${edge.target_memory_id}`);
       continue;
    }
    // Temporal validation hook placeholder
    if (edge.relation_type === 'OVERRIDES') {
       const srcNode = nodeMap.get(edge.source_memory_id);
       const tgtNode = nodeMap.get(edge.target_memory_id);
       if (srcNode.created_at && tgtNode.created_at && srcNode.created_at < tgtNode.created_at) {
          console.warn(`[MemoryGraphValidator] Invalid temporal order for OVERRIDES edge.`);
       }
    }
    validEdges.push(edge);
  }

  const overrideChains: string[] = [];

  for (const edge of validEdges) {
    if (edge.relation_type === 'OVERRIDES' || edge.relation_type === 'REFINES') {
      overriddenNodeIds.add(edge.target_memory_id); // The target was overridden
      overrideChains.push(`[${edge.relation_type}] Fakta ${edge.source_memory_id} menimpa/menggantikan Fakta ${edge.target_memory_id}. Alasan: ${edge.reason_type}`);
    }
    if (edge.relation_type === 'CONTRADICTS') {
      contradictionsSet.add(`Konflik antara ${edge.source_memory_id} dan ${edge.target_memory_id} (Alasan: ${edge.reason_type})`);
    }
  }

  // 2. Classify Nodes
  for (const node of (nodes || [])) {
    sourceNodes.push(node.id);
    const nodeFact = node.summary || node.content;

    // Is it active or history?
    if (overriddenNodeIds.has(node.id)) {
      importantHistory.push(`[HISTORICAL ID: ${node.id}] ${nodeFact}`);
    } else {
      currentState.push(`[ACTIVE ID: ${node.id}] ${nodeFact}`);
      
      // Calculate confidence ONLY for active facts
      if (node.score !== undefined || node.metadata?.confidence !== undefined) {
        const conf = node.score !== undefined ? node.score : (node.metadata?.confidence || 0);
        totalConfidence += conf;
        confidenceCount++;
      }
    }
  }

  contradictions.push(...Array.from(contradictionsSet));

  const confidence_score = confidenceCount > 0 ? (totalConfidence / confidenceCount) : 1.0;
  
  // Rough Token Metric Calculation
  const rawJson = JSON.stringify({ nodes, edges });
  const token_before = Math.ceil(rawJson.length / 4);

  // =========================================================================
  // LAYER B: COGNITIVE SYNTHESIS (LLM)
  // Synthesizes the deterministic facts into a query-aware context package.
  // =========================================================================
  
  let compressed_summary = "";
  let emotional_context: string[] = [];
  let token_after = 0;

  if (nodes.length > 0) {
    const systemPrompt = `Anda adalah Cognitive Memory Compressor. Tugas Anda adalah mensintesis fakta menjadi narasi pendek yang relevan dengan pertanyaan user.
ATURAN KERAS:
1. DILARANG mengarang fakta baru di luar data Current State & Historical.
2. JANGAN mengubah fakta yang bersifat absolut.
3. Gunakan bahasa Indonesia.
4. Output WAJIB berformat JSON murni tanpa backticks markdown. Format:
{
  "compressed_summary": "string: rangkuman naratif < 300 kata yang langsung menjawab atau mendukung pertanyaan",
  "emotional_context": ["string: ekstrak emosi/psikologi (GUARD: JANGAN MENEBAK PERASAAN, hanya tulis jika secara eksplisit tersirat kuat di fakta asal. Kosongkan array jika tidak ada)"]
}`;

    const userPrompt = `
[Konteks Permintaan]
Query User: "${query}"
Intent Mode: ${intent.intent_mode}

[Fakta Deterministik (JANGAN DIUBAH)]
Current State (Fakta Aktif Mutlak):
${currentState.length > 0 ? currentState.join('\n') : '-'}

Historical (Pernah Dibatalkan/Diubah):
${importantHistory.length > 0 ? importantHistory.join('\n') : '-'}

Override Chains (Jejak Perubahan Fakta):
${overrideChains.length > 0 ? overrideChains.join('\n') : '-'}

Contradictions (Konflik Data):
${contradictions.length > 0 ? contradictions.join('\n') : '-'}

Silakan lakukan Cognitive Compression berformat JSON.`;

    let success = false;
    let llmResponse = "";

    // MIGRATION: GAP-006 (Capability Adapter Integration)
    if (rctx && rctx.logger) { // Ensure CapabilityRegistry is accessible via rctx or use global
       // We import CapabilityRegistry at the top of this file
       const { CapabilityRegistry } = await import('../lib/adapters/adapter_registry.ts');
       await CapabilityRegistry.initializeAdapters(rctx);
       
       const adapters = CapabilityRegistry.getAvailableAIAdapters(['groq', 'gemini']);
       
       const adapterPayload = {
         contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
         systemInstruction: { parts: [{ text: systemPrompt }] }
       };

       for (const adapter of adapters) {
         try {
           const adapterInput = {
             promptText: userPrompt,
             systemPromptText: systemPrompt,
             chatHistory: [],
             payload: adapterPayload,
             forceDefaultModel: false,
             model: adapter.name === 'GroqAdapter' ? 'llama-3.1-8b-instant' : 'gemini-2.5-flash'
           };
           const result = await adapter.execute(adapterInput, { trace_id: rctx?.tasks?.traceId || 'unknown' });
           if (result && result.result) {
             llmResponse = result.result.replace(/```json/gi, '').replace(/```/g, '').trim();
             success = true;
             console.log(`[ContextCompressor] Succeeded via ${adapter.name}`);
             break;
           }
         } catch (e) {
           console.warn(`[ContextCompressor] Adapter ${adapter.name} failed:`, e);
         }
       }
    } else {
       console.warn("[ContextCompressor] WARNING: rctx missing, falling back to empty response.");
    }

    // JSON PARSING & SAFEGUARD
    try {
      if (success && llmResponse) {
        const parsed = JSON.parse(llmResponse);
        compressed_summary = parsed.compressed_summary || "Rangkuman tidak dapat diproses.";
        emotional_context = Array.isArray(parsed.emotional_context) ? parsed.emotional_context : [];
      } else {
        // Ultimate Fallback: Just return the raw active facts
        compressed_summary = currentState.join(' | ');
      }
    } catch (e) {
      console.warn("[ContextCompressor] JSON Parse Error on output:", llmResponse);
      compressed_summary = currentState.join(' | ');
    }

    const outputObj = { compressed_summary, emotional_context, current_state: currentState };
    token_after = Math.ceil(JSON.stringify(outputObj).length / 4);

    // C. ObservabilityLayer
    const compression_ratio = token_after > 0 ? (token_before / token_after) : 1;
    console.log(`[ObservabilityLayer] Compression Ratio: ${compression_ratio.toFixed(2)}`);
    if (compression_ratio > 3) {
      console.warn(`[ObservabilityLayer] WARNING: High compression ratio > 3`);
    }
  }

  return {
    current_state: currentState,
    important_history: importantHistory,
    contradictions,
    confidence_score,
    source_nodes: sourceNodes,
    token_before,
    token_after,
    compressed_summary,
    emotional_context
  };
}
