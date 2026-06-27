# TASK-0010: Integrate Project Memory read into agent-process Engineer mode

Status: Done
Owner: Mamet Engineer
Phase: 3
Date: 2026-06-27

## Verification
- Modified `agent-process/index.ts` to fetch `engineering_tasks`, `architecture_gaps`, and `project_memory_entries` when `mode === 'ENGINEER'`.
- Compiled cleanly with `tsc`.
- Deployed successfully to Supabase.
- Roadmap Phase 3 closed as Done.

## Goal

Enable the `agent-process` Edge Function to query the `project_memory_entries` and `engineering_tasks` tables when operating in `ENGINEER` mode, injecting this context into the LLM prompt.

## Problem

Currently, `ENGINEER` mode has the correct capability boundaries (e.g. block memory writes and automation), but it does not actually fetch the project memory data from the newly created Supabase tables. 

## Scope

- In `supabase/functions/agent-process/index.ts`, detect if `policy.mode === "ENGINEER"`.
- If true, fetch recent/relevant entries from `project_memory_entries`, `engineering_tasks`, `architecture_gaps`.
- Inject these records into the context string (e.g. into `ctx.request.finalMessage` or `ctx.state.memoryArray`).
- Ensure we use the service role key to bypass RLS, or ensure the query matches RLS policies. RLS policies allow `service_role` full access. Since edge functions run securely and often use service roles to fetch global data, we can use the `SUPABASE_SERVICE_ROLE_KEY` client already created in `agent-process` or a dedicated client.
- Optimize the retrieval: fetch active gaps, recent entries, open tasks, etc.

## Acceptance Criteria

- `agent-process` fetches from project memory tables when `mode === "ENGINEER"`.
- This data is included in the context for the LLM.
- Assistant and LITE modes do NOT fetch this data.
- Deployed successfully and verified.
