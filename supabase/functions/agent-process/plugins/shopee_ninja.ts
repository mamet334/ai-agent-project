import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export default {
  name: "shopee_ninja",
  description: "Asisten khusus program Affiliate Shopee. Gunakan sub-agent ini JIKA DAN HANYA JIKA user meminta untuk memposting link affiliate shopee, menyimpan link ke database antrean (shopee_queue), atau membuat konten promosi produk Shopee.",
  execute: async ({ task, cleanTask, accumulatedContext, env, runLLM, userId }) => {
    try {
      let dbResultText = '';
      
      // Deteksi jika user ingin memasukkan link shopee
      const urlRegex = /(https?:\/\/(?:www\.)?shopee\.[a-z\.]+[\/\w \.-]*)/gi;
      const foundUrls = cleanTask.match(urlRegex) || [];

      if (foundUrls.length > 0) {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          
          let successCount = 0;
          for (const url of foundUrls) {
             const { error } = await supabase.from('shopee_queue').insert([{ 
               original_url: url,
               product_name: 'Antrean dari Mamet AI' 
             }]);
             if (!error) successCount++;
          }
          if (successCount > 0) {
            dbResultText = `[SISTEM]: Berhasil memasukkan ${successCount} link Shopee ke dalam antrean database (shopee_queue).\n\n`;
          }
        }
      }

      const systemPrompt = `Anda adalah asisten di belakang layar untuk program Affiliate Shopee.
Tugas Anda adalah:
1. Menganalisis pesan user terkait promosi Shopee.
2. Jika ada link yang berhasil dimasukkan ke database (lihat info SISTEM), beritahukan user bahwa link sudah masuk antrean posting.
3. BUAT CAPTION YANG SANGAT NATURAL (HUMAN-LIKE). Jangan gunakan gaya bahasa agen promosi, sales, atau bot!
4. Tulis seolah-olah Anda adalah netizen asli Indonesia yang sekadar iseng merekomendasikan barang bagus, atau baru saja membeli barang tersebut.
5. Gunakan bahasa santai, kasual, kadang pakai singkatan wajar, dan selipkan link secara halus.

Info Database: ${dbResultText}
Pertanyaan/Tugas: ${cleanTask}
Konteks: ${accumulatedContext}`;

      const llmResponse = await runLLM(cleanTask, systemPrompt, []);

      return {
        output: dbResultText + llmResponse,
        sources: [],
        toolExecution: null
      };
    } catch (error: any) {
      console.error("Shopee Ninja Error:", error);
      return {
        output: `Error memproses Shopee Ninja: ${error.message}`,
        sources: [],
        toolExecution: null
      };
    }
  }
};
