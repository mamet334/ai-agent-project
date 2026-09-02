-- Migration: 20260829133308_remote.sql
-- Name: harden_rpc_security_revoke_public_grant_authenticated_only
-- Description: Revoke public execution from destructive SECURITY DEFINER functions and grant to authenticated only
-- Reference: docs/project-memory/changelog/2026-08-29-security-hardening-supabase.md

REVOKE EXECUTE ON FUNCTION public.advance_lifecycle(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_lifecycle(uuid, text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_new_version(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_new_version(uuid, text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.supersede_knowledge(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supersede_knowledge(uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_evidence_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_evidence_logs() TO authenticated;
