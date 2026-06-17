import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const getEmbedding = async (text: string, geminiKey: string) => {
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

/**
 * 1. RETRIEVAL FUNCTION (SINKRON)
 * Mengambil ingatan lama user untuk disuntikkan ke prompt utama.
 */
export const retrieveMemories = async (userPrompt: string, userId: string, supabaseUrl: string, supabaseKey: string, geminiKey: string): Promise<string> => {
  const safeUserId = String(userId || '').toLowerCase().trim();
  if (!safeUserId || !userPrompt) return '';
  
  // Mencegah pencarian untuk prompt pendek (contoh: "halo", "ok") yang tidak punya nilai semantik
  if (userPrompt.trim().split(/\s+/).length <= 2) return '';
  
  try {
    const embedding = await getEmbedding(userPrompt, geminiKey);
    if (embedding.length === 0) return '';

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Evaluasi threshold: Dinaikkan dari 0.75 ke 0.85.
    // Alasan teknis: Semantic similarity text-embedding-004 cenderung mengelompok pada range 0.7 - 0.8 bahkan untuk topik yang kurang relevan.
    // Threshold 0.85 memastikan hanya memori yang benar-benar berkaitan erat secara semantik yang terambil,
    // meminimalisir 'context poisoning' pada LLM utama.
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: 0.85, 
      match_count: 3,        
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
  if (!safeUserId || !groqKey || !userPrompt || !aiResponse) return;

  try {
    // Potong prompt maksimal 1000 karakter agar tidak menjebol limit token Groq
    const safePrompt = userPrompt.substring(0, 1000);
    const chatContext = `User: ${safePrompt}\nAI: ${aiResponse}`;

    // 1. CLASSIFIER
    const classRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { 
            role: 'system', 
            content: 'You are a Memory Classifier. Does the following conversation contain explicit personal facts, long-term preferences, user identity details, or important requirements that the AI should remember for future sessions? Reply ONLY with "YA" or "TIDAK". Do not explain.' 
          },
          { role: 'user', content: chatContext }
        ],
        temperature: 0.1,
        max_tokens: 10
      })
    });
    
    if (!classRes.ok) throw new Error(`Classifier API error: ${classRes.status}`);
    const classData = await classRes.json();
    const decision = classData.choices?.[0]?.message?.content?.trim().toUpperCase() || 'TIDAK';

    if (!decision.includes('YA')) {
      return; 
    }

    // 2. SUMMARIZER
    const sumRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { 
            role: 'system', 
            content: 'Ekstrak dan rangkum FAKTA PERSONAL TENTANG USER dari teks berikut. Gunakan bahasa Indonesia. Maksimal 1 kalimat pendek dan padat (maksimal 15 kata). Gunakan sudut pandang orang ketiga (contoh: "User suka kopi hitam"). Abaikan sapaan atau percakapan basa-basi. Jangan merangkum jawaban AI, fokus murni pada fakta/identitas/kebutuhan User.' 
          },
          { role: 'user', content: chatContext }
        ],
        temperature: 0.1,
        max_tokens: 50
      })
    });

    if (!sumRes.ok) throw new Error(`Summarizer API error: ${sumRes.status}`);
    const sumData = await sumRes.json();
    const summary = sumData.choices?.[0]?.message?.content?.trim() || '';

    if (!summary || summary.length < 5) return;

    // 3. STORAGE & DEDUPLICATION
    const embedding = await getEmbedding(summary, geminiKey);
    if (embedding.length === 0) return;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Cek duplikasi via similarity (>0.98 mirip = anggap duplikat)
    const { data: existingData, error: matchError } = await supabase.rpc('match_memories', {
      query_embedding: embedding, 
      match_threshold: 0.98, 
      match_count: 1, 
      target_user_id: safeUserId
    });

    if (matchError) throw matchError;

    if (existingData && existingData.length > 0) {
      console.log(`[Memory Save] Skipped (Duplicate >0.98): "${summary}"`);
      return;
    }

    // Insert ke tabel
    const { error: insertError } = await supabase.from('user_memories').insert([{ 
      user_id: safeUserId, 
      summary: summary, 
      embedding: embedding 
    }]);

    if (insertError) {
      throw insertError;
    } else {
      console.log(`[Memory Save] Success: "${summary}"`);
    }

    // [Memory Cleanup] Trigger cleanup periodically in background (10% probability)
    if (Math.random() < 0.1) {
      supabase.rpc('cleanup_memories').then(() => console.log(`[Memory Cleanup] Background cleanup triggered.`)).catch(e => console.error("[Memory Error] Cleanup failed:", e));
    }

  } catch (e) {
    console.error("[Memory Error] Async Save Error:", e);
  }
};
