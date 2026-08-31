-- =====================================================================================
-- MAMET AI — Memory Governor Addendum Fase 1
-- Tambahkan kolom untuk: Two-Stage Retrieval, Conflict Resolution, Access Tier,
-- dan Soft-Delete Lifecycle ke tabel user_memories.
--
-- IDEMPOTENT: Semua perubahan pakai IF NOT EXISTS — aman dijalankan ulang.
-- BACKWARD COMPATIBLE: Semua kolom baru nullable atau punya DEFAULT value.
-- =====================================================================================

DO $$
BEGIN
    -- ---------------------------------------------------------------------------------
    -- 1. CATEGORY — untuk Two-Stage Filter Tahap 1
    --    Dipakai sebagai filter utama sebelum ranking (no full-table scan)
    --    Default: 'general' agar data lama tetap bisa di-retrieve
    -- ---------------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_memories' AND column_name = 'category'
    ) THEN
        ALTER TABLE public.user_memories
            ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
        RAISE NOTICE 'Kolom category ditambahkan ke user_memories';
    END IF;

    -- ---------------------------------------------------------------------------------
    -- 2. ACCESS TIER — untuk pembatasan akses (Access Tier kontrak Addendum)
    --    Enum nilai: 'generic' | 'sensitive'
    --    Default: 'generic' (TIDAK auto-classify ke sensitive)
    --    Hanya owner yang bisa set ke 'sensitive' via command eksplisit
    -- ---------------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_memories' AND column_name = 'access_tier'
    ) THEN
        ALTER TABLE public.user_memories
            ADD COLUMN access_tier TEXT NOT NULL DEFAULT 'generic'
            CHECK (access_tier IN ('generic', 'sensitive'));
        RAISE NOTICE 'Kolom access_tier ditambahkan ke user_memories';
    END IF;

    -- ---------------------------------------------------------------------------------
    -- 3. STATUS — untuk Soft-Delete Lifecycle (Addendum kontrak)
    --    Enum nilai: 'active' | 'archived' | 'pending_purge' | 'CONFLICT_PENDING_REVIEW'
    --    Default: 'active'
    --    Transisi: active -> archived (background job diizinkan)
    --              archived -> pending_purge -> hard-delete (HANYA via command eksplisit owner)
    --              * -> CONFLICT_PENDING_REVIEW (oleh MemoryGovernorService)
    -- ---------------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_memories' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.user_memories
            ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'archived', 'pending_purge', 'CONFLICT_PENDING_REVIEW'));
        RAISE NOTICE 'Kolom status ditambahkan ke user_memories';
    END IF;

    -- ---------------------------------------------------------------------------------
    -- 4. VERSION SEQUENCE — untuk deteksi konflik di Conflict Resolution
    --    Auto-increment per (user_id, source_reference) group
    --    Default: 1 — data lama dianggap versi 1
    -- ---------------------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_memories' AND column_name = 'version_sequence'
    ) THEN
        ALTER TABLE public.user_memories
            ADD COLUMN version_sequence INTEGER NOT NULL DEFAULT 1;
        RAISE NOTICE 'Kolom version_sequence ditambahkan ke user_memories';
    END IF;

END $$;

-- ---------------------------------------------------------------------------------
-- INDEX untuk performa query Two-Stage Filter (Tahap 1)
-- Tiga kolom paling sering di-filter bersama
-- ---------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_memories_category
    ON public.user_memories(category);

CREATE INDEX IF NOT EXISTS idx_user_memories_access_tier
    ON public.user_memories(access_tier);

CREATE INDEX IF NOT EXISTS idx_user_memories_status
    ON public.user_memories(status);

-- Composite index untuk Two-Stage query utama
CREATE INDEX IF NOT EXISTS idx_user_memories_retrieval
    ON public.user_memories(user_id, category, status, access_tier);

-- =====================================================================================
-- END — Addendum Fase 1 Schema
-- =====================================================================================
