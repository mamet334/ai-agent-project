-- Dashboard SQL Query untuk memantau performa Shadow Mode (RFC-015)
-- Dijalankan pada Supabase SQL Editor

-- 1. Total Eksekusi berdasarkan Keputusan (Shadow Mode)
SELECT 
    event_type,
    metadata->>'decision' AS dispatcher_decision,
    COUNT(*) AS total_count
FROM 
    agent_logs
WHERE 
    event_type = 'TOOL_DISPATCHER_AUDIT'
    AND metadata->>'dispatcher_mode' = 'SHADOW'
GROUP BY 
    event_type, dispatcher_decision
ORDER BY 
    total_count DESC;

-- 2. False Positive Analysis (Alat sah namun mendapat WOULD_DENY)
-- Menyoroti alat mana saja yang berisiko terblokir secara tidak adil jika Hard Enforcement diaktifkan.
SELECT 
    created_at,
    metadata->>'tool_name' AS tool,
    metadata->>'target' AS target,
    metadata->>'reason' AS deny_reason
FROM 
    agent_logs
WHERE 
    event_type = 'TOOL_DISPATCHER_AUDIT'
    AND metadata->>'decision' = 'WOULD_DENY'
ORDER BY 
    created_at DESC
LIMIT 50;

-- 3. Rasio Blokir Harian
SELECT 
    DATE(created_at) as log_date,
    SUM(CASE WHEN metadata->>'decision' = 'ALLOW' THEN 1 ELSE 0 END) AS count_allow,
    SUM(CASE WHEN metadata->>'decision' = 'WOULD_DENY' THEN 1 ELSE 0 END) AS count_would_deny
FROM 
    agent_logs
WHERE 
    event_type = 'TOOL_DISPATCHER_AUDIT'
GROUP BY 
    DATE(created_at)
ORDER BY 
    log_date DESC;
