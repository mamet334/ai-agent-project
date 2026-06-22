/**
 * Cognitive Memory Governor (CMG)
 * FINAL INTELLIGENCE GATE / OUTPUT FILTER before sending to LLM.
 * PURE DETERMINISTIC, NO LLM. NO STRING MERGING.
 */

export interface CMGInput {
  final_decision_context: any;
  memory_context: {
    tgml_nodes: any[];
    conflict_edges: any[];
  };
  truth_score_bundle: any;
  behavior_profile: any;
  global_loop_result: any;
}

export interface CMGOutput {
  status: "ALLOW" | "REJECT" | "REWRITE";
  reason: string;
  confidence: number;
  selected_truth: any | null; // ONLY 1 ACTIVE TRUTH
}

export const LEGACY_COGNITION_ENABLED = false;

export function runCognitiveMemoryGovernor(input: CMGInput): CMGOutput {
  if (!LEGACY_COGNITION_ENABLED) {
    return {
      status: "ALLOW",
      reason: "[LEGACY DISABLED] CognitiveMemoryGovernor is bypassed.",
      confidence: input.final_decision_context?.confidence_score || 1.0,
      selected_truth: input.final_decision_context?.memory?.active || null
    };
  }

  const active_truth = input.final_decision_context?.memory?.active;
  let status: "ALLOW" | "REJECT" | "REWRITE" = "ALLOW";
  let reason = "Valid context.";
  let confidence = input.final_decision_context?.confidence_score || 0;
  
  if (!active_truth) {
    return {
      status: "ALLOW",
      reason: "No active memory. Proceeding gracefully as stateless execution.",
      confidence,
      selected_truth: null
    };
  }

  const truth_score = active_truth.truth_score || 0;

  // STEP 1: FINAL VALIDATION CHECK
  if (truth_score < 0.7) {
    status = "REJECT";
    reason = `Rejected: truth_score (${truth_score}) is strictly below absolute threshold of 0.7.`;
  }

  // Flag "UNSTABLE" if conflict TGML active
  const hasConflicts = input.memory_context.conflict_edges && input.memory_context.conflict_edges.length > 0;
  if (hasConflicts && status === "ALLOW") {
    reason = "FLAG: UNSTABLE. Truth Graph has unresolved conflicts attached to this node.";
    confidence -= 0.1; 
  }

  // Behavior mismatch penalty
  const wantsDetailed = input.behavior_profile?.response_preference?.detailed_answer > 0.6;
  const isFast = input.final_decision_context?.response_mode === "direct";
  if (wantsDetailed && isFast && status === "ALLOW") {
    confidence -= 0.05; // Downgrade confidence on mismatch
  }

  // STEP 2: HALLUCINATION CHECK (DETERMINISTIC)
  if (truth_score < 0.5) {
    status = "REJECT";
    reason = `Hallucination Risk: Unverified truth_score (${truth_score}) < 0.5.`;
  }
  
  // Detect contradictory memory nodes (mathematical paradox after loop)
  const latent = input.final_decision_context?.memory?.latent || [];
  if (latent.length > 0) {
    const top_latent = latent[0];
    if (top_latent.truth_score >= truth_score && status !== "REJECT") {
       status = "REWRITE";
       reason = "Hallucination Risk: Mathematical contradiction exists where latent memory rivals active truth. Re-evaluating required.";
       confidence -= 0.2;
    }
  }

  // STEP 3: FINAL DECISION POLICY
  return {
    status,
    reason,
    confidence: Number(Math.max(0, confidence).toFixed(3)),
    selected_truth: status === "REJECT" ? null : active_truth
  };
}
