-- 1. Buat Tabel untuk menyimpan log error/kejadian penting dari agent
create table public.agent_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users null,
  event_type text not null, -- contoh: 'QUOTA_LIMIT', 'FALLBACK_TRIGGERED', 'SYSTEM_ERROR'
  provider text null,       -- contoh: 'OpenAI', 'Groq', 'Gemini'
  message text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 2. Keamanan RLS
alter table public.agent_logs enable row level security;

-- Hanya admin/service role yang bisa insert, atau jika kita izinkan user insert log error:
-- Beri izin service_role (edge function) untuk melakukan full akses
-- Tapi untuk amannya, kita beri akses select untuk user bersangkutan jika ada user_id
create policy "Users can view own logs" on agent_logs for select using (auth.uid() = user_id);
-- (Insert dilakukan oleh Supabase Edge Function menggunakan service_role yang bypass RLS)
