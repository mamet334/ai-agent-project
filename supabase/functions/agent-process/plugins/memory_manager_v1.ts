import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export const getEmbedding = async (text: string, geminiKey: string): Promise<number[]> => {
  // 1. Try Gemini Embedding
  if (geminiKey) {
    try {
      console.log(`[EMBEDDING START] Trying Gemini. Text: "${text.substring(0, 50)}..."`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: 'models/gemini-embedding-001', 
          content: { parts: [{ text }] },
          outputDimensionality: 768
        })
      });
      if (res.ok) {
        const data = await res.json();
        const values = data.embedding?.values || [];
        if (values.length > 0) {
          console.log(`[EMBEDDING SUCCESS] provider=gemini dimension=${values.length}`);
          return values;
        }
      } else {
        console.error(`[EMBEDDING GEMINI FAILED] Status: ${res.status}`);
      }
    } catch (e) {
      console.error("[EMBEDDING GEMINI FAILED]", e);
    }
  }

  // 2. Try OpenAI Embedding (text-embedding-3-small = 1536 dims, truncate to 768)
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (openaiKey) {
    try {
      console.log(`[EMBEDDING START] Trying OpenAI fallback.`);
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
          dimensions: 768
        })
      });
      if (res.ok) {
        const data = await res.json();
        const values = data.data?.[0]?.embedding || [];
        if (values.length > 0) {
          console.log(`[EMBEDDING SUCCESS] provider=openai dimension=${values.length}`);
          return values;
        }
      } else {
        console.error(`[EMBEDDING OPENAI FAILED] Status: ${res.status}`);
      }
    } catch (e) {
      console.error("[EMBEDDING OPENAI FAILED]", e);
    }
  }

  console.error('[EMBEDDING FAILED] All embedding providers exhausted.');
  return [];
};

