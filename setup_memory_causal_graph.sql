-- Level 5 Causal Memory Graph & Truth Justification Extensions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'justification_chain') THEN
        ALTER TABLE public.user_memories ADD COLUMN justification_chain TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'evidence_sources') THEN
        ALTER TABLE public.user_memories ADD COLUMN evidence_sources TEXT[] DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'causal_links') THEN
        ALTER TABLE public.user_memories ADD COLUMN causal_links TEXT[] DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'reasoning_depth_score') THEN
        ALTER TABLE public.user_memories ADD COLUMN reasoning_depth_score FLOAT DEFAULT 0.0;
    END IF;

    -- Update memory_type domain conceptually to include: FACT, PREFERENCE, INTERPRETATION, CONFLICTED, DERIVED
END $$;
