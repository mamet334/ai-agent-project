/**
 * Unified Cognition Layer (UCL)
 * Central executive brain. ONLY decides final output context based on multi-system inputs.
 * RULES:
 * - Does NOT store raw memory or graph edges.
 * - Only decides final output context.
 * - Strictly deterministic. No LLM dependency.
 */

export interface UCLInput {
  behavior_profile: any;
  truth_scoring_results: any[];
  memory_candidates: any[];
  truth_graph: {
    nodes: any[];
    conflict_edges: any[];
  };
}

export interface ExecutionPlan {
  action: string;
  priority_mode: string;
  rationale: string;
}

export interface UCLOutput {
  final_memory_state: any[];
  selected_truth: any | null;
  behavior_influence_score: number;
  decision_rationale: string;
  execution_plan?: ExecutionPlan; // Kept as optional but logic executes it
}

export function computeContextPriority(behavior_profile: any): number {
  if (!behavior_profile) return 0.5; // neutral baseline
  
  const detailed = behavior_profile.response_preference?.detailed_answer || 0.5;
  const short = behavior_profile.response_preference?.short_answer || 0.5;
  
  // High detailed preference = high context priority (deep reasoning)
  // High short preference = low context priority (fast surface execution)
  if (detailed > short) return 0.8;
  if (short > detailed) return 0.3;
  return 0.5;
}

export function resolveConflicts(candidates: any[], conflict_edges: any[]): any[] {
  // We NEVER merge conflicting strings (NO "|").
  // Conflicts are preserved as parallel truths but ranked purely by mathematical superiority.
  // Truth Score dominates, then Confidence.
  return [...candidates].sort((a, b) => {
    const scoreA = a.truth_score || 0;
    const scoreB = b.truth_score || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return (b.confidence || 0) - (a.confidence || 0);
  });
}

export function generateExecutionPlan(behavior_influence_score: number, graph_density: number): ExecutionPlan {
  let mode = "STANDARD_EXECUTION";
  if (behavior_influence_score > 0.7 && graph_density > 2) {
    mode = "DEEP_ANALYTICAL_EXECUTION";
  } else if (behavior_influence_score < 0.4) {
    mode = "FAST_DIRECT_EXECUTION";
  }

  return {
    action: "PIPELINE_HANDOFF_TO_DECISION_ENGINE",
    priority_mode: mode,
    rationale: `Selected execution mode based on behavior influence (${behavior_influence_score.toFixed(2)}) and Truth Graph density (${graph_density} nodes).`
  };
}

export function selectActiveTruth(resolved_candidates: any[]): any | null {
  if (!resolved_candidates || resolved_candidates.length === 0) return null;
  // Absolute deterministic selection: The mathematically superior node wins.
  return resolved_candidates[0];
}

export const LEGACY_COGNITION_ENABLED = false;

export function executeCognition(input: UCLInput): UCLOutput {
  if (!LEGACY_COGNITION_ENABLED) {
    return {
      final_memory_state: input.memory_candidates,
      selected_truth: input.memory_candidates?.[0] || null,
      behavior_influence_score: 0.5,
      decision_rationale: "[LEGACY DISABLED] UnifiedCognition is bypassed.",
      execution_plan: undefined
    };
  }

  // 1. Behavior integration
  const behavior_influence_score = computeContextPriority(input.behavior_profile);

  // 2. Conflict Resolution (Strict non-merging)
  const resolved_state = resolveConflicts(input.memory_candidates, input.truth_graph.conflict_edges);

  // 3. Selection of Active Truth
  const active_truth = selectActiveTruth(resolved_state);

  // 4. Plan Generation
  const execution_plan = generateExecutionPlan(behavior_influence_score, input.truth_graph.nodes.length);

  const decision_rationale = `Path Trace: Truth Graph [Nodes: ${input.truth_graph.nodes.length}, Conflicts: ${input.truth_graph.conflict_edges.length}] -> Truth Scoring -> Unified Cognition [Priority: ${behavior_influence_score.toFixed(2)}]. Active truth selected with score ${active_truth?.truth_score || 0}.`;

  return {
    final_memory_state: resolved_state,
    selected_truth: active_truth,
    behavior_influence_score,
    decision_rationale,
    execution_plan
  };
}