const getNormalizedHash = async (text: string): Promise<string> => {
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(normalizedText));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const saveFactDirectly = async (fact: string, userId: string, supabaseUrl: string, supabaseKey: string, geminiKey: string) => {
  const safeUserId = String(userId || '').toLowerCase().trim();
  if (!safeUserId || !fact) return;

  const logToDb = async (eventType: string, message: string) => {
    try {
      const client = createClient(supabaseUrl, supabaseKey);
      await client.from('agent_logs').insert([{
        user_id: safeUserId || null,
        event_type: eventType,
        provider: 'system',
        message: `[Memory Direct Save] ${message}`
      }]);
    } catch (e: any) {
      console.error("Failed to write log to DB:", e);
    }
  };

  try {
    await logToDb('memory_save_start', `Starting direct save. userId=${safeUserId}`);

    const embedding = await getEmbedding(fact, geminiKey);
    if (embedding.length === 0) {
      await logToDb('memory_save_abort', `Embedding generation failed for fact: "${fact}"`);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Calculate normalized hash
    const normalizedHash = await getNormalizedHash(fact);

    // 1. Check semantic similarity duplicate (threshold 0.85)
    const { data: existingSimilar, error: matchError } = await supabase.rpc('match_memories', {
      query_embedding: embedding, 
      match_threshold: 0.85, 
      match_count: 1, 
      target_user_id: safeUserId
    });

    if (matchError) {
      await logToDb('memory_error', `match_memories RPC failed: ${matchError.message}`);
      throw matchError;
    }

    if (existingSimilar && existingSimilar.length > 0) {
      await logToDb('memory_duplicate_skipped', `Skipped direct save (similar): "${fact}" (score: ${existingSimilar[0].similarity.toFixed(4)})`);
      return;
    }

    // 2. Perform UPSERT with conflict target (user_id, normalized_memory_hash)
    const { error: upsertError } = await supabase.from('user_memories').upsert(
      [{ 
        user_id: safeUserId, 
        summary: fact, 
        embedding: embedding,
        normalized_memory_hash: normalizedHash
      }], 
      { onConflict: 'user_id,normalized_memory_hash' }
    );

    if (upsertError) {
      await logToDb('memory_insert_failed', `Upsert failed: ${upsertError.message}`);
      throw upsertError;
    } else {
      await logToDb('memory_insert_success', `Saved memory: "${fact}"`);
    }

  } catch (e: any) {
    await logToDb('memory_error', `Exception in direct save: ${e.message}`);
    throw e;
  }
};

/**
 * 1. RETRIEVAL FUNCTION (SINKRON)
 * Mengambil ingatan lama user untuk disuntikkan ke prompt utama.
 */
export const retrieveMemories = async (userPrompt: string, userId: string, supabaseUrl: string, supabaseKey: string, geminiKey: string): Promise<string> => {
  const safeUserId = String(userId || '').toLowerCase().trim();
  if (!safeUserId || !userPrompt) return '';
  
  // Mencegah pencarian untuk prompt yang sangat pendek/kosong
  if (userPrompt.trim().length < 4) return '';
  
  try {
    console.log(`[MATCH_MEMORIES START] userId=${safeUserId} query="${userPrompt.substring(0, 50)}..."`);
    const embedding = await getEmbedding(userPrompt, geminiKey);
    if (embedding.length === 0) return '';

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Stage 1 & 2: We query with the expanded recall threshold (0.65)
    // and then log/categorize them by precision in the application logic.
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: 0.65, 
      match_count: 5,        
      target_user_id: safeUserId
    });

    if (error) {
      console.error(`[Memory Error] match_memories RPC failed:`, error);
      return '';
    }

    const count = data ? data.length : 0;
    console.log(`[MATCH_MEMORIES RESULT] count=${count}`);

    if (!data || data.length === 0) return '';

    // Log the similarity scores and stages for debugging
    console.log("--- Multi-Stage Memory Retrieval Analysis ---");
    data.forEach((item: any) => {
      const score = item.similarity;
      const stage = score >= 0.75 ? "Stage 1 (High Precision >= 0.75)" : "Stage 2 (Expanded Recall >= 0.65)";
      console.log(`[RETRIEVAL SCORE] Score: ${score.toFixed(4)} | ${stage} | Memory: "${item.summary}"`);
    });
    console.log("---------------------------------------------");
    
    const memoryIds = data.map((d: any) => d.id);
    const memoryTexts = data.map((d: any) => `- ${d.summary}`).join('\n');
    console.log(`[Memory Retrieval] Found ${data.length} memories for user ${safeUserId}.`);

    // Update last_used_at dan memory_hits
    supabase.rpc('update_memory_stats', { memory_ids: memoryIds })
      .then(({ error: statsError }) => {
         if (statsError) console.error("[Memory Error] Failed to update memory stats:", statsError);
      });

    return `\n\n[INGATAN JANGKA PANJANG TENTANG USER (Relevan dengan topik saat ini)]\n${memoryTexts}\n(Gunakan ingatan di atas HANYA jika relevan untuk menjawab pesan saat ini)\n`;
  } catch (e) {
    console.error("[Memory Error] Retrieval error:", e);
    return '';
  }
};

/**
 * Regex-based intent detection for Stage 1 rule filter
 */
const matchRegexRules = (text: string): boolean => {
  const clean = text.trim().toLowerCase();
  const rules = [
    // Identity declarations
    /^(saya\s+)?panggil\s+saya\s+/i,
    /^nama\s+saya\s+/i,
    /^nama\s+panggilan\s+saya\s+/i,
    /^(saya\s+)?nama\s+panggilannya\s+/i,
    // Long-term preferences
    /^saya\s+suka\s+/i,
    /^saya\s+tidak\s+suka\s+/i,
    /^saya\s+benci\s+/i,
    /^hobi\s+saya\s+/i,
    /^favorit\s+saya\s+/i,
    // Stable personal facts
    /^saya\s+bekerja\s+di\s+/i,
    /^pekerjaan\s+saya\s+/i,
    /^saya\s+alergi\s+/i,
    /^saya\s+tinggal\s+di\s+/i,
    /^alamat\s+saya\s+/i,
    // Explicit remember/note commands
    /^(tolong\s+)?(ingat|catat)\s+bahwa\s+/i,
    /^(tolong\s+)?(ingat|catat)\s+kalau\s+/i,
    /^(tolong\s+)?(ingat|catat)\s+nama\s+/i,
    /^(tolong\s+)?(ingat|catat)\s+preferensi\s+/i
  ];
  return rules.some(r => r.test(clean));
};

