import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export const getEmbedding = async (text: string, geminiKey: string) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] } })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.embedding?.values || [];
  } catch (e) {
    console.error("[Memory Error] Embedding API failed", e);
    return [];
  }
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

    // Cek duplikasi
    const { data: existingData, error: matchError } = await supabase.rpc('match_memories', {
      query_embedding: embedding, 
      match_threshold: 0.98, 
      match_count: 1, 
      target_user_id: safeUserId
    });

    if (matchError) {
      await logToDb('memory_error', `match_memories RPC failed: ${matchError.message}`);
      throw matchError;
    }

    if (existingData && existingData.length > 0) {
      await logToDb('memory_duplicate_skipped', `Skipped duplicate: "${fact}"`);
      return;
    }

    // Insert
    const { error: insertError } = await supabase.from('user_memories').insert([{ 
      user_id: safeUserId, 
      summary: fact, 
      embedding: embedding 
    }]);

    if (insertError) {
      await logToDb('memory_insert_failed', `Insert failed: ${insertError.message}`);
      throw insertError;
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
    const embedding = await getEmbedding(userPrompt, geminiKey);
    if (embedding.length === 0) return '';

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Evaluasi threshold: Diturunkan ke 0.70 agar lebih mudah terpanggil.
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: 0.70, 
      match_count: 5,        
      target_user_id: safeUserId
    });

    if (error || !data || data.length === 0) return '';
    
    const memoryIds = data.map((d: any) => d.id);
    const memoryTexts = data.map((d: any) => `- ${d.summary}`).join('\n');
    console.log(`[Memory Retrieval] Found ${data.length} highly relevant memories for user ${safeUserId}.`);

    // Update last_used_at dan memory_hits secara asinkron agar tidak memblokir retrieval
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
 * 2. CLASSIFIER & SAVE FUNCTION (ASINKRON / BACKGROUND)
 * Menganalisis obrolan dan menyimpan fakta penting ke Supabase tanpa memblokir UI.
 */
export const processAndSaveMemory = async (userPrompt: string, aiResponse: string, userId: string, supabaseUrl: string, supabaseKey: string, geminiKey: string, groqKey: string) => {
  const safeUserId = String(userId || '').toLowerCase().trim();
  if (!safeUserId || !userPrompt || !aiResponse) return;
  if (!geminiKey) return; // Gemini is mandatory fallback

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
    const chatContext = `User: ${safePrompt}\nAI: ${aiResponse}`;

    await logToDb('memory_save_start', `Starting process. userId=${safeUserId}, prompt_length=${safePrompt.length}`);

    // Helper for LLM generation (Groq -> fallback Gemini)
    const generateText = async (sys: string, user: string): Promise<string> => {
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
      // Fallback Gemini
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: user }] }],
          systemInstruction: { parts: [{ text: sys }] },
          generationConfig: { temperature: 0.1, maxOutputTokens: 50 }
        })
      });
      if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    };

    // 1. CLASSIFIER (WITH HEURISTIC BYPASS)
    let decision = 'TIDAK';
    const lowerPrompt = safePrompt.toLowerCase();
    
    if (lowerPrompt.includes('ingat') || lowerPrompt.includes('catat') || lowerPrompt.includes('panggil saya') || lowerPrompt.includes('nama saya') || lowerPrompt.includes('saya suka')) {
       decision = 'YA';
       await logToDb('memory_classifier_bypass', `Bypassed classifier via heuristic: YA`);
    } else {
       const classPrompt = 'You are a Memory Classifier. Analyze ONLY the User message. Does the User mention explicit personal facts, identity details, long-term preferences, or commands to remember something? Reply ONLY with "YA" or "TIDAK". Do not explain.';
       const rawDecision = await generateText(classPrompt, chatContext);
       decision = rawDecision.toUpperCase() || 'TIDAK';
       await logToDb('memory_classifier_result', `Classifier decision: ${decision}`);
    }

    if (!decision.includes('YA')) {
      return; 
    }

    // 2. SUMMARIZER
    const sumPrompt = 'Ekstrak dan rangkum FAKTA PERSONAL TENTANG USER dari teks berikut. Gunakan bahasa Indonesia. Maksimal 1 kalimat pendek dan padat (maksimal 15 kata). Gunakan sudut pandang orang ketiga (contoh: "User suka kopi hitam"). Abaikan sapaan atau percakapan basa-basi. Jangan merangkum jawaban AI, fokus murni pada fakta/identitas/kebutuhan User.';
    const summary = await generateText(sumPrompt, chatContext);

    await logToDb('memory_summarizer_result', `Summary: ${summary}`);

    if (!summary || summary.length < 5) {
      await logToDb('memory_save_abort', `Summary empty or too short. Aborting.`);
      return;
    }

    // 3. STORAGE & DEDUPLICATION
    const embedding = await getEmbedding(summary, geminiKey);
    if (embedding.length === 0) {
      await logToDb('memory_save_abort', `Embedding generation failed. Aborting.`);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Cek duplikasi via similarity (>0.98 mirip = anggap duplikat)
    const { data: existingData, error: matchError } = await supabase.rpc('match_memories', {
      query_embedding: embedding, 
      match_threshold: 0.98, 
      match_count: 1, 
      target_user_id: safeUserId
    });

    if (matchError) {
      await logToDb('memory_error', `match_memories RPC failed: ${matchError.message}`);
      throw matchError;
    }

    if (existingData && existingData.length > 0) {
      await logToDb('memory_duplicate_skipped', `Skipped duplicate: "${summary}"`);
      return;
    }

    // Insert ke tabel
    const { error: insertError } = await supabase.from('user_memories').insert([{ 
      user_id: safeUserId, 
      summary: summary, 
      embedding: embedding 
    }]);

    if (insertError) {
      await logToDb('memory_insert_failed', `Insert failed: ${insertError.message}`);
      throw insertError;
    } else {
      await logToDb('memory_insert_success', `Saved memory: "${summary}"`);
    }

    // [Memory Cleanup] Trigger cleanup periodically in background (10% probability)
    if (Math.random() < 0.1) {
      supabase.rpc('cleanup_memories').then(() => {
        logToDb('memory_cleanup', 'Background cleanup triggered successfully.');
      }).catch(e => {
        logToDb('memory_error', `Cleanup failed: ${e.message}`);
      });
    }

  } catch (e: any) {
    await logToDb('memory_error', `Exception: ${e.message}`);
  }
};
