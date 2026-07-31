-- SQL schema for memory_audit_logs table

CREATE TABLE IF NOT EXISTS public.memory_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'memory_save_success', 'memory_save_failed', 'memory_retrieval_success', 'memory_retrieval_failed', 'deadline_lookup', 'task_lookup', 'report_generation'
    status TEXT NOT NULL, -- 'SUCCESS', 'FAILED'
    reason TEXT,
    query TEXT,
    matched_memories INTEGER DEFAULT 0,
    execution_time_ms INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.memory_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for Service Role to bypass RLS
CREATE POLICY "Enable insert for service role" ON public.memory_audit_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Index for fast queries on dashboards
CREATE INDEX IF NOT EXISTS idx_memory_audit_logs_event_type ON public.memory_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_memory_audit_logs_status ON public.memory_audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_memory_audit_logs_user_id ON public.memory_audit_logs(user_id);