/**
 * Filter out obvious non-memory / temporal / transactional text
 */
const shouldReject = (text: string): boolean => {
  const clean = text.trim().toLowerCase();
  
  // 1. Temporal info
  const temporalKeywords = [
    'hari ini', 'besok', 'kemarin', 'lusa', 'nanti', 'tadi', 
    'sekarang', 'minggu ini', 'bulan ini', 'tahun ini',
    'today', 'tomorrow', 'yesterday'
  ];
  if (temporalKeywords.some(kw => clean.includes(kw))) return true;

  // 2. General informational questions (ends with ? or starts with/contains question words)
  if (clean.endsWith('?')) return true;
  const questionWords = ['apakah', 'bagaimana', 'kenapa', 'mengapa', 'dimana', 'kapan', 'siapa', 'berapa'];
  if (questionWords.some(qw => clean.startsWith(qw) || clean.includes(' ' + qw + ' '))) return true;

  // 3. Transactional requests
  const transactionalKeywords = [
    'beli', 'order', 'bayar', 'checkout', 'keranjang', 
    'transfer', 'harga', 'ongkir', 'kirim', 'pesan tiket'
  ];
  if (transactionalKeywords.some(kw => clean.includes(kw))) return true;

  return false;
};

/**
 * 2. CLASSIFIER & SAVE FUNCTION (ASINKRON / BACKGROUND)
 * Menganalisis obrolan dan menyimpan fakta penting ke Supabase tanpa memblokir UI.
 */
