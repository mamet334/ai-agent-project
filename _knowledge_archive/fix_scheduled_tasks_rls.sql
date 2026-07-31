-- ============================================================
-- MAMET AI: Perbaikan RLS untuk tabel scheduled_tasks
-- ============================================================

-- 1. Hapus SEMUA policy yang ada (lama dan baru)
DROP POLICY IF EXISTS "Service role full access" ON scheduled_tasks;
DROP POLICY IF EXISTS "Users can view own tasks" ON scheduled_tasks;
DROP POLICY IF EXISTS "Users can insert own tasks" ON scheduled_tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON scheduled_tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON scheduled_tasks;

-- 2. Buat policy baru yang membatasi akses per-user
CREATE POLICY "Users can view own tasks"
  ON scheduled_tasks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own tasks"
  ON scheduled_tasks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tasks"
  ON scheduled_tasks FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own tasks"
  ON scheduled_tasks FOR DELETE
  USING (user_id = auth.uid());
