-- Level 5 Cognitive Graph Upgrade
DO $$
BEGIN
    -- Tambahan untuk Graph Nodes & Edges
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'belief_strength') THEN
        ALTER TABLE public.user_memories ADD COLUMN belief_strength FLOAT DEFAULT 1.0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'contradiction_edges') THEN
        ALTER TABLE public.user_memories ADD COLUMN contradiction_edges UUID[] DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'dependency_links') THEN
        ALTER TABLE public.user_memories ADD COLUMN dependency_links UUID[] DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'truth_score') THEN
        ALTER TABLE public.user_memories ADD COLUMN truth_score FLOAT DEFAULT 1.0;
    END IF;

    -- Update merge_reason to rewrite_reason jika belum ada
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_memories' AND column_name = 'rewrite_reason') THEN
        ALTER TABLE public.user_memories ADD COLUMN rewrite_reason TEXT;
    END IF;
END $$;
