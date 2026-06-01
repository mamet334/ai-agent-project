const fetch = require('node-fetch');

async function fixCronTable() {
  const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY2MzI4NSwiZXhwIjoyMDk1MjM5Mjg1fQ.iXIxXncqwkOmyxMW6Bp8R94TxM6m8VgqN7dn_yiLCOY';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';
  const supabaseUrl = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';

  // Step 1: Drop the table completely and recreate without FK
  const dropAndRecreate = `
    DROP TABLE IF EXISTS public.scheduled_tasks;
    CREATE TABLE public.scheduled_tasks (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id text NOT NULL,
      title text NOT NULL,
      prompt text NOT NULL,
      tools jsonb DEFAULT '[]'::jsonb,
      interval_hours integer DEFAULT 24,
      is_active boolean DEFAULT true,
      last_run_at timestamptz,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all for service role" ON public.scheduled_tasks FOR ALL USING (true);
  `;

  // Use the Supabase Edge Function to execute SQL
  const res = await fetch(`${supabaseUrl}/functions/v1/agent-process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({
      message: `Jalankan perintah SQL berikut di database: ${dropAndRecreate}`,
      tools: [],
      model: 'gemini-2.5-flash',
      stream: false
    })
  });

  console.log("Trying alternative: Direct REST insert test...");

  // Alternative: Try inserting directly via REST API with service role key
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/scheduled_tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': anonKey,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      user_id: 'test-user-123',
      title: 'Test Jadwal',
      prompt: 'Test prompt',
      interval_hours: 24,
      tools: ['web_search']
    })
  });

  const insertStatus = insertRes.status;
  const insertBody = await insertRes.text();
  console.log('Insert Status:', insertStatus);
  console.log('Insert Body:', insertBody);

  if (insertStatus >= 400) {
    console.log("\nThe table still has FK constraint. Need to run SQL fix manually.");
    console.log("Please go to: https://supabase.com/dashboard/project/uuyzdjifhdfyyvpxsofu/sql/new");
    console.log("And run the SQL from fix_cron_table.sql");
  }
}

fixCronTable().catch(console.error);
