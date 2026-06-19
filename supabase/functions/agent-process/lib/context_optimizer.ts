// =========================================================================
// LAYER 1: COGNITIVE INTENT PARSER (CONTROL PLANE)
// =========================================================================
// This module acts as the "Router for how LLM consumes memory".
// It prevents the context window from exploding by defining the exact cognitive
// mode the LLM needs to answer the user's query effectively.

export const INTENT_MODES = {
  STATE_QUERY: 'STATE_QUERY', // Pure factual current state
  DELTA: 'DELTA',             // Evolution & causality (Overrides Chain)
  PROFILE: 'PROFILE',         // Aggregation of preferences
  ANALYTIC: 'ANALYTIC'        // Subgraph trend analysis
};

/**
 * Parses user query to determine the cognitive compression strategy
 * @param query The raw user query
 * @returns The Intent Specification object dictating RAG behavior
 */
export function parseCognitiveIntent(query: string) {
  const lower = query.toLowerCase();

  // 1. DELTA / CHANGE QUERY MODE
  // E.g., "kenapa aku pindah kota?", "apa alasanku berubah pikiran?"
  if (/(?:kenapa|mengapa|alasan|sebab|berubah|dulu|sekarang|beda)/i.test(lower)) {
    return {
      intent_mode: INTENT_MODES.DELTA,
      target_entity_types: ['ALL'],
      requires_graph: true,
      requires_causal_chain: true,
      compression_budget: 1500,
      recency_bias: 0.5 // Balance between historical context and current state
    };
  }

  // 2. PROFILE / PREFERENCE MODE
  // E.g., "apa kesukaanku?", "favoritku apa?", "aku alergi apa?"
  if (/(?:apa kesukaanku|favorit|suka|hobi|warna|makanan|minuman|preferensi|alergi)/i.test(lower)) {
    return {
      intent_mode: INTENT_MODES.PROFILE,
      target_entity_types: ['PREFERENCE', 'ACTIVITY'],
      requires_graph: false,
      requires_causal_chain: false,
      compression_budget: 1200,
      recency_bias: 0.7 
    };
  }

  // 3. ANALYTICAL / EXPLANATION MODE
  // E.g., "apa pola hidupku?", "bagaimana rutinitasku?", "gambarkan karakterku"
  if (/(?:pola|kebiasaan|analisis|rutinitas|karakter|gaya hidup|jelaskan tentangku)/i.test(lower)) {
    return {
      intent_mode: INTENT_MODES.ANALYTIC,
      target_entity_types: ['ALL'],
      requires_graph: true,
      requires_causal_chain: false,
      compression_budget: 2000,
      recency_bias: 0.6
    };
  }

  // 4. STATE QUERY MODE (Default Fallback)
  // E.g., "di mana rumahku?", "siapa aku?", "apa pekerjaanku?"
  return {
    intent_mode: INTENT_MODES.STATE_QUERY,
    target_entity_types: ['LOCATION', 'IDENTITY', 'FACT', 'OCCUPATION', 'PROJECT', 'GOAL'],
    requires_graph: false,
    requires_causal_chain: false,
    compression_budget: 800,
    recency_bias: 1.0 // Only absolute active truth matters
  };
}

// =========================================================================
// LAYER 2: CONTEXT EXECUTION BINDING LAYER (CEBL)
// =========================================================================
// This layer transforms the "Strategic Hint" from the Intent Parser into a
// "Hard Deterministic Contract". The Subgraph Extractor MUST obey these constraints.

export interface CognitiveExecutionContract {
  allowed_sources: string[];
  forbidden_sources: string[];
  max_nodes: number;
  max_edges: number;
  graph_traversal_depth: number;
  must_include: string[];
  must_exclude: string[];
  ranking_policy: 'STRICT_RECENCY' | 'STRICT_IMPORTANCE' | 'BALANCED' | 'CAUSAL_CHAIN';
}

/**
 * Binds an intent specification to strict execution constraints.
 */
