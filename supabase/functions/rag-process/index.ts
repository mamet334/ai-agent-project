import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { chunkText, getGeminiEmbeddingWithRetry } from '../agent-process/lib/vector_utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-byok-gemini',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { title, text, userId, spaceId } = await req.json();

    if (!title || !text || !userId) {
      return new Response(JSON.stringify({ error: 'Missing title, text, or userId' }), { status: 400, headers: corsHeaders });
    }

    // Tentukan spaceId: Jika tidak dikirim (dari klien lama), fallback ke CORE
    let targetSpaceId = spaceId;
    if (!targetSpaceId) {
      const { data: coreSpace } = await supabaseClient
        .from('knowledge_spaces')
        .select('id')
        .eq('user_id', userId)
        .eq('space_type', 'CORE')
        .single();
      if (coreSpace) {
        targetSpaceId = coreSpace.id;
      } else {
        throw new Error('Core space belum di-setup untuk user ini.');
      }
    }

    // Ambil API Key
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

    // 1. Simpan dokumen induk
    const { data: docData, error: docError } = await supabaseClient
      .from('documents')
      .insert({ title, user_id: userId, space_id: targetSpaceId })
      .select('id')
      .single();

    if (docError) throw new Error(`DB Error: ${docError.message}`);
    const documentId = docData.id;

    // 2. Potong teks
    const chunks = chunkText(text, 4500);

    if (chunks.length === 0) {
      await supabaseClient.from('documents').delete().eq('id', documentId);
      throw new Error(`Dokumen "${title}" kosong atau tidak memiliki teks yang bisa dibaca.`);
    }

    // 3. Proses Vektorisasi
    console.log(`Processing ${chunks.length} chunks for document ${title}...`);
    let successCount = 0;

    for (const chunk of chunks) {
      if (chunk.trim() === '') continue;
      
      try {
        const embeddingVector = await getGeminiEmbeddingWithRetry(chunk, allGeminiKeys);
        
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
        
        await new Promise(r => setTimeout(r, 600));
      } catch (err: any) {
        await supabaseClient.from('documents').delete().eq('id', documentId);
        throw new Error(`Proses terhenti pada chunk ke-${successCount+1}. Detail Error: ${err.message}`);
      }
    }

    if (successCount === 0) {
      await supabaseClient.from('documents').delete().eq('id', documentId);
      throw new Error(`Gagal memproses semua ${chunks.length} potongan teks.`);
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
