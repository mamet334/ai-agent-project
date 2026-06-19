-- SQL script to create the ai_system_logs table for Mamet AI Observability Layer

CREATE TABLE IF NOT EXISTS public.ai_system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    llm_call_count INTEGER NOT NULL DEFAULT 0,
    model_used TEXT NOT NULL,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    memory_fetch_count INTEGER NOT NULL DEFAULT 0,
    memory_write_count INTEGER NOT NULL DEFAULT 0,
    error_flag BOOLEAN NOT NULL DEFAULT false,
    cost_alert_flag BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.ai_system_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for Service Role to bypass RLS
CREATE POLICY "Enable insert for service role" ON public.ai_system_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Index for querying cost alerts and latency spikes
CREATE INDEX IF NOT EXISTS idx_ai_system_logs_cost_alert ON public.ai_system_logs(cost_alert_flag) WHERE cost_alert_flag = true;
CREATE INDEX IF NOT EXISTS idx_ai_system_logs_latency ON public.ai_system_logs(latency_ms);
CREATE INDEX IF NOT EXISTS idx_ai_system_logs_user_id ON public.ai_system_logs(user_id);
