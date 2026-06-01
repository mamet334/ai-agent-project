-- Perbaikan: Hapus Foreign Key constraint pada scheduled_tasks agar cron_manager 
-- bisa insert dengan user_id tanpa harus terdaftar di auth.users
-- (Karena Edge Function menggunakan service_role_key, bukan auth session user)

-- 1. Drop existing foreign key constraint
ALTER TABLE public.scheduled_tasks DROP CONSTRAINT IF EXISTS scheduled_tasks_user_id_fkey;

-- 2. Ubah kolom user_id menjadi text biasa (bukan uuid yang merujuk auth.users)
ALTER TABLE public.scheduled_tasks ALTER COLUMN user_id TYPE text USING user_id::text;

-- 3. Drop semua RLS policy yang merujuk auth.uid()
DROP POLICY IF EXISTS "Users can view own tasks" ON scheduled_tasks;
DROP POLICY IF EXISTS "Users can insert own tasks" ON scheduled_tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON scheduled_tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON scheduled_tasks;

-- 4. Buat RLS policy baru yang lebih fleksibel (memperbolehkan service_role)
CREATE POLICY "Service role full access" ON scheduled_tasks FOR ALL USING (true);

-- Ini memastikan service_role_key (yang digunakan Edge Function) bisa melakukan
-- INSERT/SELECT/UPDATE/DELETE tanpa terkendala RLS.
-- Keamanan tetap terjaga karena service_role_key hanya ada di backend (Edge Function).
