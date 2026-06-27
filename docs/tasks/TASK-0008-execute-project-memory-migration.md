# TASK-0008: Execute Project Memory Schema Migration

Status: Done
Owner: Mamet Engineer
Date: 2026-06-27
Phase: 3

## Goal

Execute the Project Memory database schema against Supabase production (BrainBox AI) to make Project Memory queryable at runtime by Mamet Engineer.

## Prerequisite

- TASK-0006 Done: Schema designed (`project-memory-schema-draft.sql`)
- TECH-SPEC-0006 available

## Scope

Run `docs/tasks/project-memory-schema-draft.sql` via Supabase dashboard SQL editor or Supabase CLI.

## Verification — Runtime Evidence (2026-06-27)

Command: `npx supabase db query --linked -f docs/tasks/project-memory-schema-draft.sql`
Result: Exit 0, rows: [] (DDL success)

**Tables confirmed in Supabase (information_schema.tables):**

| table_name | table_type | rowsecurity |
|---|---|---|
| project_memory_entries | BASE TABLE | ✅ true |
| engineering_tasks | BASE TABLE | ✅ true |
| architecture_gaps | BASE TABLE | ✅ true |
| verification_runs | BASE TABLE | ✅ true |

Next: TASK-0009 — Backfill baseline entries.

## Next After This

- TASK-0009: Backfill existing docs/project-memory/ baseline entries to database
- TASK-0010: Integrate Project Memory read into agent-process Engineer mode