export const processAndSaveMemory = async (userPrompt: string, aiResponse: string, userId: string, supabaseUrl: string, supabaseKey: string, geminiKey: string, groqKey: string) => {
  const safeUserId = String(userId || '').toLowerCase().trim();
  if (!safeUserId || !userPrompt || !aiResponse) return;
  // Don't bail out if geminiKey is missing — we have multi-provider fallback

  const logToDb = async (eventType: string, message: string) => {
    try {
      const client = createClient(supabaseUrl, supabaseKey);
      await client.from('agent_logs').insert([{
        user_id: safeUserId || null,
        event_type: eventType,
        provider: 'system',
        message: `[Memory Manager V1] ${message}`
      }]);
    } catch (e: any) {
      console.error("Failed to write log to DB:", e);
    }
  };

  try {
    const safePrompt = userPrompt.substring(0, 1000);
    await logToDb('memory_save_start', `Starting process. userId=${safeUserId}, prompt_length=${safePrompt.length}`);

    // Helper for LLM generation (Groq -> fallback Gemini)
    const generateText = async (sys: string, user: string): Promise<string> => {
      // 1. Try Groq
      if (groqKey) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
              temperature: 0.1,
              max_tokens: 50
            })
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content?.trim();
            if (text) return text;
          }
        } catch (e: any) { 
          await logToDb('memory_warning', `Groq failed: ${e.message}. Falling back to Gemini.`);
        }
      }
      
      // 2. Try Gemini
      if (geminiKey) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: user }] }],
              systemInstruction: { parts: [{ text: sys }] },
              generationConfig: { temperature: 0.1, maxOutputTokens: 50 }
            })
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) return text;
          }
        } catch (e: any) {
          await logToDb('memory_warning', `Gemini failed: ${e.message}. Falling back to OpenRouter.`);
        }
      }

      // 3. Try OpenRouter
      const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
      if (openRouterKey) {
        try {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openRouterKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'anthropic/claude-sonnet-4.6',
              messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
              temperature: 0.1,
              max_tokens: 50
            })
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content?.trim();
            if (text) return text;
          }
        } catch (e: any) {
          await logToDb('memory_warning', `OpenRouter failed: ${e.message}. Falling back to OpenAI.`);
        }
      }

      // 4. Try OpenAI
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey) {
        try {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
              temperature: 0.1,
              max_tokens: 50
            })
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content?.trim();
            if (text) return text;
          }
        } catch (e: any) {
          await logToDb('memory_warning', `OpenAI failed: ${e.message}.`);
        }
      }

      throw new Error("All memory classifier fallback providers failed.");
    };

    // STAGE 1: RULE-BASED FILTER
    if (shouldReject(safePrompt)) {
      await logToDb('memory_classifier_skipped', `Prompt rejected by Rule Filter (Temporal/Transactional/Question category).`);
      return;
    }

    if (!matchRegexRules(safePrompt)) {
      await logToDb('memory_classifier_skipped', `Prompt rejected by Rule Filter (No regex intent matched).`);
      return;
    }

    await logToDb('memory_classifier_rules_passed', `Stage 1 rule filter passed.`);

    // STAGE 2: LLM CONFIRMATION (ONLY passing userPrompt to avoid context leak)
    const classPrompt = `You are a Long-Term Memory Classifier.
Analyze the User message below. Does the User declare a permanent personal fact, stable identity detail, or a long-term preference about themselves that should be remembered?
Answer ONLY "YA" or "TIDAK". Do not write any other explanation or words.

Examples of YA:
- "Nama asli saya Slamet"
- "Saya sangat menyukai kopi hitam tanpa gula"
- "Saya alergi terhadap obat aspirin"

Examples of TIDAK:
- "Ingatkan saya untuk membeli susu besok" (Temporal/Transactional task)
- "Saya sedang makan nasi goreng" (Temporal action)
- "Apa ibu kota dari Indonesia?" (General query)
`;

    const rawDecision = await generateText(classPrompt, safePrompt);
    const decision = rawDecision.toUpperCase() || 'TIDAK';
    await logToDb('memory_classifier_result', `LLM decision: ${decision}`);

    if (!decision.includes('YA')) {
      return; 
    }

    // 2. SUMMARIZER — embed full user statement directly in the user message
    const sumSys = 'Kamu adalah memory summarizer. Tugasmu: ekstrak FAKTA PERSONAL tentang User dari pesan di bawah. Gunakan bahasa Indonesia. Maksimal 1 kalimat pendek (≤15 kata), sudut pandang orang ketiga. Contoh output: "Nama panggilan user adalah Pak Slamet". Jika tidak ada fakta personal, tulis: SKIP.';
    const sumUser = `Pesan User: "${safePrompt}"

Ekstrak fakta personalnya:`;
    const summary = await generateText(sumSys, sumUser);

    await logToDb('memory_summarizer_result', `Summary: ${summary}`);

    if (!summary || summary.length < 5 || summary.toUpperCase().startsWith('SKIP')) {
      await logToDb('memory_save_abort', `Summary empty, too short, or SKIP. Aborting. Summary: "${summary}"`);
      return;
    }

    // 3. STORAGE & HYBRID DEDUPLICATION
    const embedding = await getEmbedding(summary, geminiKey);
    if (embedding.length === 0) {
      await logToDb('memory_save_abort', `Embedding generation failed. Aborting.`);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const normalizedHash = await getNormalizedHash(summary);
    
    // Check semantic similarity (threshold 0.85)
    const { data: existingSimilar, error: matchError } = await supabase.rpc('match_memories', {
      query_embedding: embedding, 
      match_threshold: 0.85, 
      match_count: 1, 
      target_user_id: safeUserId
    });

    if (matchError) {
      await logToDb('memory_error', `match_memories RPC failed: ${matchError.message}`);
      throw matchError;
    }

    if (existingSimilar && existingSimilar.length > 0) {
      await logToDb('memory_duplicate_skipped', `Skipped semantically similar: "${summary}" (score: ${existingSimilar[0].similarity.toFixed(4)})`);
      return;
    }

    // Insert/Upsert to table (ensures idempotency via normalized hash unique key)
    const { error: insertError } = await supabase.from('user_memories').upsert(
      [{ 
        user_id: safeUserId, 
        summary: summary, 
        embedding: embedding,
        normalized_memory_hash: normalizedHash
      }],
      { onConflict: 'user_id,normalized_memory_hash' }
    );

    if (insertError) {
      await logToDb('memory_insert_failed', `Upsert failed: ${insertError.message}`);
      throw insertError;
    } else {
      await logToDb('memory_insert_success', `Saved memory: "${summary}"`);
    }

  } catch (e: any) {
    await logToDb('memory_error', `Exception: ${e.message}`);
  }
};
