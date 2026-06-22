/**
 * Truth Scoring Engine (TSE v1)
 * Multi-signal deterministic data validity scoring (NO LLM DEPENDENCY).
 */

export interface TruthScoreResult {
  truth_score: number;
  confidence: number;
  label: "TRUSTED" | "LATENT" | "REJECTED";
  breakdown: {
    source: number;
    structure: number;
    semantic: number;
    cross_source: number;
    temporal: number;
  };
}

export function scoreSourceTrust(inputSource: string): number {
  if (!inputSource) return 0.5;
  const trusted = ['ACTIVE_VIEW', 'USER_EXPLICIT', 'METADATA', 'SYSTEM'];
  if (trusted.includes(inputSource)) return 1.0;
  if (inputSource === 'RAW_HISTORY') return 0.6;
  if (inputSource === 'UNKNOWN') return 0.3;
  return 0.5;
}

export function scoreStructureQuality(text: string): number {
  if (!text || text.trim() === '') return 0.0;
  const lower = text.toLowerCase();
  
  // Detect AI-generated filler or low info density
  const hasAiPattern = /(sebagai model bahasa|sebagai asisten ai|saya tidak dapat|maaf,|saya hanyalah)/.test(lower);
  if (text.length < 2) return 0.1; // Too short to be a meaningful truth
  
  // Basic repetition check
  const words = lower.split(/\s+/).filter(w => w.length > 2);
  const uniqueWords = new Set(words);
  const repetitionRatio = words.length > 5 ? (words.length - uniqueWords.size) / words.length : 0;
  
  let score = 1.0;
  if (hasAiPattern) score -= 0.6;
  if (repetitionRatio > 0.4) score -= 0.3; // heavily repeated
  
  return Math.max(0.0, Math.min(1.0, score));
}

export function scoreSemanticConsistency(claims: string[]): number {
  if (!claims || claims.length === 0) return 1.0;
  // Look for self-contradiction within the same payload (heuristics)
  const joined = claims.join(" ").toLowerCase();
  // If there are signs of negation mixed with affirmation about the same topic, lower score
  // Since we use no LLM, this is a very basic structural check.
  const negations = (joined.match(/(tidak|bukan|salah|jangan|belum)/g) || []).length;
  if (negations > 2 && claims.length <= 2) {
    return 0.6; // High density of negations might imply uncertainty or correction
  }
  return 0.9;
}

export function scoreCrossSourceValidation(sources: string[]): number {
  if (!sources || sources.length === 0) return 0.0;
  const unique = new Set(sources.filter(s => s && s !== 'UNKNOWN'));
  if (unique.size >= 3) return 1.0; // Highly corroborated
  if (unique.size === 2) return 0.8; 
  if (unique.size === 1) return 0.5; // Single source
  return 0.3;
}

export function scoreTemporalStability(timestamp: number, historyTimestamps: number[]): number {
  if (!historyTimestamps || historyTimestamps.length === 0) return 1.0; // New fact is fresh
  // If history exists, we see if it's consistently reported over time
  // For v1, we just return a stable 0.9 assuming historical presence is good.
  return 0.9; 
}

export function calculateTruthScore(params: {
  text: string;
  source: string;
  claims: string[];
  cross_sources: string[];
  timestamp: number;
  history_timestamps: number[];
}): TruthScoreResult {
  const source_score = scoreSourceTrust(params.source);
  const structure_score = scoreStructureQuality(params.text);
  const semantic_score = scoreSemanticConsistency(params.claims);
  const cross_source_score = scoreCrossSourceValidation(params.cross_sources);
  const temporal_score = scoreTemporalStability(params.timestamp, params.history_timestamps);

  // FINAL SCORING FORMULA
  const truth_score = (
    source_score * 0.30 +
    structure_score * 0.20 +
    semantic_score * 0.20 +
    cross_source_score * 0.20 +
    temporal_score * 0.10
  );

  let label: "TRUSTED" | "LATENT" | "REJECTED" = "LATENT";
  if (truth_score >= 0.75) label = "TRUSTED";
  else if (truth_score < 0.40) label = "REJECTED";

  return {
    truth_score: Number(truth_score.toFixed(3)),
    confidence: Number(truth_score.toFixed(3)), // V1 simplified confidence map
    label,
    breakdown: {
      source: Number(source_score.toFixed(3)),
      structure: Number(structure_score.toFixed(3)),
      semantic: Number(semantic_score.toFixed(3)),
      cross_source: Number(cross_source_score.toFixed(3)),
      temporal: Number(temporal_score.toFixed(3))
    }
  };
}

export function logTruthEvaluation(event: any) {
  console.log(`[TSE v1] Evaluated Memory Key '${event.key}': ${event.label} (Score: ${event.truth_score})`, event.breakdown);
}
