/**
 * Global Cognition Feedback Loop Engine (G-CFL v1)
 * SELF-REVIEW SYSTEM before final output is sent to LLM.
 * NO LLM USAGE INSIDE LOOP. PURE DETERMINISTIC.
 */

import { FinalDecisionContext } from './decisionEngine';

export interface GlobalCognitionInput {
  decision_context: FinalDecisionContext;
  memory_context: {
    tgml_nodes: any[];
    conflict_edges: any[];
  };
  truth_scores: any;
  behavior_profile: any;
}

export const LEGACY_COGNITION_ENABLED = false;

export function runGlobalCognitionLoop(input: GlobalCognitionInput): FinalDecisionContext {
  if (!LEGACY_COGNITION_ENABLED) {
    return input.decision_context;
  }

  const current_context = { ...input.decision_context };
  
  // Shallow clone memory to allow safe swapping without modifying original references deeply
  current_context.memory = {
    active: input.decision_context.memory.active,
    latent: [...input.decision_context.memory.latent]
  };

  const MAX_ITERATIONS = 2;
  let iteration = 0;
  let stable_score = current_context.confidence_score;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    
    // STEP 1: INITIAL EVALUATION & STEP 2: SELF CHECK
    let needs_revision = false;
    const active_truth = current_context.memory.active;
    const latent_truths = current_context.memory.latent;

    // Condition A: Conflict still exists in TGML
    if (input.memory_context.conflict_edges && input.memory_context.conflict_edges.length > 0) {
      needs_revision = true;
    }

    // Condition B: Truth score is low
    if (active_truth && active_truth.truth_score < 0.75) {
      needs_revision = true;
    }

    // Condition C: Behavior mismatch (e.g. detailed required but execution contract is low depth)
    const wantsDetailed = input.behavior_profile?.response_preference?.detailed_answer > 0.6;
    if (wantsDetailed && current_context.response_mode === "direct") {
      needs_revision = true;
    }

    // Condition D: Memory contradiction unresolved closely
    if (active_truth && latent_truths.length > 0) {
      if ((active_truth.truth_score - latent_truths[0].truth_score) < 0.1) {
        needs_revision = true;
      }
    }

    // If perfectly stable, exit loop early
    if (stable_score >= 0.85 && !needs_revision) {
      break;
    }

    // STEP 3 & 4: REVISION AND REWEIGHTING
    if (needs_revision) {
      // Re-evaluate active truth vs top latent truth
      const evaluateCandidate = (candidate: any) => {
        if (!candidate) return 0;
        const behavior_fit = wantsDetailed ? 0.8 : 0.5;
        const graph_consistency = input.memory_context.conflict_edges.length === 0 ? 1.0 : 0.5;
        // simplistic recency approximation
        const recency = 0.9;
        
        // final_score = weighted(truth_score, behavior_fit, recency, graph_consistency)
        const score = (
          (candidate.truth_score * 0.5) +
          (behavior_fit * 0.2) +
          (recency * 0.15) +
          (graph_consistency * 0.15)
        );
        return score;
      };

      const active_reweight = evaluateCandidate(active_truth);
      let best_latent = null;
      let best_latent_score = 0;

      if (latent_truths.length > 0) {
        best_latent = latent_truths[0];
        best_latent_score = evaluateCandidate(best_latent);
      }

      // STEP 5: FINAL CONSENSUS (NO STRING MERGING, ONLY STRICT SWAP)
      if (best_latent && best_latent_score > active_reweight) {
        current_context.memory.active = best_latent;
        // Put the old active back into latent pool
        if (active_truth) {
          current_context.memory.latent = [active_truth, ...latent_truths.slice(1)];
        } else {
          current_context.memory.latent = latent_truths.slice(1);
        }
        current_context.confidence_score = Number(best_latent_score.toFixed(3));
      } else {
        current_context.confidence_score = Number(active_reweight.toFixed(3));
      }

      stable_score = current_context.confidence_score;
      
      // Stop loop if stable threshold met
      if (stable_score >= 0.85) {
        break; // FORCE FINALIZE
      }
    } else {
      break;
    }
  }

  return current_context;
}
