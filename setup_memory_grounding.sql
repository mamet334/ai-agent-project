-- Level 5 Truth Grounding Expansion
DO $$
BEGIN
    -- Mengubah tipe State Flag yang sebelumnya Boolean (is_deprecated)
    -- Kita tetap pertahankan is_deprecated untuk backward compatibility Level 4
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'memory_state') THEN
        ALTER TABLE public.user_memories ADD COLUMN memory_state VARCHAR DEFAULT 'ACTIVE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'truth_verification_score') THEN
        ALTER TABLE public.user_memories ADD COLUMN truth_verification_score FLOAT DEFAULT 0.0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'verification_source') THEN
        ALTER TABLE public.user_memories ADD COLUMN verification_source TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'temporal_drift_score') THEN
        ALTER TABLE public.user_memories ADD COLUMN temporal_drift_score FLOAT DEFAULT 0.0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'belief_stability_score') THEN
        ALTER TABLE public.user_memories ADD COLUMN belief_stability_score FLOAT DEFAULT 0.0;
    END IF;
END $$;
