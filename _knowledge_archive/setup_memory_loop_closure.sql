-- Level 5 Cognitive Loop Closure Fields
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'healing_version') THEN
        ALTER TABLE public.user_memories ADD COLUMN healing_version INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'last_healed_at') THEN
        ALTER TABLE public.user_memories ADD COLUMN last_healed_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'healing_confidence_score') THEN
        ALTER TABLE public.user_memories ADD COLUMN healing_confidence_score FLOAT DEFAULT 0.0;
    END IF;
END $$;
