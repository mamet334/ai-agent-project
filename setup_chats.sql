-- 1. Buat Tabel untuk menyimpan Riwayat Chat
create table public.chats (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null default 'Percakapan Baru',
  messages jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Aktifkan Keamanan RLS (Row Level Security) agar pengguna hanya bisa mengakses chat mereka sendiri
alter table public.chats enable row level security;

create policy "Users can view own chats" on chats for select using (auth.uid() = user_id);
create policy "Users can insert own chats" on chats for insert with check (auth.uid() = user_id);
create policy "Users can update own chats" on chats for update using (auth.uid() = user_id);
create policy "Users can delete own chats" on chats for delete using (auth.uid() = user_id);
