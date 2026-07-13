import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // 1. Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Validasi JWT Token (Security Layer)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    // Gunakan Anon Client untuk memvalidasi token pengguna
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    
    if (authError || !user) {
      console.warn('Health Checker: Unauthorized access attempt');
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Setup Supabase Client dengan Service Role (Bypass RLS untuk background job)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Ambil semua monitor yang berstatus aktif
    console.log(`Health Checker: Request initiated by User ID: ${user.id}`);
    const { data: monitors, error: fetchError } = await supabase
      .from('monitors')
      .select('*')
      .eq('active', true);

    if (fetchError) throw fetchError;
    if (!monitors || monitors.length === 0) {
      return new Response(JSON.stringify({ message: "Tidak ada monitor aktif." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Lakukan Ping ke semua URL secara Paralel (Promise.all)
    const checkResults = await Promise.all(monitors.map(async (monitor) => {
      const startTime = Date.now();
      let statusCode = null;
      let errorText = null;

      try {
        // Set Timeout 5 detik agar tidak menggantung (Hanging)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(monitor.url, {
          method: 'OPTIONS', // Gunakan OPTIONS agar lebih ringan (hanya cek ketersediaan HTTP)
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        statusCode = response.status;
        
        // Anggap error jika status code >= 500
        if (statusCode >= 500) {
           errorText = `HTTP Error: ${statusCode}`;
        }
      } catch (err: any) {
        // Jika AbortError, berarti Timeout
        if (err.name === 'AbortError') {
          errorText = 'TIMEOUT: Server tidak merespons dalam 5 detik.';
        } else {
          errorText = `FETCH ERROR: ${err.message}`;
        }
      }

      const responseTimeMs = Date.now() - startTime;

      return {
        monitor_id: monitor.id,
        status_code: statusCode,
        response_time_ms: responseTimeMs,
        error: errorText,
      };
    }));

    // 6. Simpan hasil ping ke tabel 'checks'
    console.log(`Health Checker: Menyimpan ${checkResults.length} hasil ping ke database...`);
    const { error: insertError } = await supabase
      .from('checks')
      .insert(checkResults);

    if (insertError) throw insertError;

    // --- LOGIKA ALERTING (TELEGRAM BOT) ---
    // Jika ada error pada pengecekan, catat ke tabel 'incidents' dan kirim pesan ke Telegram
    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');

    for (const result of checkResults) {
      if (result.error) {
        console.log(`Terdeteksi Error pada Monitor ${result.monitor_id}: ${result.error}`);
        
        // 1. Simpan ke tabel incidents
        await supabase.from('incidents').insert({
          monitor_id: result.monitor_id,
          status: 'DOWN'
        });

        // 2. Kirim Pesan ke Telegram
        if (telegramToken && telegramChatId) {
          try {
            // Cari data monitor asli dari array yang sudah kita ambil di atas
            const brokenMonitor = monitors.find(m => m.id === result.monitor_id);
            const appName = brokenMonitor ? brokenMonitor.name : 'Unknown App';
            const appUrl = brokenMonitor ? brokenMonitor.url : 'Unknown URL';
            
            // Format waktu ke Waktu Indonesia Barat (WIB)
            const timeOptions = { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'medium' };
            const timeString = new Date().toLocaleString('id-ID', timeOptions);

            const message = `🚨 *MAMET SERVER ALERT* 🚨\n\n` +
                            `*Aplikasi:* ${appName}\n` +
                            `*URL Target:* \`${appUrl}\`\n\n` +
                            `*Status:* 🔴 DOWN\n` +
                            `*Detail Error:* \`${result.error}\`\n\n` +
                            `*Waktu (WIB):* ${timeString}`;
                            
            const tgUrl = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
            
            await fetch(tgUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: telegramChatId,
                text: message,
                parse_mode: 'Markdown'
              })
            });
            console.log("Notifikasi Telegram berhasil dikirim.");
          } catch (e) {
            console.error("Gagal mengirim notifikasi Telegram:", e);
          }
        }
      }
    }
    return new Response(JSON.stringify({ 
      message: "Health check selesai.",
      results: checkResults 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Health Check Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
