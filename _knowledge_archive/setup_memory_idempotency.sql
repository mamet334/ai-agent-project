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
SET message_hash = md5(summary || id::text) 
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
    -- Menambahkan metadata untuk multi-label tags (Sub-Role Context Tagging)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'metadata') THEN
        ALTER TABLE public.user_memories ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
    -- Menambahkan state untuk node lifecycle di Temporal Semantic Graph
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'state') THEN
        ALTER TABLE public.user_memories DROP COLUMN state;
    END IF;
END $$;

-- =========================================================================
-- LEVEL 8 UPGRADE: Derived State Projection Engine (CQRS Read Model)
-- =========================================================================
CREATE OR REPLACE VIEW public.active_user_memories AS
SELECT um.*
FROM public.user_memories um
WHERE NOT EXISTS (
    SELECT 1 FROM public.memory_relations mr
    WHERE mr.source_memory_id = um.id
    AND mr.relation_type = 'OVERRIDES'
);

-- =========================================================================
-- LEVEL 5 UPGRADE: Distributed Entity Locking (Truth-State Memory Layer)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.entity_locks (
    user_id UUID NOT NULL,
    entity_instance_id TEXT NOT NULL,
    value TEXT NOT NULL,
    state TEXT DEFAULT 'locked',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (user_id, entity_instance_id)
);

-- Enable RLS but allow service_role bypass (default behavior)
ALTER TABLE public.entity_locks ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- LEVEL 6 UPGRADE: Atomic Distributed Lock (Transaction Barrier)
-- =========================================================================
CREATE OR REPLACE FUNCTION atomic_entity_lock(
  p_user_id UUID,
  p_entity_instance_id TEXT,
  p_value TEXT,
  p_explicit_correction BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing RECORD;
  v_time_diff_ms NUMERIC;
BEGIN
  -- Lock the row for update to prevent race conditions
  SELECT * INTO v_existing FROM entity_locks 
  WHERE user_id = p_user_id AND entity_instance_id = p_entity_instance_id 
  FOR UPDATE;
  
  IF FOUND THEN
    IF v_existing.value != p_value AND NOT p_explicit_correction THEN
      v_time_diff_ms := EXTRACT(EPOCH FROM (now() - v_existing.updated_at)) * 1000;
      
      -- Conflict if within 5 minutes and no explicit correction
      IF v_time_diff_ms < 300000 THEN 
        RETURN jsonb_build_object(
          'status', 'conflicted',
          'old_value', v_existing.value,
          'old_memory_id', v_existing.active_memory_id
        );
      END IF;
    END IF;
  END IF;
  
  -- Upsert the lock
  INSERT INTO entity_locks (user_id, entity_instance_id, value, state, updated_at)
  VALUES (p_user_id, p_entity_instance_id, p_value, 'locked', now())
  ON CONFLICT (user_id, entity_instance_id) 
  DO UPDATE SET value = EXCLUDED.value, state = 'locked', updated_at = now();
  
  RETURN jsonb_build_object(
    'status', 'success',
    'replaced_memory_id', CASE WHEN FOUND AND v_existing.value != p_value THEN v_existing.active_memory_id ELSE NULL END
  );
END;
$$;

-- =========================================================================
-- LEVEL 7 UPGRADE: Contradiction Graph (Missing Semantic Backbone)
-- =========================================================================

-- 1. Create memory_relations table for the semantic graph
CREATE TABLE IF NOT EXISTS public.memory_relations (
    source_memory_id UUID NOT NULL, -- Reference to user_memories(id), skipping explicit constraint if type unknown
    target_memory_id UUID NOT NULL,
    relation_type TEXT NOT NULL, -- 'OVERRIDES', 'REFINES', 'INVALIDATES', 'COEXISTS_WITH'
    reason_type TEXT DEFAULT 'implicit_temporal_update', -- 'user_explicit_correction', 'implicit_temporal_update', etc
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (source_memory_id, target_memory_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_relations_source ON public.memory_relations(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_relations_target ON public.memory_relations(target_memory_id);

ALTER TABLE public.memory_relations ENABLE ROW LEVEL SECURITY;

-- 2. Add active_memory_id to entity_locks to track the active node in the graph
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entity_locks' AND column_name = 'active_memory_id') THEN
        ALTER TABLE public.entity_locks ADD COLUMN active_memory_id UUID; -- Reference to user_memories(id)
    END IF;
END $$;
