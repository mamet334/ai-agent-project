-- Level 5 Migration: Self-Healing Memory Fields
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'is_deprecated') THEN
        ALTER TABLE public.user_memories ADD COLUMN is_deprecated BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'merged_from_ids') THEN
        ALTER TABLE public.user_memories ADD COLUMN merged_from_ids TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'merge_reason') THEN
        ALTER TABLE public.user_memories ADD COLUMN merge_reason TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'conflict_score') THEN
        ALTER TABLE public.user_memories ADD COLUMN conflict_score FLOAT DEFAULT 0.0;
    END IF;
END $$;
