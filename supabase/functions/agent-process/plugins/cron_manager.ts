import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export default {
  name: 'cron_manager',
  description: 'Mengelola fitur Cron (Jadwal Otomatis). Gunakan ini jika user ingin membuat jadwal tugas berulang, melihat daftar jadwal yang aktif, atau menghapus/membatalkan jadwal.',
  execute: async ({ task, userId, runLLM }) => {
    try {
      if (!userId) {
        return { output: "Error: Fitur Cron membutuhkan user untuk login. User ID tidak ditemukan." };
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Analyze the task to determine the action
      const analysisPrompt = `Anda adalah router untuk sistem Cron. Analisis permintaan berikut dan tentukan aksinya.
Permintaan: "${task}"
Tentukan Aksi:
1. CREATE (jika user ingin membuat/menambahkan jadwal baru)
2. READ (jika user menanyakan jadwal apa saja yang sedang aktif, atau cek cron)
3. DELETE (jika user ingin menghapus, membatalkan, atau mematikan jadwal)

Kembalikan HANYA format JSON berikut (tanpa markdown, tanpa teks lain):
{
  "action": "CREATE|READ|DELETE",
  "create_data": {
    "title": "Judul singkat jadwal (contoh: 'Riset Crypto')",
    "prompt": "Instruksi lengkap yang harus dikerjakan AI",
    "interval_hours": 24 (angka jam, default 24 jika tidak disebut)
  },
  "delete_title_keyword": "kata kunci dari judul jadwal yang ingin dihapus (jika aksi DELETE)"
}`;

      const analysisResultText = await runLLM(analysisPrompt);
      const cleanedJson = analysisResultText.replace(/```json/g, '').replace(/```/g, '').trim();
      let analysis;
      try {
        analysis = JSON.parse(cleanedJson);
      } catch (e) {
        return { output: `Gagal mengurai niat user. AI mengembalikan format yang salah: ${analysisResultText}` };
      }

      if (analysis.action === 'READ') {
        const { data, error } = await supabase.from('scheduled_tasks').select('*').eq('user_id', userId);
        if (error) throw error;
        
        if (!data || data.length === 0) {
          return { output: "Saat ini Anda tidak memiliki jadwal Cron (tugas otomatis) yang aktif." };
        }
        
        let report = "Berikut adalah daftar Jadwal Cron yang sedang aktif:\n";
        data.forEach((task, index) => {
          report += `${index + 1}. [${task.id}] **${task.title}** (Setiap ${task.interval_hours} jam) - Prompt: "${task.prompt}"\n`;
        });
        return { output: report };
      }

      if (analysis.action === 'CREATE') {
        if (!analysis.create_data || !analysis.create_data.title || !analysis.create_data.prompt) {
          return { output: "Gagal membuat jadwal: Judul dan Prompt instruksi harus jelas." };
        }
        
        const { data, error } = await supabase.from('scheduled_tasks').insert([{
          user_id: userId,
          title: analysis.create_data.title,
          prompt: analysis.create_data.prompt,
          interval_hours: analysis.create_data.interval_hours || 24,
          tools: ['web_search'] // Default to web_search for cron
        }]).select();
        
        if (error) throw error;
        return { output: `Berhasil membuat jadwal Cron baru: **${analysis.create_data.title}** (Setiap ${analysis.create_data.interval_hours || 24} jam).\nSistem akan otomatis mengeksekusi prompt: "${analysis.create_data.prompt}"` };
      }

      if (analysis.action === 'DELETE') {
        const keyword = analysis.delete_title_keyword;
        if (!keyword) return { output: "Gagal menghapus: Tolong sebutkan judul jadwal yang ingin dihapus." };
        
        // Cari dulu untuk dicocokkan
        const { data: searchData, error: searchError } = await supabase.from('scheduled_tasks').select('*').eq('user_id', userId);
        if (searchError) throw searchError;
        
        const taskToDelete = searchData?.find(t => t.title.toLowerCase().includes(keyword.toLowerCase()));
        if (!taskToDelete) {
          return { output: `Tidak ditemukan jadwal aktif yang mengandung kata kunci "${keyword}".` };
        }
        
        const { error: deleteError } = await supabase.from('scheduled_tasks').delete().eq('id', taskToDelete.id);
        if (deleteError) throw deleteError;
        
        return { output: `Berhasil MENGHAPUS jadwal Cron: **${taskToDelete.title}**.` };
      }

      return { output: "Aksi Cron tidak dikenali." };

    } catch (err: any) {
      return { output: `Cron Manager Error: ${err.message}` };
    }
  }
};
