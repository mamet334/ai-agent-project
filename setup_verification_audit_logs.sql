-- setup_verification_audit_logs.sql
-- Skema Database untuk menyimpan log audit dari Verification Engine (Hard Gate)

CREATE TABLE IF NOT EXISTS public.verification_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata Request
    timestamp TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    request_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Core Decision Engine Metrics
    decision TEXT NOT NULL, -- 'PASS' | 'FAIL'
    status TEXT NOT NULL,   -- 'PASS' | 'FAIL' | 'WARN'
    score INTEGER NOT NULL,
    execution_time_ms NUMERIC,
    
    -- Detailed Checks & Object
    checks JSONB DEFAULT '[]'::jsonb,
    failures JSONB DEFAULT '[]'::jsonb,
    source_trace TEXT,
    confidence JSONB,
    evidence JSONB
);

-- Row Level Security (RLS)
ALTER TABLE public.verification_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Hanya Edge Function (Service Role) yang bisa Insert, 
-- User hanya bisa melihat log milik mereka sendiri
CREATE POLICY "Users can view their own verification logs"
    ON public.verification_audit_logs
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service Role can insert verification logs"
    ON public.verification_audit_logs
    FOR INSERT
    WITH CHECK (true); -- Service Role bypasses RLS anyway, but good to have explicit

-- Index untuk mempercepat query analitik Dashboard Admin
CREATE INDEX IF NOT EXISTS idx_verif_audit_decision ON public.verification_audit_logs(decision);
CREATE INDEX IF NOT EXISTS idx_verif_audit_user_id ON public.verification_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_verif_audit_created_at ON public.verification_audit_logs(created_at DESC);
