# TASK-0008: Execute Project Memory Schema Migration

Status: Proposed
Owner: Mamet Engineer
Phase: 3

## Goal

Execute the Project Memory database schema against Supabase production (BrainBox AI) to make Project Memory queryable at runtime by Mamet Engineer.

## Prerequisite

- TASK-0006 Done: Schema designed (`project-memory-schema-draft.sql`)
- TECH-SPEC-0006 available

## Scope

Run `docs/tasks/project-memory-schema-draft.sql` via Supabase dashboard SQL editor or Supabase CLI.

## Acceptance Criteria

- All 4 tables created: `project_memory_entries`, `engineering_tasks`, `architecture_gaps`, `verification_runs`
- RLS enabled on all tables
- Triggers active (updated_at auto-refresh)
- Indexes created
- Supabase dashboard confirms tables exist

## Next After This

- TASK-0009: Backfill existing docs/project-memory/ baseline entries to database
- TASK-0010: Integrate Project Memory read into agent-process Engineer mode
