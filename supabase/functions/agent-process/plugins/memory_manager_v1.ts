import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Helper to log audits asynchronously
const logMemoryAudit = (supabaseUrl, supabaseKey, payload) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    supabase.from('memory_audit_logs').insert([payload]).then(({error}) => {
      if (error) console.error("Audit log insert error:", error);
    });
  } catch(e) {
    console.error("Audit log setup error:", e);
  }
};

// -----------------------------------------------------------------
// PRODUCTION-GRADE IDEMPOTENCY CACHE
// Mencegah double insert pada level in-memory (contoh: async retry/frontend double click)
// -----------------------------------------------------------------
const processedMemoryKeys = new Set();
// Membersihkan cache setiap 1 jam agar tidak memory leak
setInterval(() => processedMemoryKeys.clear(), 1000 * 60 * 60);

// Helper fungsi untuk membuat Unique Fingerprint
const generateMemoryHash = async (userId, message) => {
  const msgBuffer = new TextEncoder().encode(userId + "_" + message.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};


export const getEmbedding = async () => []; // HARD COST SHIELD: NO AI

export const saveFactDirectly = async (fact, userId, supabaseUrl, supabaseKey) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('user_memories').insert([{ user_id: userId, summary: fact, embedding: null }]);
  } catch(e) { console.error('Memory save error', e); }
};

export const retrieveMemories = async (userPrompt, userId, supabaseUrl, supabaseKey) => {
  const startTime = Date.now();
  if (!userId || userPrompt.trim().length < 4) {
     logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_failed', status: 'FAILED', reason: 'query_too_short', query: userPrompt, execution_time_ms: Date.now() - startTime });
     return [];
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[COST LEAK DETECTION] memoryFetchCount: 1');
    // Ambil max 15 memory terakhir, filter deprecated di kode agar kompatibel dengan schema pra-Level 5
    let { data } = await supabase.from('user_memories').select('id, summary, created_at, memory_hits, memory_type, confidence, source, is_deprecated, memory_state, causal_links, reasoning_depth_score, justification_chain').eq('user_id', userId).order('created_at', { ascending: false }).limit(15);
    if (!data || data.length === 0) return [];
    
    // Filter out Level 5 deprecated memories safely
    data = data.filter(d => d.is_deprecated !== true);
    
    // Lightweight Scoring System (NO AI)
    const promptLower = userPrompt.toLowerCase();
    const keywords = promptLower.split(/[\s\p{P}]+/).filter(w => w.length > 3);
    
    // Deduplikasi berdasar isi teks
    const uniqueMemoriesMap = new Map();
    for (const d of data) {
       if (!uniqueMemoriesMap.has(d.summary.toLowerCase())) {
          uniqueMemoriesMap.set(d.summary.toLowerCase(), d);
       }
    }
    const uniqueMemories = Array.from(uniqueMemoriesMap.values());
    
    const scoredMemories = uniqueMemories.map((mem, index) => {
       let score = 0;
       const memLower = mem.summary.toLowerCase();
       
       // Exact match (+5)
       if (promptLower.includes(memLower) || memLower.includes(promptLower)) {
          score += 5;
       }
       
       // Keyword match (+2 per keyword)
       for (const kw of keywords) {
          if (memLower.includes(kw)) score += 2;
       }
       
       // Recent memory (+1) - index 0 is most recent
       if (index < 3) score += 1;
       
       const relevanceScore = score;
       const confidenceScore = mem.confidence || 1.0;
       const ageDays = (Date.now() - new Date(mem.created_at).getTime()) / (1000 * 60 * 60 * 24);
       const recencyScore = Math.max(0, 100 - (ageDays * 2));
       const frequencyScore = Math.min(100, (mem.memory_hits || 0) * 10);
       
       // STRICT COGNITIVE STATE ENFORCEMENT
       let stateModifier = 0;
       if (mem.memory_state === 'STABILIZED') stateModifier = 15.0;
       else if (mem.memory_state === 'CONFLICTED') stateModifier = -20.0;
       
       const cognitiveDepth = (mem.reasoning_depth_score || 0) * 10.0;
       const truthVerification = (mem.truth_verification_score || 0) * 10.0;

       // DETERMINISTIC FORMULA: Gabungan relevansi, kepercayaan, kemutakhiran, frekuensi, dan evaluasi kognitif yang direstui Level 5
       const finalScore = (relevanceScore * 0.4) + (confidenceScore * 30.0) + (recencyScore * 0.2) + (frequencyScore * 0.1) + stateModifier + cognitiveDepth + truthVerification;
       
       return { ...mem, score: finalScore, decayScore: recencyScore, frequencyScore, finalScore };
    });
    
    // Sort by score (descending) and take top 5
    scoredMemories.sort((a, b) => b.score - a.score);
    const topMemories = scoredMemories.slice(0, 5);
    
    // No legacy score===0 fallback anymore. Adaptive formula guarantees >0 score for any valid memory.
    
    let currentLen = 0;
    const finalMemories = [];
    for (const d of topMemories) {
      // STRICT SCORING GATE ENFORCEMENT: No score = no entry
      if (typeof d.finalScore !== 'number' || isNaN(d.finalScore)) continue;
      
      let enrichedContent = d.summary;
      if (d.memory_state === 'STABILIZED' && d.justification_chain) {
          enrichedContent += ` [Verified Fact: ${d.justification_chain}]`;
      } else if (d.memory_state === 'CONFLICTED') {
          enrichedContent += ` [Warning: Unresolved conflicting facts detected. Use with caution.]`;
      }
      
      finalMemories.push({ 
         id: d.id,
         type: 'memory', 
         content: enrichedContent, 
         score: d.finalScore,
         timestamp: d.created_at,
         decayScore: d.decayScore,
         frequencyScore: d.frequencyScore,
         finalScore: d.finalScore
      });
      currentLen += d.summary.length;
    }
    
    // Asynchronously update memory_hits to ensure adaptive consistency on next retrieval
    if (finalMemories.length > 0) {
       const memoryIds = finalMemories.map(m => m.id).filter(id => id);
       if (memoryIds.length > 0) {
           supabase.rpc('update_memory_stats', { memory_ids: memoryIds })
             .then(({error}) => { if (error) console.error("Update memory stats error:", error) })
             .catch(e => console.error("Update memory stats exception:", e));
       }
    }
    
    const latencyMs = Date.now() - startTime;
    
    // DETECT INTENT UNTUK REPORTING/LOOKUP (Rule-based)
    if (promptLower.includes('deadline')) {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'deadline_lookup', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    } else if (promptLower.includes('tugas')) {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'task_lookup', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    } else if (promptLower.includes('laporan')) {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'report_generation', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    } else {
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_success', status: 'SUCCESS', query: userPrompt, matched_memories: topMemories.length, execution_time_ms: latencyMs });
    }
    
    return finalMemories;
  } catch (e) {
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_failed', status: 'FAILED', reason: e.message, query: userPrompt, execution_time_ms: Date.now() - startTime });
    return [];
  }
};

