import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function pingHeartbeat(serviceName: string, status: 'HEALTHY' | 'DOWN'): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[HEARTBEAT] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error } = await supabase
      .from('service_heartbeat')
      .upsert(
        {
          service_name: serviceName,
          status,
          // Per schema project: tabel hanya punya last_heartbeat_at
          last_heartbeat_at: new Date().toISOString(),
        },
        { onConflict: 'service_name' }
      );

    if (error) {
      console.error('[HEARTBEAT] Failed to upsert heartbeat:', error);
    }
  } catch (error) {
    console.error('[HEARTBEAT] Unexpected error while pinging heartbeat:', error);
  }
}
