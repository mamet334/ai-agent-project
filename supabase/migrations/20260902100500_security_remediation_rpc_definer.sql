-- Migration: 20260902100500_security_remediation_rpc_definer.sql
-- Description: Revoke public/unauthenticated execution on SECURITY DEFINER functions and enforce auth.uid() guards
-- Reference: docs/roadmap/PENDING-supabase-security-advisor-findings.md

-- ============================================================================
-- 1. KATEGORI A: Server-Only / Background Functions
--    Revoke EXECUTE from PUBLIC, anon, and authenticated.
--    (Only superuser / service_role can execute these).
-- ============================================================================

-- 1.1 rls_auto_enable (Event Trigger function - not for direct client RPC)
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- 1.2 cleanup_old_evidence_logs (Maintenance cleanup job)
REVOKE EXECUTE ON FUNCTION public.cleanup_old_evidence_logs() FROM PUBLIC, anon, authenticated;

-- 1.3 advance_lifecycle (Governance Lifecycle transition)
REVOKE EXECUTE ON FUNCTION public.advance_lifecycle(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- 1.4 create_new_version (Governance Knowledge version bump)
REVOKE EXECUTE ON FUNCTION public.create_new_version(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- 1.5 supersede_knowledge (Governance Knowledge atomic supersede)
REVOKE EXECUTE ON FUNCTION public.supersede_knowledge(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 1.6 get_related_knowledge (Governance Graph traversal)
REVOKE EXECUTE ON FUNCTION public.get_related_knowledge(uuid, integer, text[]) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 2. KATEGORI B: Client-Callable Functions with Strict Auth Guard Clause
-- ============================================================================

-- 2.1 check_daily_quota
-- Revoke from anon, allow authenticated & service_role with auth.uid() check
REVOKE EXECUTE ON FUNCTION public.check_daily_quota(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_daily_quota(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_daily_quota(target_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    daily_total numeric;
BEGIN
    -- Guard Clause: Cegah user mengecek kuota user lain (hanya izinkan data miliknya sendiri atau service_role)
    IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM target_user_id THEN
        RAISE EXCEPTION 'Unauthorized: access denied to other users quota';
    END IF;

    SELECT COALESCE(SUM(cost_usd), 0)
    INTO daily_total
    FROM public.api_usage
    WHERE user_id = target_user_id
      AND created_at >= CURRENT_DATE;

    RETURN daily_total;
END;
$$;


-- 2.2 get_active_knowledge
-- Drop existing signature first to avoid return type collision, then recreate with auth.uid() guard
DROP FUNCTION IF EXISTS public.get_active_knowledge(uuid, text[], integer);

CREATE OR REPLACE FUNCTION public.get_active_knowledge(
    p_user_id uuid,
    p_entry_types text[] DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS SETOF public.project_memory_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Guard Clause: Cegah user mengekstrak knowledge user lain (hanya izinkan data miliknya sendiri atau service_role)
    IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: access denied to other users knowledge entries';
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.project_memory_entries
    WHERE (p_user_id IS NULL OR user_id = p_user_id)
      AND governance_status IN ('ACTIVE', 'APPROVED', 'VERIFIED')
      AND (p_entry_types IS NULL OR entry_type = ANY(p_entry_types))
    ORDER BY updated_at DESC
    LIMIT COALESCE(p_limit, 50);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_knowledge(uuid, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_knowledge(uuid, text[], integer) TO authenticated, service_role;
