import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-byok-gemini',
};

// Fungsi pemotong teks (Chunker) yang lebih aman dan kapasitas besar untuk tabel
function chunkText(text: string, maxLength: number = 4500): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = i + maxLength;
    if (end < text.length) {
      // Try to find a natural break point (newline or period)
      let breakPoint = text.lastIndexOf('\n', end);
      if (breakPoint <= i) breakPoint = text.lastIndexOf('. ', end);
      if (breakPoint > i) {
        end = breakPoint + 1;
      }
    }
    chunks.push(text.substring(i, end).trim());
    i = end;
  }
  return chunks.filter(c => c.length > 0);
}

// Global state for Round-Robin API Keys
let geminiKeyIndex = 0;

// Fungsi mendapatkan Embedding dari Gemini dengan Multi-Key Rotation & Retry
async function getGeminiEmbeddingWithRetry(text: string, allKeys: string[], maxRetries = 3): Promise<number[]> {
  let lastError = 'Unknown error';
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (let ki = 0; ki < allKeys.length; ki++) {
      const key = allKeys[(geminiKeyIndex + ki) % allKeys.length];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${key}`;
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: { parts: [{ text }] }
          })
        });

        if (response.ok) {
          geminiKeyIndex = (geminiKeyIndex + ki + 1) % allKeys.length;
          const data = await response.json();
          return data.embedding.values;
        }

        const errText = await response.text();
        lastError = `Status ${response.status}: ${errText}`;
        
        if (response.status === 429) {
          console.warn(`Gemini key #${ki} hit 429, trying next key...`);
          continue;
        }
      } catch (e: any) {
        lastError = e.message || String(e);
      }
    }
    
    if (attempt < maxRetries - 1) {
      const waitMs = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  
  throw new Error(`Gemini Embedding Error: ${lastError}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // We use service_role to insert into secure tables bypassing RLS for writing system vectors
    );

    const { title, text, userId } = await req.json();

    if (!title || !text || !userId) {
      return new Response(JSON.stringify({ error: 'Missing title, text, or userId' }), { status: 400, headers: corsHeaders });
    }

    // Ambil API Key (mendukung BYOK & Multi-Key)
    const keysString = Deno.env.get('GEMINI_API_KEY') || '';
    const byokKey = req.headers.get('x-byok-gemini');
    let allGeminiKeys: string[] = [];
    
    if (byokKey) {
      allGeminiKeys = [byokKey.trim()];
    } else if (keysString) {
      allGeminiKeys = keysString.split(',').map(k => k.trim()).filter(k => k);
    }

    if (allGeminiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'Gemini API Key is missing' }), { status: 400, headers: corsHeaders });
    }

    // 1. Simpan dokumen induk ke tabel `documents`
    const { data: docData, error: docError } = await supabaseClient
      .from('documents')
      .insert({ title, user_id: userId })
      .select('id')
      .single();

    if (docError) throw new Error(`DB Error: ${docError.message}`);
    const documentId = docData.id;

    // 2. Potong teks (Chunking)
    const chunks = chunkText(text, 4500); // 4500 karakter per chunk (Pisau Pemotong Raksasa)

    if (chunks.length === 0) {
      // Rollback document creation
      await supabaseClient.from('documents').delete().eq('id', documentId);
      throw new Error(`Dokumen "${title}" kosong atau tidak memiliki teks yang bisa dibaca. Pastikan dokumen (PDF/Word) berisi teks digital yang bisa di-blok, bukan sekadar gambar hasil scan.`);
    }

    // 3. Proses Vektorisasi
    console.log(`Processing ${chunks.length} chunks for document ${title}...`);
    let successCount = 0;

    for (const chunk of chunks) {
      if (chunk.trim() === '') continue;
      
      try {
        const embeddingVector = await getGeminiEmbeddingWithRetry(chunk, allGeminiKeys);
        
        // Simpan chunk ke database
        const { error: chunkError } = await supabaseClient
          .from('document_chunks')
          .insert({
            document_id: documentId,
            content: chunk,
            embedding: embeddingVector
          });

        if (chunkError) {
          throw new Error(`DB Insert Error: ${chunkError.message}`);
        } else {
          successCount++;
        }
        
        // Jeda kecil untuk menghindari Rate Limit Gemini
        await new Promise(r => setTimeout(r, 600));
      } catch (err: any) {
        // Rollback document creation on FIRST failure
        await supabaseClient.from('documents').delete().eq('id', documentId);
        throw new Error(`Proses terhenti pada chunk ke-${successCount+1}. Detail Error: ${err.message}`);
      }
    }

    if (successCount === 0) {
      // Just in case
      await supabaseClient.from('documents').delete().eq('id', documentId);
      throw new Error(`Gagal memproses semua ${chunks.length} potongan teks. Pastikan Gemini API Key valid dan teks bisa dibaca.`);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Berhasil memproses ${successCount} dari ${chunks.length} blok teks.`, documentId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