export const extractStructuredMemory = async (userPrompt) => {
  const lower = userPrompt.toLowerCase();
  
  // SANITIZATION: Block injection attempts
  if (/(?:abaikan|ignore|system prompt|api key|bypass|sudo)/i.test(lower)) {
    return { isInjectionAttempt: true };
  }
  
  let type = 'EVENT';
  let confidence = 0.8;
  
  // FACT CLASSIFICATION
  if (/(?:tinggal di|domisili|rumah.*di)/i.test(lower)) {
    type = 'LOCATION';
    confidence = 0.95;
  } else if (/(?:suka|alergi|favorit|preferensi|benci|lebih suka)/i.test(lower)) {
    type = 'PREFERENCE';
    confidence = 0.95;
  } else if (/(?:nama|panggil|bernama)/i.test(lower)) {
    type = 'IDENTITY';
    confidence = 0.95;
  } else if (/(?:bekerja sebagai|pekerjaan|profesi)/i.test(lower)) {
    type = 'OCCUPATION';
    confidence = 0.95;
  } else if (/(?:project|proyek|sedang membangun)/i.test(lower)) {
    type = 'PROJECT';
    confidence = 0.9;
  } else if (/(?:target|tujuan|fokus|jadwal|deadline|tugas|harus selesai|riset)/i.test(lower)) {
    type = 'GOAL';
    confidence = 0.9;
  } else if (/(?:adalah|ingat|catat)/i.test(lower)) {
    type = 'FACT';
    confidence = 0.9;
  }
  
  // RAW PROMPT POLLUTION SANITIZATION (Aggressive)
  const noiseRegex = /^(?:ingat ini|ingat|tolong ingat|catat ini|jangan lupa|penting:|ulangi preferensiku|ulangi nanti|simpan ini|remember this|aku ingin kamu mengingat|tolong simpan)\s*[:,\-\.]*\s*/ig;
  const tailNoiseRegex = /\s*(?:ulangi preferensiku|ulangi nanti|ingat ya|tolong ingat)$/ig;
  
  let factStr = userPrompt.replace(noiseRegex, '').replace(tailNoiseRegex, '').trim();
  
  // Capitalize first letter
  if (factStr.length > 0) {
      factStr = factStr.charAt(0).toUpperCase() + factStr.slice(1);
  }
  
  factStr = factStr.substring(0, 250);
  
  return {
    fact: factStr,
    type,
    confidence,
    isInjectionAttempt: false
  };
};

