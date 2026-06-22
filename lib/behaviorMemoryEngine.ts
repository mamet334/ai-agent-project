/**
 * Behavior Memory Engine v1
 * Adaptive behavior tracking system to learn user interaction patterns.
 * NO SUPABASE. NO LLM. Purely deterministic, low cost, stateless session cache.
 */

export interface BehaviorMemory {
  session_id: string;
  style_preference: {
    formal: number;
    casual: number;
    technical: number;
  };
  response_preference: {
    short_answer: number;
    detailed_answer: number;
    copy_paste_preference: number;
  };
  thinking_pattern: {
    system_design: number;
    optimization_focus: number;
    execution_focus: number;
  };
  habits: {
    repeats_prompt: number;
    refines_system: number;
  };
}

// In-memory stateless container for behavior patterns
const behaviorStore = new Map<string, BehaviorMemory>();

function createDefaultBehavior(session_id: string): BehaviorMemory {
  return {
    session_id,
    style_preference: { formal: 0.5, casual: 0.5, technical: 0.1 },
    response_preference: { short_answer: 0.5, detailed_answer: 0.5, copy_paste_preference: 0.1 },
    thinking_pattern: { system_design: 0.2, optimization_focus: 0.2, execution_focus: 0.5 },
    habits: { repeats_prompt: 0.0, refines_system: 0.0 }
  };
}

export function updateBehaviorProfile(
  session_id: string,
  user_input: string,
  semantic_intent: string
): BehaviorMemory {
  if (!behaviorStore.has(session_id)) {
    behaviorStore.set(session_id, createDefaultBehavior(session_id));
  }
  
  const profile = behaviorStore.get(session_id)!;
  const text = user_input.toLowerCase().trim();
  
  // DECAY OLD VALUES (0.98 multiplier per request)
  const applyDecay = (obj: Record<string, number>) => {
    for (const key in obj) {
      obj[key] = obj[key] * 0.98;
    }
  };

  applyDecay(profile.style_preference as any);
  applyDecay(profile.response_preference as any);
  applyDecay(profile.thinking_pattern as any);
  applyDecay(profile.habits as any);

  // INCREMENT LOGIC (Deterministic Heuristics)
  
  // 1. Style
  if (/(gue|lu|lo|wkwk|bro|cuy|anjay|banget)/.test(text)) profile.style_preference.casual += 0.15;
  if (/(saya|anda|mohon|terima kasih|apakah|bagaimana)/.test(text)) profile.style_preference.formal += 0.15;
  if (/(api|database|schema|json|function|class|interface|sql)/.test(text)) profile.style_preference.technical += 0.15;

  // 2. Response Preference
  if (/(singkat|ringkas|pendek|langsung|cepat)/.test(text)) profile.response_preference.short_answer += 0.2;
  if (/(detail|jelaskan|lengkap|rinci|kenapa|mengapa)/.test(text)) profile.response_preference.detailed_answer += 0.2;
  if (/(kode|code|copy|salin|paste)/.test(text)) profile.response_preference.copy_paste_preference += 0.2;

  // 3. Thinking Pattern
  if (/(arsitektur|sistem|desain|struktur|diagram|flow)/.test(text)) profile.thinking_pattern.system_design += 0.2;
  if (/(optimasi|cepat|lambat|performance|memori|refactor)/.test(text)) profile.thinking_pattern.optimization_focus += 0.2;
  if (/(buat|bikin|jalankan|execute|run|implementasi)/.test(text)) profile.thinking_pattern.execution_focus += 0.2;

  // 4. Habits
  if (semantic_intent === "MEMORY_OVERRIDE" || semantic_intent === "DELTA") profile.habits.refines_system += 0.2;
  if (text.includes("ulang") || text.includes("lagi")) profile.habits.repeats_prompt += 0.15;

  // NORMALIZE to 1.0 MAX
  const normalize = (obj: Record<string, number>) => {
    for (const key in obj) {
      if (obj[key] > 1.0) obj[key] = 1.0;
    }
  };

  normalize(profile.style_preference as any);
  normalize(profile.response_preference as any);
  normalize(profile.thinking_pattern as any);
  normalize(profile.habits as any);

  return profile;
}

export function getBehaviorProfile(session_id: string): BehaviorMemory {
  return behaviorStore.get(session_id) || createDefaultBehavior(session_id);
}

export function clearBehaviorSession(session_id: string): void {
  behaviorStore.delete(session_id);
}
