-- =========================================================================
-- SECURE PRODUCTION-READY RLS POLICY FOR USER_MEMORIES
-- =========================================================================

-- 1. Pastikan RLS diaktifkan
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

-- 2. Hapus kebijakan lama untuk menghindari konflik
DROP POLICY IF EXISTS "allow insert for all" ON public.user_memories;
DROP POLICY IF EXISTS "insert own memory" ON public.user_memories;
DROP POLICY IF EXISTS "select own memory" ON public.user_memories;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_memories;

-- 3. Policy INSERT: Aman + User Scoped
CREATE POLICY "insert own memory"
ON public.user_memories
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = user_id);

-- 4. Policy SELECT: Hanya bisa melihat data milik sendiri
CREATE POLICY "select own memory"
ON public.user_memories
FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id);

-- 5. Policy UPDATE: Hanya bisa update data milik sendiri
CREATE POLICY "update own memory"
ON public.user_memories
FOR UPDATE
TO authenticated
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

-- 6. Policy DELETE: Hanya bisa hapus data milik sendiri
CREATE POLICY "delete own memory"
ON public.user_memories
FOR DELETE
TO authenticated
USING (auth.uid()::text = user_id);

-- Catatan Penting Arsitektur:
-- Edge Function akan tetap mampu melakukan bypass terhadap RLS ini 
-- KARENA menggunakan SUPABASE_SERVICE_ROLE_KEY pada backend (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')).
-- Frontend DILARANG menyentuh tabel ini secara langsung tanpa validasi Edge Function.
