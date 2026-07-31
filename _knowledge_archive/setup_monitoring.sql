-- Create monitors table
CREATE TABLE IF NOT EXISTS public.monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    interval_sec INTEGER DEFAULT 900,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create checks table
CREATE TABLE IF NOT EXISTS public.checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID REFERENCES public.monitors(id) ON DELETE CASCADE,
    status_code INTEGER,
    response_time_ms INTEGER,
    error TEXT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast querying of checks
CREATE INDEX IF NOT EXISTS checks_monitor_id_checked_at_idx ON public.checks (monitor_id, checked_at DESC);

-- Create incidents table
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID REFERENCES public.monitors(id) ON DELETE CASCADE,
    status TEXT NOT NULL, -- e.g., 'DOWN', 'RESOLVED'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    webhook_sent BOOLEAN DEFAULT false
);

-- Insert a default monitor for the Supabase Edge Function (agent-process)
INSERT INTO public.monitors (name, url, interval_sec)
VALUES ('Mamet AI Backend (agent-process)', 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process', 900);

-- Enable Row Level Security (RLS)
ALTER TABLE public.monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

-- Allow read access for everyone (for the frontend dashboard later)
CREATE POLICY "Allow read access to monitors" ON public.monitors FOR SELECT USING (true);
CREATE POLICY "Allow read access to checks" ON public.checks FOR SELECT USING (true);
CREATE POLICY "Allow read access to incidents" ON public.incidents FOR SELECT USING (true);

-- Allow insert/update for service role only (the edge function)
-- (By default, service_role bypasses RLS, so we don't necessarily need an explicit policy for it)
