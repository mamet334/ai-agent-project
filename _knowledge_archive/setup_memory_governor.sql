-- =====================================================================================
-- MAMET AI - MEMORY GOVERNOR (FASE 1) Setup
-- Golden Source Memory Layer: Anti-Bias & Memory Maintenance
-- =====================================================================================
-- Prinsip:
--   - Data mentah (raw content) disimpan di tabel terpisah `raw_memory_content`.
--   - Ringkasan di `user_memories` hanya pointer/metadata ke raw content.
--   - Metadata wajib: source_reference, timestamp, version_code, chat_id.
--
-- BACKWARD COMPATIBILITY:
--   - SEMUA kolom baru bersifat NULLABLE agar write backend yang tersedia
--     (memory_write_worker.ts, memory_manager_v1.ts) TIDAK gagal.
--   - Data lama tanpa metadata tetap berfungsi dan tidak crash.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. TABEL BARU: raw_memory_content (Golden Source)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.raw_memory_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    source_type TEXT DEFAULT 'fact',
    source_reference TEXT,
    chat_id TEXT,
    version_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index untuk lookup cepat
CREATE INDEX IF NOT EXISTS idx_raw_memory_user ON public.raw_memory_content(user_id);
CREATE INDEX IF NOT EXISTS idx_raw_memory_source_ref ON public.raw_memory_content(source_reference);
CREATE INDEX IF NOT EXISTS idx_raw_memory_hash ON public.raw_memory_content(content_hash);

-- RLS: aktifkan, dan izinkan service_role (default) untuk bypass
ALTER TABLE public.raw_memory_content ENABLE ROW LEVEL SECURITY;

-- RLS aktif untuk user: pengguna dapat membaca/menulis memori miliknya sendiri
CREATE POLICY "Enable read own raw memory" ON public.raw_memory_content
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Enable insert own raw memory" ON public.raw_memory_content
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- -------------------------------------------------------------------------------------
-- 2. ALTER TABEL user_memories: Tambah kolom golden source (SEMUA NULLABLE)
-- -------------------------------------------------------------------------------------
DO $$
BEGIN
    -- Referensi ke raw_memory_content.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'raw_content_id') THEN
        ALTER TABLE public.user_memories ADD COLUMN raw_content_id UUID;
    END IF;

    -- Reference ke sumber/konteks asli (misal path file, doc id)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'source_reference') THEN
        ALTER TABLE public.user_memories ADD COLUMN source_reference TEXT;
    END IF;

    -- Kode versi (untuk melacak perubahan)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'version_code') THEN
        ALTER TABLE public.user_memories ADD COLUMN version_code TEXT;
    END IF;

    -- Chat ID terkait
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'chat_id') THEN
        ALTER TABLE public.user_memories ADD COLUMN chat_id TEXT;
    END IF;

    -- Timestamp verifikasi terakhir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'last_verified_at') THEN
        ALTER TABLE public.user_memories ADD COLUMN last_verified_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Index pendukung untuk lookup via source_reference
CREATE INDEX IF NOT EXISTS idx_user_memories_source_ref ON public.user_memories(source_reference);
CREATE INDEX IF NOT EXISTS idx_user_memories_raw_content ON public.user_memories(raw_content_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_chat_id ON public.user_memories(chat_id);

-- =====================================================================================
-- END SETUP
-- =====================================================================================
