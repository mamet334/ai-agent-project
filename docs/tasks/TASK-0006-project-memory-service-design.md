# TASK-0006: Design Project Memory Service

Status: Done
Owner: Mamet Engineer
Date: 2026-06-27
Phase: 2

## Goal

Design a structured Project Memory service so Mamet Engineer can store and retrieve engineering knowledge separately from User Memory and Knowledge RAG.

## Problem

Project Memory currently exists as documentation. This is enough for baseline governance, but not enough for a future runtime Engineer capability.

## Proposed Scope

- Database schema for Project Memory.
- RLS and ownership model.
- Entry status model:
  - Hypothesis
  - In Progress
  - Verified
  - Deprecated
  - Rejected
- Entry types:
  - Bug
  - Root Cause
  - Solution
  - Lesson
  - ADR Link
  - Task
  - Verification
  - Release Note
- API or Edge Function plan.

## Acceptance Criteria

- [x] Schema draft exists: `docs/tasks/project-memory-schema-draft.sql`
- [x] Security model exists: RLS policies defined (service_role full access)
- [x] Runtime read/write flow documented: `docs/tasks/TECH-SPEC-0006-project-memory-service.md`
- [x] Migration task identified: TASK-0008 (Phase 3)

## Verification

Deliverables produced:
- `docs/tasks/TECH-SPEC-0006-project-memory-service.md` — Full technical specification
- `docs/tasks/project-memory-schema-draft.sql` — SQL schema (4 tables + RLS + triggers + indexes)

Tables designed:
- `project_memory_entries` — entries with type, status, tags
- `engineering_tasks` — task registry (database mirror of docs/tasks/)
- `architecture_gaps` — gap register (database mirror of ARCHITECTURE-GAPS.md)
- `verification_runs` — verification history per task

Next: TASK-0008 will execute the migration against Supabase production.
