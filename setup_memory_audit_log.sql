-- Migration script to create memory_audit_log table

CREATE TABLE IF NOT EXISTS public.memory_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    input_text TEXT NOT NULL,
    detected_intent TEXT NOT NULL,
    confidence FLOAT DEFAULT 0.0,
    action TEXT NOT NULL CHECK (action IN ('STORED', 'SKIPPED', 'REJECTED', 'DEDUPED')),
    reason TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'fact_detector',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes for observability and querying
CREATE INDEX IF NOT EXISTS idx_memory_audit_log_user ON public.memory_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_audit_log_action ON public.memory_audit_log(action);

-- RLS setup (secure for backend writes only via service role)
ALTER TABLE public.memory_audit_log ENABLE ROW LEVEL SECURITY;