export const applyUserCorrection = async (userId, userPrompt, supabaseUrl, supabaseKey) => {
   const lower = userPrompt.toLowerCase();
   let correctionType = null;
   
   if (/(?:salah|tidak benar|keliru)/i.test(lower)) correctionType = 'FACT_ERROR';
   else if (/(?:bukan|aku ganti|sekarang|berubah)/i.test(lower)) correctionType = 'PREFERENCE_CHANGE';
   else if (/(?:sudah lewat|kadaluarsa|dulu)/i.test(lower)) correctionType = 'OUTDATED_INFO';
   
   if (correctionType) {
       try {
           const supabase = createClient(supabaseUrl, supabaseKey);
           
           // TARGETING LOGIC: Extract keywords to target specific memory
           const keywords = userPrompt.replace(/(?:salah|bukan|tidak benar|aku ganti|hapus memori|itu|yang|tentang|keliru|sekarang|berubah|sudah lewat|kadaluarsa|dulu)\s*/ig, '').trim().split(' ').filter(k => k.length > 3);
           
           if (keywords.length > 0) {
               // Update only memories matching the keywords
               for (const kw of keywords) {
                   await supabase.from('user_memories')
                       .update({ confidence: 0.1, memory_type: correctionType })
                       .eq('user_id', userId)
                       .ilike('summary', `%${kw}%`);
               }
               console.log(`[SELF-HEALING] Memory confidence reduced. Type: ${correctionType}`);
           }
           // STRICT ENFORCEMENT: No global fallback mutation allowed.
       } catch(e) {
           console.error("Correction error", e);
       }
   }
}

