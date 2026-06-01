import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export default {
  name: 'cron_manager',
  description: 'Mengelola fitur Cron (Jadwal Otomatis). Gunakan sub-agent ini jika user ingin: membuat jadwal tugas berulang, melihat daftar jadwal yang aktif, atau menghapus/membatalkan jadwal. DILARANG KERAS mengarang jawaban tentang cron/jadwal tanpa memanggil sub-agent ini.',
  execute: async ({ task, userId, runLLM }: { task: string, userId: string, runLLM: Function }) => {
    try {
      if (!userId || userId === 'anonymous') {
        return { output: "Error: Fitur Cron membutuhkan user untuk login terlebih dahulu. User ID tidak ditemukan." };
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Validasi apakah userId ada di auth.users
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
      if (authError || !authUser?.user) {
        console.error("Cron Manager: userId tidak ditemukan di auth.users:", userId, authError);
        return { output: `Error: User ID "${userId}" tidak terdaftar di sistem autentikasi. Pastikan Anda sudah login dengan benar.` };
      }

      console.log(`Cron Manager: Memproses tugas untuk user ${authUser.user.email || userId}`);

      // Analyze the task to determine the action
      const analysisPrompt = `Anda adalah parser JSON untuk sistem Cron. Analisis permintaan berikut.
Permintaan: "${task}"

Tentukan Aksi:
- CREATE: jika user ingin membuat/menambahkan jadwal baru
- READ: jika user menanyakan jadwal apa saja yang sedang aktif, atau cek cron
- DELETE: jika user ingin menghapus, membatalkan, atau mematikan jadwal

KELUARKAN HANYA JSON MURNI (tanpa markdown, tanpa backtick, tanpa teks lain):
{"action":"CREATE","create_data":{"title":"Judul singkat","prompt":"Instruksi lengkap untuk AI","interval_hours":24},"delete_title_keyword":"kata kunci"}`;

      const analysisResultText = await runLLM(analysisPrompt);
      const cleanedJson = analysisResultText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let analysis;
      try {
        // Coba parse langsung
        analysis = JSON.parse(cleanedJson);
      } catch (e) {
        // Coba ekstrak JSON dari teks
        const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            analysis = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            return { output: `Cron Manager gagal memahami perintah Anda. Coba ulangi dengan format yang lebih jelas, contoh: "buat jadwal riset AI setiap 12 jam"` };
          }
        } else {
          return { output: `Cron Manager gagal memahami perintah Anda. Coba ulangi dengan format yang lebih jelas, contoh: "buat jadwal riset AI setiap 12 jam"` };
        }
      }

      const action = (analysis.action || '').toUpperCase();
      console.log(`Cron Manager: Aksi terdeteksi = ${action}`);

      if (action === 'READ') {
        const { data, error } = await supabase.from('scheduled_tasks').select('*').eq('user_id', userId);
        if (error) throw error;
        
        if (!data || data.length === 0) {
          return { output: "Saat ini Anda tidak memiliki jadwal Cron (tugas otomatis) yang aktif. Gunakan perintah seperti 'buat jadwal riset AI setiap 12 jam' untuk menambahkan jadwal baru." };
        }
        
        let report = "Berikut adalah daftar Jadwal Cron Anda yang sedang aktif:\n\n";
        report += "| No | Judul | Interval | Prompt | Status |\n|---|---|---|---|---|\n";
        data.forEach((t: any, index: number) => {
          report += `| ${index + 1} | **${t.title}** | Setiap ${t.interval_hours} jam | ${t.prompt.substring(0, 50)}... | ${t.is_active ? '✅ Aktif' : '❌ Nonaktif'} |\n`;
        });
        return { output: report };
      }

      if (action === 'CREATE') {
        const cd = analysis.create_data;
        if (!cd || !cd.title || !cd.prompt) {
          return { output: "Gagal membuat jadwal: Judul dan Prompt instruksi harus jelas. Contoh: 'buat jadwal dengan judul Riset AI, instruksinya cari peluang bisnis AI terbaru, setiap 12 jam'" };
        }
        
        const { data, error } = await supabase.from('scheduled_tasks').insert([{
          user_id: userId,
          title: cd.title,
          prompt: cd.prompt,
          interval_hours: cd.interval_hours || 24,
          tools: ['web_search'],
          is_active: true
        }]).select();
        
        if (error) {
          console.error("Cron Manager INSERT error:", error);
          throw error;
        }

        console.log("Cron Manager: Jadwal berhasil dibuat!", data);
        return { output: `✅ Berhasil membuat jadwal Cron baru!\n\n- **Judul**: ${cd.title}\n- **Interval**: Setiap ${cd.interval_hours || 24} jam\n- **Instruksi**: "${cd.prompt}"\n\nJadwal ini sudah aktif dan akan dieksekusi secara otomatis oleh sistem.` };
      }

      if (action === 'DELETE') {
        const keyword = analysis.delete_title_keyword;
        if (!keyword) return { output: "Gagal menghapus: Tolong sebutkan judul jadwal yang ingin dihapus." };
        
        const { data: searchData, error: searchError } = await supabase.from('scheduled_tasks').select('*').eq('user_id', userId);
        if (searchError) throw searchError;
        
        const taskToDelete = searchData?.find((t: any) => t.title.toLowerCase().includes(keyword.toLowerCase()));
        if (!taskToDelete) {
          return { output: `Tidak ditemukan jadwal aktif yang mengandung kata kunci "${keyword}". Gunakan perintah "cek jadwal cron" untuk melihat daftar jadwal yang ada.` };
        }
        
        const { error: deleteError } = await supabase.from('scheduled_tasks').delete().eq('id', taskToDelete.id);
        if (deleteError) throw deleteError;
        
        return { output: `🗑️ Berhasil MENGHAPUS jadwal Cron: **${taskToDelete.title}**.` };
      }

      return { output: `Aksi Cron "${action}" tidak dikenali. Gunakan perintah seperti: "buat jadwal...", "cek jadwal cron", atau "hapus jadwal..."` };

    } catch (err: any) {
      console.error("Cron Manager Fatal Error:", err);
      return { output: `Cron Manager Error: ${err.message}. Pastikan tabel 'scheduled_tasks' sudah ada di database Supabase Anda.` };
    }
  }
};
