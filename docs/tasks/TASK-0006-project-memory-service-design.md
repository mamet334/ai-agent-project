# TASK-0006: Design Project Memory Service

Status: Proposed
Owner: Mamet Engineer

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

- Schema draft exists.
- Security model exists.
- Runtime read/write flow is documented.
- Migration task can be created from the design.

