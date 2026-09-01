/**
 * Cognitive Memory Governor (CMG) — PR#2
 * FINAL INTELLIGENCE GATE / OUTPUT FILTER before sending to LLM.
 * PURE DETERMINISTIC, NO LLM. NO STRING MERGING.
 *
 * Diaktifkan kembali setelah PR#3 (AssistantService) menyediakan "rumah" resmi
 * untuk memanggil governor ini di alur processMessage().
 *
 * Logika truth_score (heuristik sumber — sesuai diskusi Owner):
 *   - Pernyataan eksplisit user       → 0.9
 *   - Memory dikonfirmasi ulang user  → +0.05 bonus (max 0.95)
 *   - Hasil web search yang disimpan  → 0.7
 *   - Kesimpulan AI dari percakapan   → 0.6
 *   - Tidak ada sumber yang jelas     → 0.4 (default rendah)
 *
 * Threshold awal LONGGAR (anti over-engineering):
 *   - REJECT  jika truth_score < 0.3  (bukan 0.7 dulu)
 *   - REWRITE jika latent rival active
 *   - Diperketat bertahap berdasarkan data pemakaian nyata
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

// =============================================
// FEATURE FLAG — aktifkan dengan threshold longgar
// =============================================
// Sebelumnya: false (bypass total)
// Sekarang: true — governor aktif, threshold awal 0.3 (longgar)
// Perketat bertahap setelah observasi pola REJECT/REWRITE di log
export const LEGACY_COGNITION_ENABLED = true;

// Threshold awal — lebih longgar dari desain akhir (0.7)
// Naikkan bertahap: 0.3 → 0.5 → 0.7 setelah data nyata menunjukkan aman
const REJECT_THRESHOLD = 0.3;
const HALLUCINATION_THRESHOLD = 0.2;

// =============================================
// TRUTH SCORE CALCULATOR
// Heuristik berdasarkan sumber memory
// =============================================

/**
 * Hitung truth_score dari sumber memory jika belum ada nilainya.
 * Dipanggil ketika active_truth.truth_score === undefined/null.
 *
 * @param memory - node memory dari final_decision_context
 * @returns number (0–1)
 */
export function calculateTruthScore(memory: any): number {
  if (!memory) return 0.4;

  // Sudah ada truth_score → pakai langsung
  if (typeof memory.truth_score === 'number') return memory.truth_score;

  // Heuristik berdasarkan source_type
  const source = memory.source_type || memory.source || '';

  if (source === 'explicit_user_statement') return 0.9;
  if (source === 'user_confirmed')          return Math.min(0.95, 0.9 + 0.05);
  if (source === 'web_search')              return 0.7;
  if (source === 'ai_inference')            return 0.6;
  if (source === 'user_upload')             return 0.75;

  // Default — tidak ada sumber yang jelas
  return 0.4;
}

// =============================================
// MAIN GOVERNOR
// =============================================

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

  // Hitung truth_score (pakai existing atau heuristik sumber)
  const truth_score = calculateTruthScore(active_truth);

  // STEP 1: VALIDATION CHECK (threshold longgar: 0.3)
  if (truth_score < REJECT_THRESHOLD) {
    status = "REJECT";
    reason = `Rejected: truth_score (${truth_score.toFixed(2)}) di bawah threshold ${REJECT_THRESHOLD}. Sumber: ${active_truth.source_type || 'tidak diketahui'}.`;
    // Log untuk observasi — bantu Owner memutuskan apakah threshold perlu disesuaikan
    console.warn('[CMG] REJECT triggered:', reason);
  }

  // Flag "UNSTABLE" jika ada konflik TGML aktif
  const hasConflicts = input.memory_context.conflict_edges &&
    input.memory_context.conflict_edges.length > 0;
  if (hasConflicts && status === "ALLOW") {
    reason = "FLAG: UNSTABLE. Truth Graph has unresolved conflicts attached to this node.";
    confidence -= 0.1;
  }

  // Behavior mismatch penalty (minor)
  const wantsDetailed = input.behavior_profile?.response_preference?.detailed_answer > 0.6;
  const isFast = input.final_decision_context?.response_mode === "direct";
  if (wantsDetailed && isFast && status === "ALLOW") {
    confidence -= 0.05;
  }

  // STEP 2: HALLUCINATION CHECK (threshold sangat rendah: 0.2)
  if (truth_score < HALLUCINATION_THRESHOLD) {
    status = "REJECT";
    reason = `Hallucination Risk: truth_score (${truth_score.toFixed(2)}) < ${HALLUCINATION_THRESHOLD}. Memory tidak dapat dipercaya.`;
    console.warn('[CMG] Hallucination risk:', reason);
  }

  // Detect contradictory memory nodes
  const latent = input.final_decision_context?.memory?.latent || [];
  if (latent.length > 0) {
    const top_latent_score = calculateTruthScore(latent[0]);
    if (top_latent_score >= truth_score && status !== "REJECT") {
      status = "REWRITE";
      reason = "Hallucination Risk: Latent memory rivals active truth. Re-evaluating required.";
      confidence -= 0.2;
      console.warn('[CMG] REWRITE triggered:', reason, { active_score: truth_score, latent_score: top_latent_score });
    }
  }

  // STEP 3: FINAL DECISION
  return {
    status,
    reason,
    confidence: Number(Math.max(0, confidence).toFixed(3)),
    selected_truth: status === "REJECT" ? null : active_truth
  };
}