export function bindCognitiveExecution(intentSpec: any): CognitiveExecutionContract {
  if (intentSpec.intent_mode === INTENT_MODES.STATE_QUERY) {
    return {
      allowed_sources: ['ACTIVE_VIEW', 'METADATA'],
      forbidden_sources: ['RAW_HISTORY', 'RELATIONS'],
      max_nodes: 5,
      max_edges: 0,
      graph_traversal_depth: 0,
      must_include: ['ACTIVE_NODE_ONLY'],
      must_exclude: ['OVERRIDDEN_NODES', 'EDGES'],
      ranking_policy: 'STRICT_IMPORTANCE'
    };
  }

  if (intentSpec.intent_mode === INTENT_MODES.DELTA) {
    return {
      allowed_sources: ['ACTIVE_VIEW', 'RELATIONS', 'RAW_HISTORY'],
      forbidden_sources: [],
      max_nodes: 8,
      max_edges: 8,
      graph_traversal_depth: 3, // Allow deep traversal for causality
      must_include: ['ACTIVE_NODE_ONLY', 'EDGES', 'REASONS'],
      must_exclude: ['UNRELATED_BUCKETS'],
      ranking_policy: 'CAUSAL_CHAIN'
    };
  }

  if (intentSpec.intent_mode === INTENT_MODES.PROFILE) {
    return {
      allowed_sources: ['ACTIVE_VIEW', 'METADATA'],
      forbidden_sources: ['RAW_HISTORY', 'RELATIONS'],
      max_nodes: 15, // Need many preference nodes
      max_edges: 0,
      graph_traversal_depth: 0,
      must_include: ['ACTIVE_NODE_ONLY', 'METADATA_TAGS'],
      must_exclude: ['OVERRIDDEN_NODES', 'EDGES'],
      ranking_policy: 'STRICT_IMPORTANCE'
    };
  }

  // Fallback: INTENT_MODES.ANALYTIC
  return {
    allowed_sources: ['ACTIVE_VIEW', 'RELATIONS', 'METADATA', 'RAW_HISTORY'],
    forbidden_sources: [],
    max_nodes: 20,
    max_edges: 15,
    graph_traversal_depth: 2,
    must_include: ['ACTIVE_NODE_ONLY', 'METADATA_TAGS', 'EDGES'],
    must_exclude: ['NOISE_NODES'],
    ranking_policy: 'BALANCED'
  };
}

// =========================================================================
// LAYER 3: CONTROLLED SOFT EXCEPTION LAYER (CSEL)
// =========================================================================
// Adds bounded imperfection back into the deterministic execution to retain human realism and nuance.

export interface SoftExceptionPolicy {
  allow_overshoot_if: {
    semantic_density_gain: boolean;
    missing_human_factor_risk: boolean;
  };
  soft_sources: string[];
  soft_edge_inclusion: boolean;
  budget_override_cap: number; // e.g. 1.15 means allow up to 15% budget burst
}

/**
 * Builds the exception policy that allows CEBL to flex under semantic pressure.
 */
export function buildSoftExceptionPolicy(intentSpec: any): SoftExceptionPolicy {
  // If the query demands causal analysis or personality insight, we must preserve human factors
  if (intentSpec.intent_mode === INTENT_MODES.DELTA || intentSpec.intent_mode === INTENT_MODES.ANALYTIC) {
    return {
      allow_overshoot_if: {
        semantic_density_gain: true,
        missing_human_factor_risk: true
      },
      soft_sources: ['LOW_IMPORTANCE_NODES', 'EMOTIONAL_NUANCE'],
      soft_edge_inclusion: true, // Allow bringing in weak edges (COEXISTS_WITH)
      budget_override_cap: 1.25 // 25% burst allowed to capture the "why" and "how"
    };
  }

  if (intentSpec.intent_mode === INTENT_MODES.PROFILE) {
    return {
      allow_overshoot_if: {
        semantic_density_gain: true,
        missing_human_factor_risk: false
      },
      soft_sources: ['PERIPHERAL_PREFERENCES'],
      soft_edge_inclusion: false,
      budget_override_cap: 1.10
    };
  }

  // STATE_QUERY should remain purely robotic and strict. No exceptions.
  return {
    allow_overshoot_if: {
      semantic_density_gain: false,
      missing_human_factor_risk: false
    },
    soft_sources: [],
    soft_edge_inclusion: false,
    budget_override_cap: 1.0 // Strictly bound
  };
}
