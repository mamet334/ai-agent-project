-- Migration script to enforce Idempotent Memory Saves
-- Adds message_hash column and UNIQUE constraint to user_memories

-- 1. Add message_hash column if it does not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'user_memories' 
                   AND column_name = 'message_hash') THEN
        ALTER TABLE public.user_memories ADD COLUMN message_hash TEXT;
    END IF;
END $$;

-- 2. Populate existing records with a hash (to avoid null constraint issues if we wanted to enforce it)
-- Using md5 for simplicity on existing rows (in production we hash in the backend)
UPDATE public.user_memories 
SET message_hash = md5(summary) 
WHERE message_hash IS NULL;

-- 3. Create a UNIQUE constraint on user_id and message_hash
-- This is the final database-level shield against double inserts.
-- Using DO block to safely add constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_memory_hash') THEN
        ALTER TABLE public.user_memories 
        ADD CONSTRAINT unique_user_memory_hash UNIQUE (user_id, message_hash);
    END IF;
END $$;

-- 4. Create an index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_memories_hash ON public.user_memories(user_id, message_hash);

-- =========================================================================
-- LEVEL 4 UPGRADE: Structured Memory Schema
-- =========================================================================
DO $$
BEGIN
    -- Menambahkan tipe memori (fact, preference, event)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'memory_type') THEN
        ALTER TABLE public.user_memories ADD COLUMN memory_type TEXT DEFAULT 'fact';
    END IF;
    -- Menambahkan skor kepercayaan (0.0 - 1.0)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'confidence') THEN
        ALTER TABLE public.user_memories ADD COLUMN confidence FLOAT DEFAULT 1.0;
    END IF;
    -- Menambahkan sumber origin memori
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'source') THEN
        ALTER TABLE public.user_memories ADD COLUMN source TEXT DEFAULT 'user';
    END IF;
END $$;
