# TODO - AGENT PROCESS HEARTBEAT INTEGRATION

## Plan Steps
1. Add heartbeat adapter at `supabase/functions/agent-process/lib/adapters/heartbeat.ts`.
2. Integrate heartbeat import into `supabase/functions/agent-process/index.ts`.
3. Trigger `pingHeartbeat('agent-process', 'HEALTHY')` in `GET /health`.
4. Trigger `pingHeartbeat('agent-process', 'DOWN')` in global catch block.
5. Add deployment notes for secrets and redeploy.

## Progress
- [x] Step 1: Plan approved
- [x] Step 2: Create heartbeat adapter (`heartbeat.ts`) with `upsert(..., { onConflict: 'service_name' })`
- [x] Step 3: Update `index.ts` imports and `/health` heartbeat call
- [x] Step 4: Update global catch block with DOWN heartbeat
- [x] Step 5: Add operational notes in TODO

## Operational Notes
- [ ] Ensure secret exists: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key`
- [ ] (Recommended) also ensure: `supabase secrets set SUPABASE_URL=your_project_url`
- [ ] Redeploy function: `supabase functions deploy agent-process`
- [ ] Verify endpoint: `GET https://[project].supabase.co/functions/v1/agent-process/health`
