import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { evaluateKnowledgeQuality } from '../lib/knowledge_quality_filter.ts';
import { chunkText } from '../lib/vector_utils.ts';
import { generateEmbedding } from '../lib/rag/embedding.ts';

export const knowledgeManagerPlugin = {
  name: 'knowledge_manager',
  description: 'Gunakan untuk CRUD Workspace/Knowledge Space (buat, simpan, hapus, list, update summary, statistik, ringkasan, dan daftar dokumen). Parameter JSON Wajib: "action" (ENUM: CREATE_WORKSPACE, SAVE_TO_WORKSPACE, DELETE_WORKSPACE, LIST_WORKSPACES, GET_WORKSPACE_STATS, UPDATE_WORKSPACE_SUMMARY, GET_WORKSPACE_SUMMARY, LIST_DOCUMENTS), "space_name" (nama ruang, WAJIB jika bukan LIST_WORKSPACES), "content" (teks jika SAVE_TO_WORKSPACE).',
  execute: async (context: any) => {
    const { task, env, userId, accumulatedContext, policy } = context;
    
    // Asumsi LLM memasukkan config ke dalam task, atau kita extract via LLM lokal
    let action = 'LIST_WORKSPACES';
    let spaceName = '';
    
    // Check if task is a JSON string (from the Coordinator array)
    try {
        if (task.trim().startsWith('{')) {
            const parsed = JSON.parse(task);
            if (parsed.action) action = parsed.action;
            if (parsed.space_name) spaceName = parsed.space_name;
            if (parsed.workspace) spaceName = parsed.workspace; // fallback
        }
    } catch(e) {}

    const taskLower = task.toLowerCase();
    
    // Fallback if action is missing or stringified JSON didn't include it properly
    if (action === 'LIST_WORKSPACES' && !task.includes('LIST_WORKSPACES')) {
        if (task.includes('CREATE_WORKSPACE') || taskLower.includes('buat')) action = 'CREATE_WORKSPACE';
        else if (task.includes('SAVE_TO_WORKSPACE') || taskLower.includes('simpan')) action = 'SAVE_TO_WORKSPACE';
        else if (task.includes('DELETE_WORKSPACE') || taskLower.includes('hapus')) action = 'DELETE_WORKSPACE';
        else if (task.includes('GET_WORKSPACE_STATS') || taskLower.includes('statistik')) action = 'GET_WORKSPACE_STATS';
        else if (task.includes('UPDATE_WORKSPACE_SUMMARY')) action = 'UPDATE_WORKSPACE_SUMMARY';
        else if (task.includes('GET_WORKSPACE_SUMMARY') || taskLower.includes('ringkasan') || taskLower.includes('pola') || taskLower.includes('kesimpulan') || taskLower.includes('tren') || taskLower.includes('insight')) action = 'GET_WORKSPACE_SUMMARY';
        else if (task.includes('LIST_DOCUMENTS') || taskLower.includes('semua dokumen') || taskLower.includes('daftar dokumen') || taskLower.includes('isi workspace') || taskLower.includes('seluruh dokumen')) action = 'LIST_DOCUMENTS';
    }
    
    if (!spaceName) {
        // Ekstrak nama space (Cari string setelah kata kunci "workspace", "ruang", "space")
        const nameMatch = task.match(/(?:workspace|ruang|space) ["']?([a-zA-Z0-9_ -]+)["']?/i);
        if (nameMatch && nameMatch[1]) {
          spaceName = nameMatch[1].trim();
        } else {
           // Coba ekstrak yang ada di dalam kutip
           const quoteMatch = task.match(/["'](.*?)["']/);
           if (quoteMatch) spaceName = quoteMatch[1].trim();
        }
    }

    if (!spaceName && ['CREATE_WORKSPACE', 'SAVE_TO_WORKSPACE', 'DELETE_WORKSPACE', 'UPDATE_WORKSPACE_SUMMARY', 'GET_WORKSPACE_SUMMARY', 'LIST_DOCUMENTS'].includes(action)) {
       return { output: 'Nama workspace tidak ditemukan dalam instruksi. Mohon sebutkan nama workspace dengan jelas.', sources: [] };
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    try {
      const writeActions = ['CREATE_WORKSPACE', 'SAVE_TO_WORKSPACE', 'DELETE_WORKSPACE', 'UPDATE_WORKSPACE_SUMMARY'];
      if (writeActions.includes(action) && policy && !policy.canWriteKnowledge) {
          return { output: `Akses Ditolak (MametLite): Fitur modifikasi workspace (Write/Delete) dinonaktifkan.`, sources: [] };
      }
      
      switch (action) {
        case 'CREATE_WORKSPACE': {
          const { error } = await supabase.from('knowledge_spaces').insert([{
            user_id: userId,
            name: spaceName,
            space_type: 'WORKSPACE'
          }]);
          if (error) {
            if (error.code === '23505') return { output: `Workspace "${spaceName}" sudah ada.`, sources: [] };
            throw error;
          }
          return { output: `Workspace "${spaceName}" berhasil dibuat.`, sources: [] };
        }

        case 'LIST_WORKSPACES': {
          const { data, error } = await supabase.from('knowledge_spaces').select('name, space_type, description, tags, archived').eq('user_id', userId).order('created_at', { ascending: false });
          if (error) throw error;
          if (!data || data.length === 0) return { output: 'Anda belum memiliki workspace.', sources: [] };
          const listStr = data.map(d => `- ${d.name} (${d.space_type}) ${d.archived ? '[Archived]' : ''}`).join('\n');
          return { output: `Daftar Workspace Anda:\n${listStr}`, sources: [] };
        }

        case 'DELETE_WORKSPACE': {
          // Check permission first
          const { data: space } = await supabase.from('knowledge_spaces').select('*').eq('user_id', userId).eq('name', spaceName).single();
          if (!space) return { output: `Workspace "${spaceName}" tidak ditemukan.`, sources: [] };
          
          if (space.space_type === 'CORE') {
            return { output: `Akses Ditolak: "${spaceName}" adalah Core Knowledge yang bersifat Read-Only untuk Mamet.`, sources: [] };
          }

          const { error } = await supabase.from('knowledge_spaces').delete().eq('id', space.id);
          if (error) throw error;
          return { output: `Workspace "${spaceName}" dan seluruh dokumen di dalamnya telah dihapus.`, sources: [] };
        }

        case 'SAVE_TO_WORKSPACE': {
          // Cari space
          let { data: space } = await supabase.from('knowledge_spaces').select('*').eq('user_id', userId).eq('name', spaceName).single();
          
          // --- PREVENT CORE OVERWRITE LEAKAGE ---
          if (space && space.space_type === 'CORE') {
             return { output: `Akses Ditolak: "${spaceName}" adalah Core Knowledge yang bersifat System-Managed. Tidak bisa melakukan manual save via Workspace Manager.`, sources: [] };
          }

          if (!space) {
             // Otomatis buat jika belum ada
             const { data: newSpace, error: createErr } = await supabase.from('knowledge_spaces').insert([{ user_id: userId, name: spaceName, space_type: 'WORKSPACE' }]).select().single();
             if (createErr) throw createErr;
             space = newSpace;
          }

          // Dapatkan konten yang akan disimpan (bisa dari accumulatedContext dari tier sebelumnya)
          // Asumsi subagent sebelumnya memberikan output yang masuk ke accumulatedContext
          // Jika tidak ada di task, kita ambil dari accumulatedContext
          let contentToSave = accumulatedContext || task;
          
          if (!contentToSave || contentToSave.length < 10) {
             return { output: 'Tidak ada konten memadai untuk disimpan ke workspace.', sources: [] };
          }

          // Quality Filter
          const filterResult = await evaluateKnowledgeQuality(contentToSave, env.GROQ_API_KEY, space.quality_filter_enabled);
          if (filterResult.status === 'REJECTED') {
             return { output: `Gagal menyimpan: Ditolak oleh Knowledge Quality Filter. Alasan: ${filterResult.reason}`, sources: [] };
          }

          // RAG Ingestion Pipeline
          const title = `Saved from Chat - ${new Date().toISOString()}`;
          const { data: docData, error: docError } = await supabase.from('documents').insert({ user_id: userId, title, space_id: space.id }).select('id').single();
          if (docError) throw docError;

          const chunks = chunkText(contentToSave, 4500);
          let successCount = 0;
          for (const chunk of chunks) {
             const embeddingVector = await generateEmbedding(chunk, context.rctx);
             if (embeddingVector && embeddingVector.length === 768) {
               const { error: chunkErr } = await supabase.from('document_chunks').insert({ document_id: docData.id, content: chunk, embedding: embeddingVector });
               if (!chunkErr) successCount++;
             }
          }

          // 💾 STEP 4: SAVE DECISION TRANSPARENCY LAYER
          return { 
             output: `Berhasil menyimpan informasi ke workspace "${spaceName}" (${successCount} chunks vektor).`, 
             sources: [],
             toolExecution: {
                 target: "WORKSPACE",
                 workspace_id: space.id,
                 reason_code: "EXPLICIT_ROUTER_INSTRUCTION",
                 approved_by: "SYSTEM_ROUTER"
             }
          };
        }

        case 'GET_WORKSPACE_STATS': {
          const { data: stats, error } = await supabase.rpc('get_workspace_stats', { p_user_id: userId });
          if (error) throw error;
          if (!stats || stats.length === 0) return { output: 'Belum ada data storage yang tercatat.', sources: [] };
          
          let outputStr = 'Statistik Workspace Storage:\n\n';
          for (const s of stats) {
            outputStr += `Workspace: ${s.workspace_name}\nDocuments: ${s.document_count}\nChunks: ${s.chunk_count}\nSize: ${s.estimated_storage_mb} MB\n\n`;
          }
          return { output: outputStr, sources: [] };
        }

        case 'UPDATE_WORKSPACE_SUMMARY': {
           const { data: space } = await supabase.from('knowledge_spaces').select('*').eq('user_id', userId).eq('name', spaceName).single();
           if (!space) return { output: `Workspace "${spaceName}" tidak ditemukan.`, sources: [] };

           // Get all docs
           const { data: docs } = await supabase.from('documents').select('id, title').eq('space_id', space.id);
           if (!docs || docs.length === 0) return { output: `Workspace "${spaceName}" kosong, tidak ada yang diringkas.`, sources: [] };

           const docIds = docs.map((d: any) => d.id);
           const { data: chunks } = await supabase.from('document_chunks').select('content').in('document_id', docIds).limit(50); // limit 50 chunks for safety
           
           if (!chunks || chunks.length === 0) return { output: `Workspace "${spaceName}" kosong.`, sources: [] };
           const allText = chunks.map((c: any) => c.content).join('\n\n');
           
           // Use LLM to summarize
           const summaryPrompt = `Buatkan ringkasan komprehensif dari dokumen workspace berikut:\n\n${allText.substring(0, 30000)}`;
           const summaryText = await context.runLLM(summaryPrompt, 'Anda adalah asisten peringkas data objektif.');

           const { error: upsertErr } = await supabase.from('workspace_summaries').upsert({
              space_id: space.id,
              summary: summaryText,
              updated_at: new Date().toISOString()
           }, { onConflict: 'space_id' });

           if (upsertErr) throw upsertErr;
           return { output: `Ringkasan workspace "${spaceName}" berhasil diperbarui.`, sources: [] };
        }

        case 'GET_WORKSPACE_SUMMARY': {
           const { data: space } = await supabase.from('knowledge_spaces').select('*').eq('user_id', userId).eq('name', spaceName).single();
           if (!space) return { output: `Workspace "${spaceName}" tidak ditemukan.`, sources: [] };

           const { data: summaryData } = await supabase.from('workspace_summaries').select('summary').eq('space_id', space.id).single();
           if (!summaryData || !summaryData.summary) {
               return { output: `Workspace "${spaceName}" belum memiliki ringkasan global. Cobalah jalankan aksi UPDATE_WORKSPACE_SUMMARY terlebih dahulu.`, sources: [] };
           }
           
           return { output: `[Ringkasan Macro Workspace "${spaceName}"]\n${summaryData.summary}`, sources: [] };
        }

        case 'LIST_DOCUMENTS': {
           const { data: space } = await supabase.from('knowledge_spaces').select('*').eq('user_id', userId).eq('name', spaceName).single();
           if (!space) return { output: `Workspace "${spaceName}" tidak ditemukan.`, sources: [] };

           const { data: docs } = await supabase.from('documents').select('id, title, created_at').eq('space_id', space.id).order('created_at', { ascending: false });
           
           if (!docs || docs.length === 0) {
               return { output: `Workspace "${spaceName}" masih kosong. Tidak ada dokumen.`, sources: [] };
           }

           let listStr = `Daftar Dokumen di Workspace "${spaceName}":\n\n`;
           for (const d of docs) {
               listStr += `- ${d.title} (ID: ${d.id})\n`;
           }
           return { output: listStr, sources: [] };
        }

        default:
          return { output: `Perintah Knowledge Manager tidak dikenali: ${action}`, sources: [] };
      }
    } catch (err: any) {
      return { output: `Knowledge Manager Error: ${err.message}`, sources: [] };
    }
  }
};
