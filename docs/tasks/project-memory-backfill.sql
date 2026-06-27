-- ============================================================
-- PROJECT MEMORY BACKFILL — Baseline Entries
-- Task: TASK-0009
-- Date: 2026-06-27
-- Source: docs/project-memory/PROJECT-MEMORY.md
-- ============================================================

-- Engineering Tasks (mirror dari docs/tasks/)
INSERT INTO engineering_tasks (task_number, title, status, phase, goal) VALUES
('TASK-0001', 'Establish MAEF-aligned documentation baseline', 'Done', 1, 'Create the foundational governance documentation structure aligned with MAEF.'),
('TASK-0002', 'Repair agent-process execution context', 'Done', 1, 'Fix invalid MametExecutionContext structure and IDOR vulnerability via JWT auth binding.'),
('TASK-0003', 'Enforce MametLite source boundary', 'Done', 1, 'Enforce appSource: mametlite policy and memory isolation in agent-process.'),
('TASK-0004', 'Repair Windows build pipeline', 'Done', 1, 'Fix npm build execution on Windows via cmd instead of PowerShell.'),
('TASK-0005', 'Create Mamet Engineer Blueprint', 'Done', 2, 'Define Mamet Engineer identity, responsibilities, lifecycle, and runtime stages.'),
('TASK-0006', 'Design Project Memory Service', 'Done', 2, 'Design schema, RLS, and read/write flow for Project Memory database service.'),
('TASK-0007', 'Implement Engineer Policy Boundary', 'Done', 2, 'Add ENGINEER mode to MametCapabilityMode and appSource: engineer routing.'),
('TASK-0008', 'Execute Project Memory Schema Migration', 'Done', 3, 'Execute project-memory-schema-draft.sql against Supabase production.'),
('TASK-0009', 'Backfill Project Memory baseline entries', 'InProgress', 3, 'Insert baseline engineering knowledge from docs/ into database tables.')
ON CONFLICT (task_number) DO NOTHING;

-- Architecture Gaps (dari docs/architecture/ARCHITECTURE-GAPS.md)
INSERT INTO architecture_gaps (gap_number, title, status, description, related_task) VALUES
('GAP-0001', 'MametLite reads User Memory by default', 'Resolved', 'MametLite did not enforce read-only isolation from User Memory. appSource policy was missing.', 'TASK-0003'),
('GAP-0002', 'agent-process context object had invalid structure', 'Resolved', 'MametExecutionContext used dotted property names and premature ctx usage.', 'TASK-0002'),
('GAP-0003', 'No formal governance documentation structure', 'Resolved', 'No MAEF, ADR, Task, or Project Memory documentation existed.', 'TASK-0001'),
('GAP-0004', 'Windows build pipeline failure', 'Resolved', 'npm build failed via PowerShell due to path handling. Fixed via cmd.', 'TASK-0004'),
('GAP-0005', 'No Engineer capability boundary in backend', 'Resolved', 'Engineer requests inherited full AI permissions. ENGINEER mode missing.', 'TASK-0007'),
('GAP-0006', 'Project Memory exists only as documentation', 'InProgress', 'No queryable database for engineering knowledge. Schema designed; migration done.', 'TASK-0008')
ON CONFLICT (gap_number) DO NOTHING;

-- Project Memory Entries — Key Findings
INSERT INTO project_memory_entries (entry_type, status, title, content, related_task, tags) VALUES
('RootCause', 'Verified', 'Windows build pipeline fails via PowerShell npm', 'npm.ps1 path handling in PowerShell breaks build. Fix: use cmd /c npm run build instead.', 'TASK-0004', ARRAY['build','windows','pipeline']),
('Solution', 'Verified', 'MametLite memory isolation via appSource policy', 'Setting appSource: mametlite in callAgentSimple.js payload triggers policy: canReadMemory: false, canWriteMemory: false in agent-process.', 'TASK-0003', ARRAY['mametlite','security','memory']),
('Solution', 'Verified', 'Engineer capability boundary via appSource: engineer', 'ENGINEER mode blocks canWriteMemory, canUseAutomation, canUseDesktopTools while allowing full reasoning and RAG read.', 'TASK-0007', ARRAY['engineer','policy','security']),
('Verification', 'Verified', 'agent-process v246 deployed and live', 'Deployed to BrainBox AI (ref: uuyzdjifhdfyyvpxsofu). OPTIONS CORS 200. health-check 200. agent_logs accessible.', 'TASK-0002', ARRAY['deploy','supabase','runtime']),
('ReleaseNote', 'Verified', 'Phase 1 complete: Core Runtime Stabilized', 'All Phase 1 exit criteria met: builds pass, MametLite boundary enforced, agent-process deployed v246.', 'TASK-0002', ARRAY['phase1','release']),
('ReleaseNote', 'Verified', 'Phase 2 complete: Mamet Engineer Foundation', 'Engineer Blueprint adopted, Project Memory designed, Engineer policy boundary live in production.', 'TASK-0007', ARRAY['phase2','release'])
ON CONFLICT DO NOTHING;

-- Verification Runs
INSERT INTO verification_runs (related_task, verification_type, result, evidence, command_used) VALUES
('TASK-0002', 'StaticAnalysis', 'Pass', 'tsc parse: no new errors introduced. Pre-existing Deno/remote import errors are baseline.', 'tsc --noEmit'),
('TASK-0002', 'Deploy', 'Pass', 'agent-process v246 deployed. Exit 0. Status: ACTIVE.', 'npx supabase functions deploy agent-process'),
('TASK-0002', 'Runtime', 'Pass', 'OPTIONS /functions/v1/agent-process -> HTTP 200, CORS header *', 'fetch OPTIONS'),
('TASK-0003', 'StaticAnalysis', 'Pass', 'appSource: mametlite confirmed in callAgentSimple.js payload (line 77). Policy matrix verified in index.ts.', 'manual code review'),
('TASK-0004', 'Build', 'Pass', 'mametlite: built in 627ms. frontend: built in 17.48s. Exit 0.', 'cmd /c npm run build'),
('TASK-0007', 'StaticAnalysis', 'Pass', 'ENGINEER mode added to MametCapabilityMode. No new syntax errors. Policy matrix complete.', 'tsc --noEmit'),
('TASK-0007', 'Deploy', 'Pass', 'agent-process deployed post ENGINEER mode addition. Exit 0. Status: ACTIVE.', 'npx supabase functions deploy agent-process'),
('TASK-0008', 'Runtime', 'Pass', '4 tables confirmed: project_memory_entries, engineering_tasks, architecture_gaps, verification_runs. RLS: true for all.', 'npx supabase db query --linked -f project-memory-schema-draft.sql')
ON CONFLICT DO NOTHING;
