/**
 * Decision Engine Layer
 * RESPONSIBILITY:
 * - resolve memory conflicts
 * - select active memory (truth_score DESC)
 * - merge intent + memory into final context
 * - decide response_mode
 * NO RAW TEXT PARSING ALLOWED
 */

export interface MemoryResult {
  value: string;
  truth_score: number;
  created_at: string;
  semantic_identity?: string;
  [key: string]: any;
}

export interface IntentSpec {
  intent_mode: string;
  [key: string]: any;
}

export interface PreprocessorOutput {
  semantic_intent: string;
  intent_spec: IntentSpec;
  detected_style?: string;
  [key: string]: any;
}

export interface DecisionEngineInput {
  intent_data: PreprocessorOutput;
  // memory_results are strictly trusted from Supabase, already sorted by truth_score DESC
  memory_results: MemoryResult[];
  language_agent_output?: any;
  ui_language_agent_active: boolean;
  short_term_memory?: any[];
  summary?: string;
  behavior_memory?: any;
}

export interface FinalDecisionContext {
  intent: string;
  execution_contract: CognitiveExecutionContract;
  exception_policy: SoftExceptionPolicy;
  memory: {
    active: MemoryResult | null;
    latent: MemoryResult[];
  };
  short_term: {
    messages: any[];
    summary?: string;
  };
  behavior_profile?: any;
  language_enhancement?: any;
  confidence_score: number;
  response_mode: "direct" | "enhanced_language";
}

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

export interface SoftExceptionPolicy {
  allow_overshoot_if: any;
  soft_sources: string[];
  soft_edge_inclusion: boolean;
  budget_override_cap: number;
}

/**
 * Transforms the Intent Spec into a Hard Deterministic Contract (CEBL)
 */
function buildExecutionContract(intent_mode: string): CognitiveExecutionContract {
  switch(intent_mode) {
    case 'DELTA':
      return {
        allowed_sources: ['ACTIVE_VIEW', 'RELATIONS', 'RAW_HISTORY'],
        forbidden_sources: [],
        max_nodes: 8,
        max_edges: 8,
        graph_traversal_depth: 3,
        must_include: ['ACTIVE_NODE_ONLY', 'EDGES', 'REASONS'],
        must_exclude: ['UNRELATED_BUCKETS'],
        ranking_policy: 'CAUSAL_CHAIN'
      };
    case 'PROFILE':
      return {
        allowed_sources: ['ACTIVE_VIEW', 'METADATA'],
        forbidden_sources: ['RAW_HISTORY', 'RELATIONS'],
        max_nodes: 15,
        max_edges: 0,
        graph_traversal_depth: 0,
        must_include: ['ACTIVE_NODE_ONLY', 'METADATA_TAGS'],
        must_exclude: ['OVERRIDDEN_NODES', 'EDGES'],
        ranking_policy: 'STRICT_IMPORTANCE'
      };
    case 'ANALYTIC':
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
    default:
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
}

/**
 * Builds the exception policy (CSEL)
 */
function buildExceptionPolicy(intent_mode: string): SoftExceptionPolicy {
  if (intent_mode === 'DELTA' || intent_mode === 'ANALYTIC') {
    return {
      allow_overshoot_if: { semantic_density_gain: true, missing_human_factor_risk: true },
      soft_sources: ['LOW_IMPORTANCE_NODES', 'EMOTIONAL_NUANCE'],
      soft_edge_inclusion: true,
      budget_override_cap: 1.25
    };
  }
  if (intent_mode === 'PROFILE') {
    return {
      allow_overshoot_if: { semantic_density_gain: true, missing_human_factor_risk: false },
      soft_sources: ['PERIPHERAL_PREFERENCES'],
      soft_edge_inclusion: false,
      budget_override_cap: 1.10
    };
  }
  return {
    allow_overshoot_if: { semantic_density_gain: false, missing_human_factor_risk: false },
    soft_sources: [],
    soft_edge_inclusion: false,
    budget_override_cap: 1.0
  };
}

export function buildDecisionContext(input: DecisionEngineInput): FinalDecisionContext {
  const intent_mode = input.intent_data?.intent_spec?.intent_mode || input.intent_data?.semantic_intent || "DEFAULT_INTENT";
  
  // STEP 2 & 4: MEMORY RESOLUTION
  // Trusting Supabase Single Source of Truth (already sorted by truth_score DESC)
  let active_memory: MemoryResult | null = null;
  let latent_memories: MemoryResult[] = [];
  let confidence_score = 1.0;

  if (input.memory_results && input.memory_results.length > 0) {
    active_memory = input.memory_results[0];
    latent_memories = input.memory_results.slice(1);
    confidence_score = active_memory.truth_score > 0 ? active_memory.truth_score : 1.0;
  }

  // STEP 3: OPTIONAL LANGUAGE LAYER
  let language_enhancement = undefined;
  let response_mode: "direct" | "enhanced_language" = "direct";

  if (input.ui_language_agent_active === true && input.language_agent_output) {
    language_enhancement = input.language_agent_output;
    response_mode = "enhanced_language";
  }

  // Generate FINAL CONTEXT
  const finalContext: FinalDecisionContext = {
    intent: intent_mode,
    execution_contract: buildExecutionContract(intent_mode),
    exception_policy: buildExceptionPolicy(intent_mode),
    memory: {
      active: active_memory,
      latent: latent_memories
    },
    short_term: {
      messages: input.short_term_memory || [],
      summary: input.summary
    },
    behavior_profile: input.behavior_memory,
    confidence_score: confidence_score,
    response_mode: response_mode
  };

  if (language_enhancement) {
    finalContext.language_enhancement = language_enhancement;
  }

  return finalContext;
}
