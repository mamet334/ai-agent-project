-- 1. Buat Tabel untuk menyimpan Jadwal Tugas Mamet
create table public.scheduled_tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  prompt text not null,
  tools jsonb default '[]'::jsonb,
  interval_hours integer default 24, -- Menjalankan tugas setiap berapa jam?
  is_active boolean default true,
  last_run_at timestamptz,
  created_at timestamptz default now()
);

-- 2. Aktifkan Keamanan RLS (Hanya pemilik yang bisa melihat/mengedit jadwalnya)
alter table public.scheduled_tasks enable row level security;
create policy "Users can view own tasks" on scheduled_tasks for select using (auth.uid() = user_id);
create policy "Users can insert own tasks" on scheduled_tasks for insert with check (auth.uid() = user_id);
create policy "Users can update own tasks" on scheduled_tasks for update using (auth.uid() = user_id);
create policy "Users can delete own tasks" on scheduled_tasks for delete using (auth.uid() = user_id);