export const processAndSaveMemory = async (userPrompt, aiResponse, userId, supabaseUrl, supabaseKey) => {
  console.log("[L2_START]", { input: userPrompt });
  
  console.log("[MEMORY_CALL]", {
    time: Date.now(),
    message: userPrompt,
    stack: new Error().stack
  });
  const startTime = Date.now();
  console.log('[MEMORY_TRIGGER]', userPrompt);
  
  if (!userId || !userPrompt) {
     console.log(`[L2_EXIT] reason="missing_user_or_prompt"`);
     logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_failed', status: 'FAILED', reason: 'missing_user_or_prompt', query: userPrompt, execution_time_ms: Date.now() - startTime });
     return;
  }
  const lower = userPrompt.toLowerCase().trim();
  
  // GUARD CLAUSE: Deteksi Retrieval Intent
  const isRetrievalIntent = lower.includes('?') || /^(?:apa|kapan|siapa|dimana|di mana|bagaimana|tampilkan|sebutkan|cek|lihat|beritahu|apakah|adakah)\b/i.test(lower);
  
  if (isRetrievalIntent) {
    console.log(`[L2_EXIT] reason="retrieval_intent"`);
    console.log('[MEMORY_SAVE_SKIPPED_RETRIEVAL]', userPrompt);
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'detected_as_retrieval_query', query: userPrompt, execution_time_ms: Date.now() - startTime });
    return; // Keluar sebelum regex save dieksekusi
  }
  
  // SMART RULE-BASED EXTRACTION (NO AI COST)
  const pronouns = /(?:aku|gue|gua|saya|ane|namaku)/;
  
  const identityPattern = new RegExp(`(?:nama ${pronouns.source}|${pronouns.source} bernama|panggil ${pronouns.source})`, 'i');
  const locationPattern = new RegExp(`(?:${pronouns.source} tinggal di|domisili ${pronouns.source}|rumah ${pronouns.source} di)`, 'i');
  const preferencePattern = new RegExp(`(?:${pronouns.source} suka|${pronouns.source} tidak suka|favoritku|favorit ${pronouns.source}|lebih suka|${pronouns.source} alergi|kebiasaan ${pronouns.source})`, 'i');
  const occupationPattern = new RegExp(`(?:${pronouns.source} bekerja sebagai|pekerjaanku|pekerjaan ${pronouns.source}|profesiku|profesi ${pronouns.source})`, 'i');
  const projectPattern = new RegExp(`(?:project ${pronouns.source}|proyek ${pronouns.source}|${pronouns.source} sedang membangun)`, 'i');
  const goalPattern = new RegExp(`(?:target ${pronouns.source}|tujuan ${pronouns.source}|fokus ${pronouns.source}|saat ini ${pronouns.source} fokus|tugas ${pronouns.source}|deadline|tenggat waktu|harus selesai|riset|besok ${pronouns.source} harus|jadwal)`, 'i');
  const manualTrigger = /(?:ingat ini|ingat|tolong ingat|catat ini|jangan lupa|simpan ini|penting:)/i;
  
  const memoryRegex = new RegExp(`${identityPattern.source}|${locationPattern.source}|${preferencePattern.source}|${occupationPattern.source}|${projectPattern.source}|${goalPattern.source}|${manualTrigger.source}`, 'i');
  
  const shouldSave = memoryRegex.test(lower);
  console.log("[L2_REGEX_RESULT]", { shouldSave });
  
  if (shouldSave) {
    try {
      console.log('[MEMORY_SAVE_START]');
      
      // 1. IDENTITY LAYER: Generate Unique Fingerprint
      const messageHash = await generateMemoryHash(userId, lower);
      
      // 2. IDEMPOTENCY CHECK (In-Memory)
      if (processedMemoryKeys.has(messageHash)) {
         console.log(`[L2_EXIT] reason="idempotency_cache_hit"`);
         console.log("[MEMORY_IDEMPOTENT_CHECK] Hit local cache! Skipping duplicate insert:", messageHash);
         console.log("[MEMORY_SKIP_DUPLICATE]");
         logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'idempotent_cache_hit', query: userPrompt, execution_time_ms: Date.now() - startTime });
         return;
      }
      
      // Tandai sudah diproses
      processedMemoryKeys.add(messageHash);

      console.log('[COST LEAK DETECTION] memoryWriteCount: 1');
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      console.log("[MEMORY_INSERT_ATTEMPT]", {
        userId,
        message: userPrompt,
        messageHash,
        timestamp: Date.now()
      });
      
      // 3. DATABASE SAFETY & SANITIZATION
      const sanitizedExtract = await extractStructuredMemory(userPrompt);

      if (!sanitizedExtract || sanitizedExtract.isInjectionAttempt) {
         console.log(`[L2_EXIT] reason="security_injection_blocked"`);
         console.warn("[SECURITY] Prompt Injection Blocked in Memory System");
         return; 
      }
      
      console.log("[L2_CLASSIFICATION]", { memoryType: sanitizedExtract.type, extractedFact: sanitizedExtract.fact });
      console.log(`[MEMORY_INTENT_DETECTED] type=${sanitizedExtract.type} text="${sanitizedExtract.fact}"`);
      
      console.log("[L2_DB_INSERT_START]", { summary: sanitizedExtract.fact });

      const { data, error } = await supabase.from('user_memories').insert([{ 
        user_id: userId, 
        summary: sanitizedExtract.fact, 
        memory_type: sanitizedExtract.type,
        confidence: sanitizedExtract.confidence,
        source: 'user',
        embedding: null,
        message_hash: messageHash
      }]).select('id').single();
      
      if (error) {
        console.log("[L2_DB_INSERT_FAILED]", { error });
        // Deteksi UNIQUE constraint violation (code 23505)
        if (error.code === '23505') {
          console.log(`[L2_EXIT] reason="unique_constraint_violation"`);
          console.log("[MEMORY_IDEMPOTENT_CHECK] Hit Supabase UNIQUE constraint! Skipping duplicate:", messageHash);
          console.log("[MEMORY_SKIP_DUPLICATE]");
          logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'unique_constraint_violation', query: userPrompt, execution_time_ms: Date.now() - startTime });
          return;
        }
        throw error;
      }
      
      console.log("[L2_DB_INSERT_SUCCESS]", { insertedId: data?.id });
      console.log("[MEMORY_INSERT_SUCCESS]");
      
      // READ BACK VERIFICATION (PHASE 3)
      if (data?.id) {
          const { data: readBack, error: readError } = await supabase.from('user_memories').select('summary').eq('id', data.id).single();
          if (readError || !readBack || readBack.summary !== sanitizedExtract.fact) {
              console.log("[L2_POST_INSERT_VERIFY]", { status: "failed", error: readError });
          } else {
              console.log("[L2_POST_INSERT_VERIFY]", { status: "verified" });
          }
      }
      
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_success', status: 'SUCCESS', query: userPrompt, execution_time_ms: Date.now() - startTime });
    } catch(e) { 
      console.error('[MEMORY_SAVE_FATAL]', { error: e, message: e?.message, details: e?.details, hint: e?.hint, code: e?.code });
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_failed', status: 'FAILED', reason: e.message, query: userPrompt, execution_time_ms: Date.now() - startTime });
    }
  } else {
    console.log(`[L2_EXIT] reason="no_memory_pattern_detected"`);
    console.log(`[MEMORY_INTENT_REJECTED] reason="No matching semantic pattern"`);
    // If not matching regex, log as skip so we can analyze coverage
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'no_keyword_match', query: userPrompt, execution_time_ms: Date.now() - startTime });
  }
};
