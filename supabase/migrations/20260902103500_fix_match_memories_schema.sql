-- Migration: 20260902103500_fix_match_memories_schema.sql
-- Description: Fix column name (summary instead of content) and type casting (uuid) in match_memories RPC
-- Reference: docs/roadmap/PENDING-live-verification-runtime-gaps.md (Item 3)

-- 1. Drop existing overloads
DROP FUNCTION IF EXISTS public.match_memories(vector, double precision, integer);
DROP FUNCTION IF EXISTS public.match_memories(vector, double precision, integer, uuid);
DROP FUNCTION IF EXISTS public.match_memories(vector, double precision, integer, text);
DROP FUNCTION IF EXISTS public.match_memories(extensions.vector, double precision, integer);
DROP FUNCTION IF EXISTS public.match_memories(extensions.vector, double precision, integer, uuid);
DROP FUNCTION IF EXISTS public.match_memories(extensions.vector, double precision, integer, text);

-- 2. Overload 1: Unfiltered / Global
CREATE OR REPLACE FUNCTION public.match_memories(
    query_embedding vector,
    match_threshold double precision,
    match_count integer
)
RETURNS TABLE (
    id uuid,
    summary text,
    similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        user_memories.id,
        user_memories.summary,
        1 - (user_memories.embedding <=> query_embedding) AS similarity
    FROM public.user_memories
    WHERE 1 - (user_memories.embedding <=> query_embedding) > match_threshold
    ORDER BY user_memories.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 3. Overload 2: With target_user_id (UUID filter)
CREATE OR REPLACE FUNCTION public.match_memories(
    query_embedding vector,
    match_threshold double precision,
    match_count integer,
    target_user_id uuid
)
RETURNS TABLE (
    id uuid,
    summary text,
    similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        user_memories.id,
        user_memories.summary,
        1 - (user_memories.embedding <=> query_embedding) AS similarity
    FROM public.user_memories
    WHERE user_memories.user_id = target_user_id
      AND 1 - (user_memories.embedding <=> query_embedding) > match_threshold
    ORDER BY user_memories.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 4. Set Permissions
REVOKE EXECUTE ON FUNCTION public.match_memories(vector, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_memories(vector, double precision, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.match_memories(vector, double precision, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_memories(vector, double precision, integer, uuid) TO authenticated, service_role;
