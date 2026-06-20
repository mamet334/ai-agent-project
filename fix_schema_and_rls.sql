-- =========================================================================
-- FINAL ARCHITECTURE FIX: SCHEMA CORRECTION & SECURE RLS
-- =========================================================================

-- 1. RESET RLS (Hapus semua policy lama yang bergantung pada kolom user_id)
DROP POLICY IF EXISTS "allow insert for all" ON public.user_memories;
DROP POLICY IF EXISTS "insert own memory" ON public.user_memories;
DROP POLICY IF EXISTS "select own memory" ON public.user_memories;
DROP POLICY IF EXISTS "update own memory" ON public.user_memories;
DROP POLICY IF EXISTS "delete own memory" ON public.user_memories;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_memories;

-- 2. DROP VIEW SEMENTARA (Karena view mengunci tipe data dari tabel referensinya)
DROP VIEW IF EXISTS public.active_user_memories;

-- 3. CLEANUP INVALID DATA (Hapus data dummy/test yang bukan UUID valid)
-- Menghapus baris yang user_id-nya tidak sesuai format UUID (misal: "test_user")
DELETE FROM public.user_memories
WHERE user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- 4. FIX SCHEMA: DUAL FAILURE MODE RESOLUTION
-- Mengubah tipe data user_id dari TEXT menjadi UUID (sekarang aman karena policy, view & invalid data sudah dihapus)
ALTER TABLE public.user_memories 
ALTER COLUMN user_id TYPE uuid 
USING user_id::uuid;

-- 5. REBUILD VIEW (Kembalikan view seperti semula)
CREATE OR REPLACE VIEW public.active_user_memories AS
SELECT um.*
FROM public.user_memories um
WHERE NOT EXISTS (
    SELECT 1 FROM public.memory_relations mr
    WHERE mr.source_memory_id = um.id
    AND mr.relation_type = 'OVERRIDES'
);

-- 6. ENABLE RLS
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

-- 7. REBUILD POLICY CLEAN: Direct Match (No Type Casting Hack)
-- Policy INSERT
CREATE POLICY "insert own memory"
ON public.user_memories
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy SELECT
CREATE POLICY "select own memory"
ON public.user_memories
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy UPDATE
CREATE POLICY "update own memory"
ON public.user_memories
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy DELETE
CREATE POLICY "delete own memory"
ON public.user_memories
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- KESIMPULAN ARSITEKTUR:
-- Guard kini berjalan tanpa "crash", RLS dievaluasi murni pada tipe data yang setara (UUID = UUID).
