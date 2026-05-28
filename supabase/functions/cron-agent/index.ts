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
        const agentResponse = await fetch(`${SUPABASE_URL}/functions/v1/agent-process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
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
        const aiMessageText = agentData.message || 'Gagal mengeksekusi agen.';

        // Buat percakapan baru untuk user ini di tabel conversations
        const newConversation = {
          user_id: task.user_id,
          title: `[AUTO] ${task.title} - ${new Date().toLocaleDateString('id-ID')}`,
          messages: [
            { id: Date.now(), type: 'user', content: `[Tugas Otomatis]: ${task.prompt}` },
            { id: Date.now() + 1, type: 'bot', content: aiMessageText }
          ]
        };

        const { error: insertError } = await supabase.from('conversations').insert(newConversation);
        if (insertError) console.error('Error saving conversation:', insertError);

        // Update waktu terakhir jalan
        await supabase.from('scheduled_tasks').update({ last_run_at: now.toISOString() }).eq('id', task.id);
        
        results.push({ taskId: task.id, status: 'success' });

        // Jeda 3 detik antar task untuk menghindari Rate Limit
        await new Promise(r => setTimeout(r, 3000));
      } catch (err) {
        console.error(`Task ${task.id} failed:`, err);
        results.push({ taskId: task.id, status: 'error', error: err.message });
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
