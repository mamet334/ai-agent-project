import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-byok-gemini',
};

// Fungsi pemotong teks (Chunker) yang lebih aman
function chunkText(text: string, maxLength: number = 1500): string[] {
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

// Fungsi mendapatkan Embedding dari Gemini
async function getGeminiEmbedding(text: string, geminiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text }] }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini Embedding Error: ${err}`);
  }

  const data = await response.json();
  return data.embedding.values;
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

    // Ambil API Key (mendukung BYOK)
    const keysString = Deno.env.get('GEMINI_API_KEY') || '';
    const geminiKey = req.headers.get('x-byok-gemini') || (keysString.split(',')[0].trim());

    if (!geminiKey) {
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
    const chunks = chunkText(text, 1500); // 1500 karakter per chunk

    // 3. Proses Vektorisasi
    console.log(`Processing ${chunks.length} chunks for document ${title}...`);
    let successCount = 0;

    for (const chunk of chunks) {
      if (chunk.trim() === '') continue;
      
      try {
        const embeddingVector = await getGeminiEmbedding(chunk, geminiKey);
        
        // Simpan chunk ke database
        const { error: chunkError } = await supabaseClient
          .from('document_chunks')
          .insert({
            document_id: documentId,
            content: chunk,
            embedding: embeddingVector
          });

        if (chunkError) {
          console.error('Failed to insert chunk:', chunkError);
        } else {
          successCount++;
        }
        
        // Jeda kecil untuk menghindari Rate Limit Gemini
        await new Promise(r => setTimeout(r, 600));
      } catch (err) {
        console.error('Error embedding chunk:', err);
      }
    }

    if (successCount === 0) {
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
