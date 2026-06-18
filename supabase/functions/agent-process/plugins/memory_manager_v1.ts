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
     return '';
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[COST LEAK DETECTION] memoryFetchCount: 1');
    // Ambil max 10 memory terakhir
    const { data } = await supabase.from('user_memories').select('summary, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10);
    if (!data || data.length === 0) return '';
    
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
       
       return { ...mem, score };
    });
    
    // Sort by score (descending) and take top 5
    scoredMemories.sort((a, b) => b.score - a.score);
    const topMemories = scoredMemories.slice(0, 5);
    
    if (topMemories.length === 0 || topMemories[0].score === 0) {
       // If no relevance, return top 3 most recent
       return '\n\n[MEMORI USER]:\n' + data.slice(0, 3).map(d => '- ' + d.summary).join('\n') + '\n';
    }
    
    let memoryTexts = topMemories.map(d => '- ' + d.summary).join('\n');
    
    // CONTEXT HARD LIMIT: Max 3000 chars
    if (memoryTexts.length > 3000) {
       memoryTexts = memoryTexts.substring(0, 3000) + '...';
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
    
    return '\n\n[MEMORI USER]:\n' + memoryTexts + '\n';
  } catch (e) {
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_retrieval_failed', status: 'FAILED', reason: e.message, query: userPrompt, execution_time_ms: Date.now() - startTime });
    return '';
  }
};

export const processAndSaveMemory = async (userPrompt, aiResponse, userId, supabaseUrl, supabaseKey) => {
  console.log("[MEMORY_CALL]", {
    time: Date.now(),
    message: userPrompt,
    stack: new Error().stack
  });
  const startTime = Date.now();
  console.log('[MEMORY_TRIGGER]', userPrompt);
  if (!userId || !userPrompt) {
     logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_failed', status: 'FAILED', reason: 'missing_user_or_prompt', query: userPrompt, execution_time_ms: Date.now() - startTime });
     return;
  }
  const lower = userPrompt.toLowerCase().trim();
  
  // GUARD CLAUSE: Deteksi Retrieval Intent
  const isRetrievalIntent = lower.includes('?') || /^(?:apa|kapan|siapa|dimana|di mana|bagaimana|tampilkan|sebutkan|cek|lihat|beritahu|apakah|adakah)\b/i.test(lower);
  
  if (isRetrievalIntent) {
    console.log('[MEMORY_SAVE_SKIPPED_RETRIEVAL]', userPrompt);
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'detected_as_retrieval_query', query: userPrompt, execution_time_ms: Date.now() - startTime });
    return; // Keluar sebelum regex save dieksekusi
  }
  
  // SMART RULE-BASED EXTRACTION (NO AI COST)
  const memoryRegex = /(?:ingat|nama saya|panggil saya|saya suka|jangan lupa|favorit saya|saya alergi|kebiasaan saya|catat ini|penting:|project saya|tugas saya|deadline|tenggat waktu|harus selesai|riset|catatan riset|besok saya harus|jadwal|target|fokus hari ini)/i;
  
  const shouldSave = memoryRegex.test(lower);
  
  if (shouldSave) {
    try {
      console.log('[MEMORY_SAVE_START]');
      
      // 1. IDENTITY LAYER: Generate Unique Fingerprint
      const messageHash = await generateMemoryHash(userId, lower);
      
      // 2. IDEMPOTENCY CHECK (In-Memory)
      if (processedMemoryKeys.has(messageHash)) {
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
      
      // 3. DATABASE SAFETY: Insert dengan message_hash
      const { error } = await supabase.from('user_memories').insert([{ 
        user_id: userId, 
        summary: userPrompt.substring(0, 300), 
        embedding: null,
        message_hash: messageHash
      }]);
      
      if (error) {
        // Deteksi UNIQUE constraint violation (code 23505)
        if (error.code === '23505') {
          console.log("[MEMORY_IDEMPOTENT_CHECK] Hit Supabase UNIQUE constraint! Skipping duplicate:", messageHash);
          console.log("[MEMORY_SKIP_DUPLICATE]");
          logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'unique_constraint_violation', query: userPrompt, execution_time_ms: Date.now() - startTime });
          return;
        }
        throw error;
      }
      
      console.log("[MEMORY_INSERT_SUCCESS]");
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_success', status: 'SUCCESS', query: userPrompt, execution_time_ms: Date.now() - startTime });
    } catch(e) { 
      console.error('[MEMORY_SAVE_FAILED]', e);
      logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_failed', status: 'FAILED', reason: e.message, query: userPrompt, execution_time_ms: Date.now() - startTime });
    }
  } else {
    // If not matching regex, log as skip so we can analyze coverage
    logMemoryAudit(supabaseUrl, supabaseKey, { user_id: userId, event_type: 'memory_save_skipped', status: 'SUCCESS', reason: 'no_keyword_match', query: userPrompt, execution_time_ms: Date.now() - startTime });
  }
};
