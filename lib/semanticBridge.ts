export interface SemanticBridgeOutput {
  raw_input: string;
  semantic_intent: string;
  confidence: number;
  detected_style: "formal" | "slang" | "mixed";
  fallback_used: boolean;
}

const STYLE_KEYWORDS = {
  slang: ["gue", "lo", "lu", "banget", "sih", "dong", "deh", "wkwk", "anjay", "bro", "cuy", "gimana", "bikin", "gak", "nggak", "udah"],
  formal: ["saya", "anda", "apakah", "bagaimana", "mengapa", "demikian", "karena", "tersebut", "telah", "tidak", "belum"]
};

// Intent Rules sorted by priority (e.g. Identity and Override are usually higher priority than basic Info queries)
const INTENT_RULES = [
  {
    intent: "USER_IDENTITY_QUERY",
    confidence: 0.95,
    exact: ["siapa saya", "gue siapa", "nama saya siapa", "who am i", "nama gue siapa", "siapa nama saya", "identitas aku apa"],
    keywords: ["siapa", "nama", "gue", "saya", "aku", "identitas"]
  },
  {
    intent: "MEMORY_OVERRIDE",
    confidence: 0.90,
    exact: ["ubah", "ganti", "update", "sebenarnya", "bukan gitu", "salah", "tolong ubah", "ralat"],
    keywords: ["ubah", "ganti", "update", "sebenarnya", "koreksi", "ralat", "bukan"]
  },
  {
    intent: "MEMORY_WRITE",
    confidence: 0.95,
    exact: ["ingat ini", "simpan ini", "catat ini", "remember this", "tolong ingat", "ingetin"],
    keywords: ["ingat", "simpan", "catat", "remember", "hafalkan", "ingetin"]
  },
  {
    intent: "ANALYTIC_QUERY",
    confidence: 0.90,
    exact: ["analisa", "bandingkan", "apa perbedaan", "evaluate", "analisis", "evaluasi"],
    keywords: ["analisa", "bandingkan", "perbedaan", "evaluate", "bedanya", "evaluasi", "analisis"]
  },
  {
    intent: "INFO_QUERY",
    confidence: 0.85,
    exact: ["apa", "jelaskan", "how", "kenapa", "gimana"],
    keywords: ["apa", "jelaskan", "how", "kenapa", "bagaimana", "gimana", "mengapa", "cara"]
  }
];

/**
 * Detects the language style from the normalized text.
 */
function detectStyle(words: string[]): "formal" | "slang" | "mixed" {
  let slangCount = 0;
  let formalCount = 0;
  
  for (const word of words) {
    if (STYLE_KEYWORDS.slang.includes(word)) slangCount++;
    if (STYLE_KEYWORDS.formal.includes(word)) formalCount++;
  }
  
  if (slangCount > 0 && formalCount === 0) return "slang";
  if (formalCount > 0 && slangCount === 0) return "formal";
  
  // If both exist or neither exist, it's mixed
  return "mixed";
}

/**
 * Semantic Bridge Layer v1
 * Converts raw human text into deterministic Semantic Intent.
 * NO LLM REQUIRED. NO DATABASE REQUIRED. Low latency < 10ms.
 */
export function bridgeSemanticIntent(raw_input: string): SemanticBridgeOutput {
  // STEP 1: Normalize (lowercase, trim, strip heavy punctuation but keep standard letters/numbers)
  // Stripping most non-word chars except spaces
  const normalized = raw_input.toLowerCase().trim().replace(/[^\w\s]/gi, '');
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  const style = detectStyle(words);
  
  // STEP 2: Semantic Mapping Engine (Core / Exact Match)
  for (const rule of INTENT_RULES) {
    // If the input contains any of the exact phrases, return immediately
    if (rule.exact.some(phrase => normalized.includes(phrase))) {
      return {
        raw_input,
        semantic_intent: rule.intent,
        confidence: rule.confidence,
        detected_style: style,
        fallback_used: false
      };
    }
  }

  // STEP 3: Fuzzy Matching (Low Cost Heuristic via Keyword Overlap)
  let bestIntent = "UNKNOWN_INTENT";
  let maxScore = 0;
  let baseConfidence = 0;

  for (const rule of INTENT_RULES) {
    let overlapCount = 0;
    for (const kw of rule.keywords) {
      if (words.includes(kw)) {
        overlapCount++;
      }
    }
    
    // Simple heuristic: higher overlap = higher score
    if (overlapCount > maxScore) {
      maxScore = overlapCount;
      bestIntent = rule.intent;
      // Reduce confidence slightly since it's a fuzzy/partial match, but add small bonus per extra matched word
      baseConfidence = Math.max(0.5, rule.confidence - 0.15 + (overlapCount * 0.05));
    }
  }

  // If we found a fuzzy match with at least 1 strong keyword
  if (maxScore > 0) {
    return {
      raw_input,
      semantic_intent: bestIntent,
      // Cap confidence at 0.99
      confidence: Math.min(0.99, Number(baseConfidence.toFixed(2))),
      detected_style: style,
      fallback_used: true
    };
  }

  // Fallback if no rules or keywords match at all
  return {
    raw_input,
    semantic_intent: "CHAT_BIASA",
    confidence: 0.5,
    detected_style: style,
    fallback_used: true
  };
}
