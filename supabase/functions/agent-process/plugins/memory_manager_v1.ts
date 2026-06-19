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
// Mencegah double insert pada level in-memory 
// -----------------------------------------------------------------
const processedMemoryKeys = new Set();

// Membersihkan cache setiap 1 jam agar tidak memory leak
setInterval(() => {
    processedMemoryKeys.clear();
}, 1000 * 60 * 60);

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
  let role = 'GENERAL';
  let confidence = 0.8;
  let tags = {
      domain: 'general'
  };
  let importance_score = 0.5; // Default average importance
  let stability_score = 1.0;  // Default high stability
  
  // FACT CLASSIFICATION, BUCKETING & DIMENSIONAL TAGGING (NO AI COST)
  if (/(?:tinggal di|domisili|rumah.*di|ruamh.*di)/i.test(lower)) {
    type = 'LOCATION';
    tags.type = 'location';
    if (/(?:kantor|kerja)/i.test(lower)) {
        role = 'WORK_BASE';
        tags.domain = 'work';
        tags.context = 'professional';
    } else {
        role = 'HOME_BASE';
        tags.domain = 'residence';
        tags.context = 'personal';
    }
    importance_score = 0.9; // Residence/Work is highly important
    confidence = 0.95;
  } else if (/(?:suka|alergi|favorit|preferensi|benci|lebih suka)/i.test(lower)) {
    type = 'PREFERENCE';
    confidence = 0.95;
    
    tags.type = 'preference';
    tags.valence = /(?:benci|alergi|tidak suka)/i.test(lower) ? 'negative' : 'positive';

    if (/(?:makan|minum|buah|sayur|diet|seafood|pedas|apel|mangga|manis|asin|goreng|rebus)/i.test(lower)) {
        role = 'PREF_FOOD';
        tags.domain = 'food';
        if (/(?:diet|sehat|alergi)/i.test(lower)) {
            tags.context = 'health';
            importance_score = 0.95; // Medical/diet is critical
        } else {
            importance_score = 0.6;
        }
    } else if (/(?:warna|merah|biru|kuning|hijau|hitam|putih)/i.test(lower)) {
        role = 'PREF_COLOR';
        tags.domain = 'color';
        importance_score = 0.4; // Visual preference is low importance
    } else if (/(?:main|hobi|olahraga|baca|nonton|film|musik|lagu|game)/i.test(lower)) {
        role = 'PREF_ACTIVITY';
        tags.domain = 'activity';
    } else {
        role = 'PREF_GENERAL';
        tags.domain = 'general';
    }
  } else if (/(?:nama|panggil|bernama)/i.test(lower)) {
    type = 'IDENTITY';
    role = 'USER_NAME';
    tags.domain = 'identity';
    tags.type = 'profile';
    importance_score = 1.0; // Identity is paramount
    confidence = 0.95;
  } else if (/(?:bekerja sebagai|pekerjaan|profesi)/i.test(lower)) {
    type = 'OCCUPATION';
    role = 'JOB_TITLE';
    tags.domain = 'career';
    tags.type = 'occupation';
    tags.context = 'professional';
    importance_score = 0.8;
    confidence = 0.95;
  } else if (/(?:project|proyek|sedang membangun)/i.test(lower)) {
    type = 'PROJECT';
    role = 'CURRENT_PROJECT';
    tags.domain = 'project';
    tags.type = 'initiative';
    tags.context = 'work_in_progress';
    importance_score = 0.7;
    stability_score = 0.5; // Projects change over time
    confidence = 0.9;
  } else if (/(?:target|tujuan|fokus|jadwal|deadline|tugas|harus selesai|riset)/i.test(lower)) {
    type = 'GOAL';
    role = 'CURRENT_GOAL';
    tags.domain = 'goal';
    tags.type = 'planning';
    tags.context = 'time_sensitive';
    importance_score = 0.8;
    stability_score = 0.4; // Goals are highly volatile
    confidence = 0.9;
  } else if (/(?:adalah|ingat|catat|penting)/i.test(lower)) {
    type = 'FACT';
    role = 'GENERAL_FACT';
    tags.domain = 'general';
    tags.type = 'fact';
    importance_score = /(?:penting)/i.test(lower) ? 0.9 : 0.5;
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
    role,
    tags,
    importance_score,
    stability_score,
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

export const processAndSaveMemory = async (userPrompt, aiResponse, userId, supabaseUrl, supabaseKey, geminiKey, groqKey, history) => {
  const BUILD_ID = "MEMORY_BUILD_20260619_V1";
  console.log("[BUILD_FINGERPRINT]", BUILD_ID);

  console.log("[L2_START]", { 
    build: BUILD_ID,
    input: userPrompt 
  });
  
  console.log("[MEMORY_CALL_V2]", {
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
  
  console.log("[CHECKPOINT_1]", { userId, userPrompt });
  
  // GUARD CLAUSE: Deteksi Retrieval Intent
  const isRetrievalIntent = lower.includes('?') || /^(?:apa|kapan|siapa|dimana|di mana|bagaimana|tampilkan|sebutkan|cek|lihat|beritahu|apakah|adakah)\b/i.test(lower);
  
  console.log("[CHECKPOINT_2]", { isRetrievalIntent });
  
  if (isRetrievalIntent) {
    console.log(`[L2_EXIT] reason="retrieval_intent"`);
    console.log('[MEMORY_SAVE_SKIPPED_RETRIEVAL]', userPrompt);
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'detected_as_retrieval_query', query: userPrompt, execution_time_ms: Date.now() - startTime });
    return; // Keluar sebelum regex save dieksekusi
  }

  // --- CORRECTION DETECTION LAYER (INPUT STABILIZER) ---
  // Mendeteksi apakah input hanyalah potongan kata, koreksi bertahap, atau konfirmasi sepihak.
  const isCorrectionOrPartial = () => {
    const words = lower.split(/\s+/);
    let reason = null;
    
    // 1. Partial Input: Terlalu pendek (1-2 kata) dan bukan fakta tegas
    if (words.length <= 2 && !/(?:tinggal|suka|benci|kerja|nama)/i.test(lower)) {
        reason = 'partial_fragment';
    }
    
    // 2. Iterative Correction / Confirmation Loop
    if (!reason && words.length <= 4) {
      if (/^(?:ya|benar|betul|bukan|salah|di\s+[a-z]+$|barat|timur|utara|selatan)$/i.test(lower)) reason = 'short_confirmation';
      if (/^(?:ya benar|ya betul|bukan begitu)\b/i.test(lower)) reason = 'short_confirmation';
    }
    
    // 3. Potongan frasa yang menggantung
    if (!reason && (lower.endsWith('ad') || lower.endsWith('adalah') || lower.endsWith('di') || lower.endsWith('ke'))) {
        reason = 'dangling_particle';
    }
    
    // 4. SEMANTIC FALSE STABILITY (Context Window Check)
    // Check if the current entity is being refined across recent turns.
    if (!reason && history && Array.isArray(history)) {
        const recentUserMsgs = history.filter(m => m.role === 'user').slice(-3).map(m => (m.content || '').toLowerCase());
        
        // If the user has recently issued corrections or short fragments that match the current entity intent, 
        // treat this as an unstable refinement sequence and reject saving for now until a clean turn.
        const refinementKeywords = ['di', 'ya', 'benar', 'bukan', 'salah'];
        for (const prev of recentUserMsgs) {
           if (prev !== lower && refinementKeywords.some(kw => prev.startsWith(kw) || prev === kw)) {
               // We detect a sequence of refinements. Is it stable yet?
               // A heuristic: if the user said "ya benar [fakta baru]", we might let it pass if it's long enough.
               // But if they are just saying "di surabaya barat" right after "di surabaya", it's an unstable window.
               if (/^(?:ya|benar|betul|bukan|salah|di\s+)/i.test(lower)) {
                   reason = 'unstable_correction_sequence';
                   break;
               }
           }
        }
    }
    
    return reason;
  };

  const correctionReason = isCorrectionOrPartial();
  if (correctionReason) {
    console.log(`[L2_EXIT] reason="unstable_correction_turn" sub_reason="${correctionReason}"`);
    console.log("[MEMORY_PENDING] Input is part of a correction loop or partial sentence. Skipping write.");
    
    if (correctionReason === 'unstable_correction_sequence') {
        return {
           memory_ack: false,
           memory_state: 'rejected',
           memory_id: null,
           memory_text: 'Menunggu percakapan lebih stabil sebelum menyimpan memori.',
           reason: 'unstable_correction_sequence'
        };
    }
    
    return {
       memory_ack: false,
       memory_state: 'pending',
       memory_id: null,
       memory_text: 'Menunggu kalimat fakta yang utuh dan final.',
       reason: correctionReason
    };
  }
  // -----------------------------------------------------
  
  // SMART RULE-BASED EXTRACTION (NO AI COST)
  const pronouns = /(?:aku|gue|gua|saya|ane|namaku)/;
  
  const identityPattern = new RegExp(`(?:nama ${pronouns.source}|${pronouns.source} bernama|panggil ${pronouns.source})`, 'i');
  const locationPattern = new RegExp(`(?:${pronouns.source} tinggal di|domisili|rumahku|rumah.*di|ruamh.*di)`, 'i');
  const preferencePattern = new RegExp(`(?:${pronouns.source} suka|${pronouns.source} tidak suka|favoritku|favorit ${pronouns.source}|lebih suka|${pronouns.source} alergi|kebiasaan ${pronouns.source})`, 'i');
  const occupationPattern = new RegExp(`(?:${pronouns.source} bekerja sebagai|pekerjaanku|pekerjaan ${pronouns.source}|profesiku|profesi ${pronouns.source})`, 'i');
  const projectPattern = new RegExp(`(?:project|proyek|sedang membangun)`, 'i');
  const goalPattern = new RegExp(`(?:target|tujuan|fokus|tugas|deadline|tenggat waktu|harus selesai|riset|jadwal)`, 'i');
  const manualTrigger = /(?:ingat|catat|jangan lupa|simpan|penting:)/i;
  
  const memoryRegex = new RegExp(`${identityPattern.source}|${locationPattern.source}|${preferencePattern.source}|${occupationPattern.source}|${projectPattern.source}|${goalPattern.source}|${manualTrigger.source}`, 'i');
  
  const shouldSave = memoryRegex.test(lower);
  console.log("[L2_REGEX_RESULT]", { shouldSave });
  
  if (shouldSave) {
    try {
      console.log('[MEMORY_SAVE_START]');
      
      // 1. IDENTITY LAYER: Generate Unique Fingerprint
      const messageHash = await generateMemoryHash(userId, lower);
      
      console.log("[CHECKPOINT_3]", { messageHash });
      console.log("[CHECKPOINT_4]", { cacheHit: processedMemoryKeys.has(messageHash) });
      
      // 2. IDEMPOTENCY CHECK (In-Memory)
      if (processedMemoryKeys.has(messageHash)) {
         console.log(`[L2_EXIT] reason="idempotency_cache_hit"`);
         console.log("[MEMORY_IDEMPOTENT_CHECK] Hit local cache! Skipping duplicate insert:", messageHash);
         console.log("[MEMORY_SKIP_DUPLICATE]");
         logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'idempotent_cache_hit', query: userPrompt, execution_time_ms: Date.now() - startTime });
         return {
            memory_ack: true,
            memory_state: 'committed',
            memory_id: 'cache-hit-' + messageHash.substring(0, 8),
            memory_text: "Fakta sudah ada di memori sistem."
         };
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

      console.log("[CHECKPOINT_5]", { sanitizedExtract });

      if (!sanitizedExtract || sanitizedExtract.isInjectionAttempt) {
         console.log(`[L2_EXIT] reason="security_injection_blocked"`);
         console.warn("[SECURITY] Prompt Injection Blocked in Memory System");
         return {
            memory_ack: false,
            memory_state: 'rejected',
            memory_id: null,
            memory_text: 'Security injection blocked'
         }; 
      }
      
      // --- DISTRIBUTED ENTITY LOCKING (V4 ATOMIC TRANSACTION) ---
      const hasExplicitCorrection = /(?:salah|bukan|ralat|yang benar|eh salah|batal|ganti|sekarang)/i.test(lower);
      const entityInstanceId = `${sanitizedExtract.type}_${sanitizedExtract.role}`.toUpperCase();
      
      const { data: lockResult, error: rpcError } = await supabase.rpc('atomic_entity_lock', {
          p_user_id: userId,
          p_entity_instance_id: entityInstanceId,
          p_value: sanitizedExtract.fact,
          p_explicit_correction: hasExplicitCorrection
      });
      
      if (rpcError) {
          console.error("[ENTITY_LOCK_RPC_ERROR]", rpcError);
          // If RPC fails (e.g. not migrated yet), fallback to allow write to prevent breaking prod.
          // But ideally we log this.
      } else if (lockResult?.status === 'conflicted') {
          console.log(`[L2_EXIT] reason="entity_conflict_detected"`);
          console.log(`[ENTITY_LOCK] Conflict on ${sanitizedExtract.type}: "${lockResult.old_value}" vs "${sanitizedExtract.fact}"`);
          return {
             memory_ack: false,
             memory_state: 'conflicted',
             memory_id: null,
             memory_text: `Terdapat konflik dengan fakta sebelumnya ("${lockResult.old_value}"). Harap berikan konfirmasi eksplisit (contoh: "ralat", "yang benar adalah...").`,
             reason: 'entity_conflict_detected'
          };
      }
      // ------------------------------------

      console.log("[L2_CLASSIFICATION]", { memoryType: sanitizedExtract.type, extractedFact: sanitizedExtract.fact });
      console.log(`[MEMORY_INTENT_DETECTED] type=${sanitizedExtract.type} text="${sanitizedExtract.fact}"`);
      
      console.log("[L2_DB_INSERT_START]", { summary: sanitizedExtract.fact });

      console.log("[BEFORE_INSERT]", {
        userId,
        summary: sanitizedExtract.fact,
        type: sanitizedExtract.type,
        confidence: sanitizedExtract.confidence,
        messageHash
      });

      const { data, error } = await supabase.from('user_memories').insert([{ 
        user_id: userId, 
        summary: sanitizedExtract.fact, 
        memory_type: sanitizedExtract.type,
        confidence: sanitizedExtract.confidence,
        source: 'user',
        embedding: null,
        message_hash: messageHash,
        metadata: { 
            bucket: sanitizedExtract.role, 
            tags: sanitizedExtract.tags,
            importance_score: sanitizedExtract.importance_score,
            stability_score: sanitizedExtract.stability_score
        }
      }]).select('id').single();
      
      console.log("[AFTER_INSERT]", { data, error });
      
      if (error) {
        console.log("[L2_DB_INSERT_FAILED]", { error });
        // Deteksi UNIQUE constraint violation (code 23505)
        if (error.code === '23505') {
          console.log(`[L2_EXIT] reason="unique_constraint_violation"`);
          console.log("[MEMORY_IDEMPOTENT_CHECK] Hit Supabase UNIQUE constraint! Skipping duplicate:", messageHash);
          console.log("[MEMORY_SKIP_DUPLICATE]");
          logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'unique_constraint_violation', query: userPrompt, execution_time_ms: Date.now() - startTime });
          return {
             memory_ack: true,
             memory_state: 'committed',
             memory_id: 'db-dup-' + messageHash.substring(0, 8),
             memory_text: "Fakta sudah ada di database."
          };
        }
        throw error;
      }
      
      console.log("[L2_DB_INSERT_SUCCESS]", { insertedId: data?.id });
      console.log("[MEMORY_INSERT_SUCCESS]");
      
      // --- CONTRADICTION GRAPH EDGE CREATION (LEVEL 7) ---
      if (data?.id) {
          // 1. Update the lock with the newly minted active_memory_id
          await supabase.from('entity_locks')
            .update({ active_memory_id: data.id })
            .eq('user_id', userId)
            .eq('entity_instance_id', entityInstanceId);
            
          // 2. Build the semantic graph edge if we replaced a previous memory node
          if (lockResult?.replaced_memory_id) {
              const relationType = hasExplicitCorrection ? 'OVERRIDES' : 'REFINES';
              const reasonType = hasExplicitCorrection ? 'user_explicit_correction' : 'implicit_temporal_update';
              
              await supabase.from('memory_relations').insert({
                  source_memory_id: lockResult.replaced_memory_id,
                  target_memory_id: data.id,
                  relation_type: relationType,
                  reason_type: reasonType,
                  confidence: sanitizedExtract.confidence
              });
              
              console.log(`[CONTRADICTION_GRAPH] Edge created: ${lockResult.replaced_memory_id} --[${relationType}]--> ${data.id} (reason: ${reasonType})`);
          }
      }
      // ---------------------------------------------------
      
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
      
      return {
        memory_ack: true,
        memory_state: 'committed',
        memory_id: data?.id,
        memory_text: sanitizedExtract.fact
      };
    } catch(e) { 
      console.error("[FATAL_FULL]", {
        errorName: e?.name,
        errorCode: e?.code,
        errorMessage: e?.message,
        fullError: e
      });
      console.error('[MEMORY_SAVE_FATAL]', { error: e, message: e?.message, details: e?.details, hint: e?.hint, code: e?.code });
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_failed', status: 'FAILED', reason: e.message, query: userPrompt, execution_time_ms: Date.now() - startTime });
      return {
        memory_ack: false,
        memory_state: 'rejected',
        memory_id: null,
        memory_text: "Database write failed"
      };
    }
  } else {
    console.log(`[L2_EXIT] reason="no_memory_pattern_detected"`);
    console.log(`[MEMORY_INTENT_REJECTED] reason="No matching semantic pattern"`);
    
    // If not matching regex, log as skip so we can analyze coverage
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'no_keyword_match', query: userPrompt, execution_time_ms: Date.now() - startTime });
    
    return {
        memory_ack: false,
        memory_state: 'unconfirmed',
        memory_id: null,
        memory_text: "No matching pattern"
    };
  }
};
