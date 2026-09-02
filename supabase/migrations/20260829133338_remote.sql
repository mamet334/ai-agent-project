-- Migration: 20260829133338_remote.sql
-- Name: harden_rpc_security_revoke_anon_and_fix_search_path_v2
-- Description: Set immutable search_path on 15 SECURITY DEFINER functions
-- Reference: docs/project-memory/changelog/2026-08-29-security-hardening-supabase.md

ALTER FUNCTION public.check_daily_quota(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_memories() SET search_path = public, pg_temp;
ALTER FUNCTION public.atomic_entity_lock(uuid, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.extract_cognitive_subgraph(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_memory_stats() SET search_path = public, pg_temp;
ALTER FUNCTION public.match_documents(extensions.vector, integer, text, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_core_deletion() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_old_evidence_logs() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_active_knowledge(uuid, text[], integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.supersede_knowledge(uuid, uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.advance_lifecycle(uuid, text, text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_new_version(uuid, text, text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_related_knowledge(uuid, integer, text[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.rls_auto_enable() SET search_path = public, pg_temp;
