-- ============================================================
-- PATCH: Backup & Restore Schema Hardening
-- Tanggal: 2026-07-13
-- Tujuan: Menambahkan user_id ke tabel memori global dan mengaktifkan RLS 
-- guna mencegah Tenant Isolation Broken saat pemulihan data (restore).
-- ============================================================

-- 1. Tambahkan user_id
ALTER TABLE IF EXISTS project_memory_entries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS engineering_tasks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS architecture_gaps ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS verification_runs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS workspace_summaries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Migrasi data lama (Set ke user pertama yang ada di auth.users sebagai fallback agar data tidak hilang dari akses)
DO $$
DECLARE
    v_first_user UUID;
BEGIN
    SELECT id INTO v_first_user FROM auth.users LIMIT 1;
    IF v_first_user IS NOT NULL THEN
        UPDATE project_memory_entries SET user_id = v_first_user WHERE user_id IS NULL;
        UPDATE engineering_tasks SET user_id = v_first_user WHERE user_id IS NULL;
        UPDATE architecture_gaps SET user_id = v_first_user WHERE user_id IS NULL;
        UPDATE verification_runs SET user_id = v_first_user WHERE user_id IS NULL;
        UPDATE workspace_summaries SET user_id = v_first_user WHERE user_id IS NULL;
    END IF;
END $$;

-- 3. Enforce Not Null setelah migrasi data
DO $$ 
BEGIN 
  ALTER TABLE project_memory_entries ALTER COLUMN user_id SET NOT NULL; 
  ALTER TABLE engineering_tasks ALTER COLUMN user_id SET NOT NULL; 
  ALTER TABLE architecture_gaps ALTER COLUMN user_id SET NOT NULL; 
  ALTER TABLE verification_runs ALTER COLUMN user_id SET NOT NULL; 
EXCEPTION 
  WHEN others THEN NULL; 
END $$;

-- 4. Aktifkan RLS
ALTER TABLE IF EXISTS project_memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS engineering_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS architecture_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS workspace_summaries ENABLE ROW LEVEL SECURITY;

-- 5. Buat Policy RLS
DO $$ BEGIN
    CREATE POLICY "Users can manage their own project memory" ON project_memory_entries FOR ALL USING (auth.uid() = user_id);
    CREATE POLICY "Users can manage their own tasks" ON engineering_tasks FOR ALL USING (auth.uid() = user_id);
    CREATE POLICY "Users can manage their own gaps" ON architecture_gaps FOR ALL USING (auth.uid() = user_id);
    CREATE POLICY "Users can manage their own verification runs" ON verification_runs FOR ALL USING (auth.uid() = user_id);
    CREATE POLICY "Users can manage their own workspace summaries" ON workspace_summaries FOR ALL USING (auth.uid() = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
