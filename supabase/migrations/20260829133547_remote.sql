-- Migration: 20260829133547_remote.sql
-- Name: add_rls_policies_for_unprotected_tables
-- Description: Add owner-only RLS policies for 6 unprotected tables
-- Reference: docs/project-memory/changelog/2026-08-29-security-hardening-supabase.md

-- knowledge_spaces
CREATE POLICY "Users can manage own knowledge spaces" ON public.knowledge_spaces
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- entity_locks
CREATE POLICY "Users can manage own entity locks" ON public.entity_locks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- chats_backup
CREATE POLICY "Users can view own backup chats" ON public.chats_backup
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- mamet_memory
CREATE POLICY "Users can manage own mamet memory" ON public.mamet_memory
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- memory_audit_log
CREATE POLICY "Users can manage own memory audit log" ON public.memory_audit_log
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- memory_relations
CREATE POLICY "Users can manage own memory relations" ON public.memory_relations
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_memories
    WHERE user_memories.id = memory_relations.source_memory_id
      AND user_memories.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_memories
    WHERE user_memories.id = memory_relations.source_memory_id
      AND user_memories.user_id = auth.uid()
  ));
