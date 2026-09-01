/**
 * Intent Preprocessor Layer
 * RESPONSIBILITY:
 * - normalize input
 * - detect semantic intent
 * - output structured intent object
 * NO MEMORY ACCESS ALLOWED
 */

export interface PreprocessorOutput {
  raw_input: string;
  semantic_intent: string;
  confidence: number;
  detected_style: "formal" | "slang" | "mixed";
  fallback_used: boolean;
  intent_spec: {
    intent_mode: string;
    target_entity_types: string[];
    requires_graph: boolean;
    requires_causal_chain: boolean;
    compression_budget: number;
    recency_bias: number;
  };
}

const STYLE_KEYWORDS = {
  slang: ["gue", "lo", "lu", "banget", "sih", "dong", "deh", "wkwk", "anjay", "bro", "cuy", "gimana", "bikin", "gak", "nggak", "udah"],
  formal: ["saya", "anda", "apakah", "bagaimana", "mengapa", "demikian", "karena", "tersebut", "telah", "tidak", "belum"]
};

export const INTENT_MODES = {
  STATE_QUERY: 'STATE_QUERY', 
  DELTA: 'DELTA',             
  PROFILE: 'PROFILE',         
  ANALYTIC: 'ANALYTIC',
  MEMORY_WRITE: 'MEMORY_WRITE',
  MEMORY_OVERRIDE: 'MEMORY_OVERRIDE'
};

const INTENT_RULES = [
  {
    intent: INTENT_MODES.STATE_QUERY,
    confidence: 0.95,
    exact: ["siapa saya", "gue siapa", "nama saya siapa", "who am i", "nama gue siapa", "siapa nama saya", "identitas aku apa", "di mana rumahku", "apa pekerjaanku"],
    keywords: ["siapa", "nama", "gue", "saya", "aku", "identitas", "dimana", "pekerjaan"]
  },
  {
    intent: INTENT_MODES.MEMORY_OVERRIDE,
    confidence: 0.90,
    exact: ["ubah", "ganti", "update", "sebenarnya", "bukan gitu", "salah", "tolong ubah", "ralat"],
    keywords: ["ubah", "ganti", "update", "sebenarnya", "koreksi", "ralat", "bukan"]
  },
  {
    intent: INTENT_MODES.MEMORY_WRITE,
    confidence: 0.95,
    exact: ["ingat ini", "simpan ini", "catat ini", "remember this", "tolong ingat", "ingetin"],
    keywords: ["ingat", "simpan", "catat", "remember", "hafalkan", "ingetin"]
  },
  {
    intent: INTENT_MODES.DELTA,
    confidence: 0.90,
    exact: ["kenapa aku pindah kota", "apa alasanku berubah pikiran"],
    keywords: ["kenapa", "mengapa", "alasan", "sebab", "berubah", "dulu", "sekarang", "beda"]
  },
  {
    intent: INTENT_MODES.PROFILE,
    confidence: 0.90,
    exact: ["apa kesukaanku", "favoritku apa", "aku alergi apa"],
    keywords: ["kesukaan", "favorit", "suka", "hobi", "warna", "makanan", "minuman", "preferensi", "alergi"]
  },
  {
    intent: INTENT_MODES.ANALYTIC,
    confidence: 0.90,
    exact: ["apa pola hidupku", "bagaimana rutinitasku", "gambarkan karakterku", "analisa", "bandingkan", "apa perbedaan", "evaluate", "analisis", "evaluasi"],
    keywords: ["pola", "kebiasaan", "analisis", "rutinitas", "karakter", "gaya", "jelaskan", "analisa", "bandingkan", "perbedaan", "evaluate", "bedanya", "evaluasi"]
  }
];

function detectStyle(words: string[]): "formal" | "slang" | "mixed" {
  let slangCount = 0;
  let formalCount = 0;
  
  for (const word of words) {
    if (STYLE_KEYWORDS.slang.includes(word)) slangCount++;
    if (STYLE_KEYWORDS.formal.includes(word)) formalCount++;
  }
  
  if (slangCount > 0 && formalCount === 0) return "slang";
  if (formalCount > 0 && slangCount === 0) return "formal";
  return "mixed";
}

function getSpecForIntent(intent_mode: string) {
  switch (intent_mode) {
    case INTENT_MODES.DELTA:
      return {
        intent_mode: INTENT_MODES.DELTA,
        target_entity_types: ['ALL'],
        requires_graph: true,
        requires_causal_chain: true,
        compression_budget: 1500,
        recency_bias: 0.5 
      };
    case INTENT_MODES.PROFILE:
      return {
        intent_mode: INTENT_MODES.PROFILE,
        target_entity_types: ['PREFERENCE', 'ACTIVITY'],
        requires_graph: false,
        requires_causal_chain: false,
        compression_budget: 1200,
        recency_bias: 0.7 
      };
    case INTENT_MODES.ANALYTIC:
      return {
        intent_mode: INTENT_MODES.ANALYTIC,
        target_entity_types: ['ALL'],
        requires_graph: true,
        requires_causal_chain: false,
        compression_budget: 2000,
        recency_bias: 0.6
      };
    default:
      return {
        intent_mode: intent_mode,
        target_entity_types: ['LOCATION', 'IDENTITY', 'FACT', 'OCCUPATION', 'PROJECT', 'GOAL'],
        requires_graph: false,
        requires_causal_chain: false,
        compression_budget: 800,
        recency_bias: 1.0
      };
  }
}

export function preprocessIntent(raw_input: string): PreprocessorOutput {
  const normalized = raw_input.toLowerCase().trim().replace(/[^\w\s]/gi, '');
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  const style = detectStyle(words);
  
  // Exact Match
  for (const rule of INTENT_RULES) {
    if (rule.exact.some(phrase => normalized.includes(phrase))) {
      return {
        raw_input,
        semantic_intent: rule.intent,
        confidence: rule.confidence,
        detected_style: style,
        fallback_used: false,
        intent_spec: getSpecForIntent(rule.intent)
      };
    }
  }

  // Fuzzy Match
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
    if (overlapCount > maxScore) {
      maxScore = overlapCount;
      bestIntent = rule.intent;
      baseConfidence = Math.max(0.5, rule.confidence - 0.15 + (overlapCount * 0.05));
    }
  }

  if (maxScore > 0) {
    return {
      raw_input,
      semantic_intent: bestIntent,
      confidence: Math.min(0.99, Number(baseConfidence.toFixed(2))),
      detected_style: style,
      fallback_used: true,
      intent_spec: getSpecForIntent(bestIntent)
    };
  }

  // Fallback
  return {
    raw_input,
    semantic_intent: "CHAT_BIASA",
    confidence: 0.5,
    detected_style: style,
    fallback_used: true,
    intent_spec: getSpecForIntent("CHAT_BIASA")
  };
}
