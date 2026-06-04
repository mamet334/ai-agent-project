import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase credentials');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Ambil task yang aktif dan waktunya sudah lewat (interval)
    const { data: tasks, error: fetchError } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('is_active', true);

    if (fetchError) throw fetchError;

    const now = new Date();
    const tasksToRun = tasks.filter(task => {
      if (!task.last_run_at) return true;
      const lastRun = new Date(task.last_run_at);
      const diffHours = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
      return diffHours >= task.interval_hours;
    });

    if (tasksToRun.length === 0) {
      return new Response(JSON.stringify({ message: 'No tasks scheduled to run right now.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    // 2. Eksekusi setiap task
    for (const task of tasksToRun) {
      try {
        console.log(`Executing task ${task.id} for user ${task.user_id}`);
        
        // Panggil agent-process
        // Panggil agent-process menggunakan ANON KEY yang di-hardcode untuk menghindari Invalid JWT dari Kong Gateway
        const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || FALLBACK_ANON;
        
        const agentResponse = await fetch(`${SUPABASE_URL}/functions/v1/agent-process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${FALLBACK_ANON}`
          },
          body: JSON.stringify({
            message: `[AUTOMATED TASK: ${task.title}]\n${task.prompt}`,
            tools: task.tools || [],
            model: 'gemini-2.5-flash',
            userId: task.user_id,
            userName: 'Scheduled Agent',
            stream: false // Harus false agar kita dapat JSON balasan utuh
          })
        });

        const agentData = await agentResponse.json();
        
        // Ambil pesan asli atau pesan error jika terjadi kegagalan dari LLM
        const aiMessageText = agentData.message || (agentData.error ? `🚨 **Error dari AI:** ${agentData.error}` : 'Gagal mengeksekusi agen.');

        // Buat percakapan baru untuk user ini di tabel conversations
        const newConversation = {
          user_id: task.user_id,
          title: `[AUTO] ${task.title} - ${new Date().toLocaleDateString('id-ID')}`,
          messages: [
            { id: Date.now(), type: 'user', content: `[Tugas Otomatis]: ${task.prompt}`, timestamp: new Date().toISOString() },
            { id: Date.now() + 1, type: 'agent', content: aiMessageText, timestamp: new Date().toISOString() }
          ]
        };

        const { error: insertError } = await supabase.from('chats').insert(newConversation);
        if (insertError) console.error('Error saving conversation:', insertError);

        // Update waktu terakhir jalan
        await supabase.from('scheduled_tasks').update({ last_run_at: now.toISOString() }).eq('id', task.id);
        
        // --- AUTO-NOTIFIER (EMAIL VIA RESEND) ---
        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (resendKey) {
          try {
            // Ambil email user menggunakan Service Role
            const { data: userData, error: userError } = await supabase.auth.admin.getUserById(task.user_id);
            if (!userError && userData?.user?.email) {
              const userEmail = userData.user.email;
              const emailHtml = `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
                  <h2 style="color: #8b5cf6; margin-top: 0;">🤖 Laporan Mamet AI - Tugas Selesai</h2>
                  <p>Halo! Tugas otomatis Anda <strong>"${task.title}"</strong> baru saja selesai dieksekusi.</p>
                  <div style="background: #1e293b; color: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #8b5cf6; margin: 20px 0; font-size: 14px; white-space: pre-wrap;">
${aiMessageText.substring(0, 1000)}${aiMessageText.length > 1000 ? '\n\n... (Terpotong, silakan buka aplikasi untuk melihat selengkapnya)' : ''}
                  </div>
                  <p>Buka dashboard aplikasi Mamet Anda untuk melihat riwayat percakapan lengkapnya.</p>
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #94a3b8;">Email ini dikirim otomatis oleh Mamet AI Cron Manager.</p>
                </div>
              `;
              
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: 'Mamet AI <onboarding@resend.dev>',
                  to: userEmail,
                  subject: `[Mamet] Tugas Selesai: ${task.title}`,
                  html: emailHtml
                })
              });
              console.log(`Auto-Notifier: Email laporan terkirim ke ${userEmail}`);
            }
          } catch (emailErr) {
            console.error('Auto-Notifier Error:', emailErr);
          }
        }

        results.push({ taskId: task.id, status: 'success' });

        // Jeda 3 detik antar task untuk menghindari Rate Limit
        await new Promise(r => setTimeout(r, 3000));
      } catch (err) {
        console.error(`Task ${task.id} failed:`, err);
        
        // --- FITUR HARAKIRI (AUTO-KILL SWITCH) ---
        // Jika tugas gagal (misal API Limit tercapai, kunci salah), langsung nonaktifkan tugas tersebut
        // untuk mencegah bom tagihan atau loop error tanpa henti.
        await supabase.from('scheduled_tasks').update({ 
          is_active: false,
          last_run_at: new Date().toISOString() // Simpan waktu gagal
        }).eq('id', task.id);
        
        console.warn(`HARAKIRI: Tugas ${task.id} dinonaktifkan otomatis karena terjadi error.`);

        results.push({ taskId: task.id, status: 'error', error: err.message, action: 'auto_disabled' });
      }
    }

    return new Response(JSON.stringify({ executed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
