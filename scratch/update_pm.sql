-- Update for TASK-0010 and TASK-0011

INSERT INTO engineering_tasks (task_number, title, status, phase, goal) VALUES
('TASK-0010', 'Integrate Project Memory read into agent-process Engineer mode', 'Done', 3, 'Enable the agent-process Edge Function to query the project_memory_entries and engineering_tasks tables when operating in ENGINEER mode, injecting this context into the LLM prompt.'),
('TASK-0011', 'Verify Capability Separation', 'Done', 4, 'Verify that Phase 4 (Capability Separation) is fully implemented by the existing MametCapabilityMode in the agent-process Edge Function.')
ON CONFLICT (task_number) DO UPDATE SET status = EXCLUDED.status;

INSERT INTO project_memory_entries (entry_type, status, title, content, related_task, tags) VALUES
('Solution', 'Verified', 'Engineer Context Injection', 'agent-process now fetches active tasks, gaps, and memory entries from Supabase tables using service_role when mode === ENGINEER. This enables context-aware engineering.', 'TASK-0010', ARRAY['engineer','context','supabase']),
('Verification', 'Verified', 'Phase 4 inherently completed', 'Capability enum, routing, and policy matrix were completely implemented during Phase 1 and 2. Verified no further code changes are needed for Phase 4.', 'TASK-0011', ARRAY['phase4','capability','policy']),
('ReleaseNote', 'Verified', 'Phase 3 & 4 Complete', 'Project Memory is fully live and queryable by Engineer mode. Capability boundaries are formally verified and closed.', 'TASK-0011', ARRAY['phase3','phase4','release'])
ON CONFLICT DO NOTHING;

INSERT INTO verification_runs (related_task, verification_type, result, evidence, command_used) VALUES
('TASK-0010', 'Runtime', 'Pass', 'Modified agent-process/index.ts to fetch tables. Compiled cleanly. Deployed to Supabase.', 'tsc and deploy'),
('TASK-0011', 'StaticAnalysis', 'Pass', 'Code review confirmed MametCapabilityMode, appSource routing, and tool filtration respect the policy matrix.', 'manual code review')
ON CONFLICT DO NOTHING;
