export interface MemoryResult {
  value: string;
  truth_score: number;
  created_at: string;
  semantic_identity?: string;
  [key: string]: any;
}

export interface IntentSpec {
  intent_type: string;
  [key: string]: any;
}

export interface UnifierInput {
  user_input: string;
  intent: IntentSpec | null;
  memory_results: MemoryResult[];
  language_agent_output?: any;
  ui_language_agent_active: boolean;
}

export interface FinalContext {
  intent: string;
  memory: MemoryResult | null;
  latent_memories: MemoryResult[];
  language_enhancement?: any;
  confidence_score: number;
  response_mode: "direct" | "enhanced_language";
}

/**
 * Context Unifier Layer v1
 * Unifies outputs from Intent Layer, Memory System, and Language Sub-Agent
 * into ONE FINAL DECISION CONTEXT.
 */
export function unifyContext(input: UnifierInput): FinalContext {
  // STEP 1: PRIORITIZE INTENT
  // Intent is always the controller
  const primary_context = input.intent?.intent_type || "DEFAULT_INTENT";

  // STEP 2 & 4: ATTACH MEMORY & CONFLICT RESOLUTION
  let active_memory: MemoryResult | null = null;
  let latent_memories: MemoryResult[] = [];
  let confidence_score = 1.0;

  if (input.memory_results && input.memory_results.length > 0) {
    // Sort memories by truth_score DESC, then by created_at DESC (recency)
    const sortedMemories = [...input.memory_results].sort((a, b) => {
      if (b.truth_score !== a.truth_score) {
        return b.truth_score - a.truth_score;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Highest truth_score as ACTIVE (NO String Merging)
    active_memory = sortedMemories[0];
    
    // Conflicting or older truths become latent
    latent_memories = sortedMemories.slice(1);
    
    // Represent baseline confidence derived from top memory
    confidence_score = active_memory.truth_score > 0 ? active_memory.truth_score : 1.0;
  }

  // STEP 3: OPTIONAL LANGUAGE LAYER
  let language_enhancement = undefined;
  let response_mode: "direct" | "enhanced_language" = "direct";

  if (input.ui_language_agent_active === true && input.language_agent_output) {
    // LANGUAGE is only stylistic enhancement. It NEVER overrides memory truth.
    language_enhancement = input.language_agent_output;
    response_mode = "enhanced_language";
  }

  // Generate FINAL CONTEXT OBJECT
  const finalContext: FinalContext = {
    intent: primary_context,
    memory: active_memory,
    latent_memories: latent_memories,
    confidence_score: confidence_score,
    response_mode: response_mode
  };

  if (language_enhancement) {
    finalContext.language_enhancement = language_enhancement;
  }

  return finalContext;
}
