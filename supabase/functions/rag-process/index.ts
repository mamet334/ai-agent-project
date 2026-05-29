import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-byok-gemini',
};

// Fungsi pemotong teks (Chunker)
function chunkText(text: string, maxTokens: number = 1000): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += para + '\n\n';
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

// Fungsi mendapatkan Embedding dari Gemini
async function getGeminiEmbedding(text: string, geminiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
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
