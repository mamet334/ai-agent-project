-- Log ADR-0007 to Project Memory
INSERT INTO engineering_tasks (task_number, title, status, phase, goal) VALUES
('TASK-0016', 'Engineering Metrics — Derived Definition (ADR-0007)', 'Done', 6, 'Define and document Engineering Metrics as derived queries from existing tables. Defer engineering_metrics table until real need (performance, trend history, or real-time polling).')
ON CONFLICT (task_number) DO UPDATE SET status = EXCLUDED.status;

INSERT INTO project_memory_entries (entry_type, status, title, content, related_task, tags) VALUES
('ADRLink', 'Verified', 'ADR-0007: Engineering Metrics Derived',
'6 metrik engineer didefinisikan sebagai derived query dari tabel yang ada: (1) Verification Pass Rate dari verification_runs, (2) Task Completion Rate dari engineering_tasks, (3) MTTR dari engineering_tasks, (4) Gap Closure Rate dari architecture_gaps, (5) Knowledge Growth Rate dari project_memory_entries, (6) Health Snapshot gabungan. Tabel engineering_metrics ditunda sampai ada kebutuhan nyata.',
'TASK-0016', ARRAY['adr', 'metrics', 'derived', 'phase6', 'observability'])
ON CONFLICT DO NOTHING;

INSERT INTO verification_runs (related_task, verification_type, result, evidence, command_used) VALUES
('TASK-0016', 'Manual', 'Pass', 'ADR-0007 created with 6 derived metric definitions and SQL queries. All metrics computable from existing tables without schema changes.', 'Supabase SQL Editor')
ON CONFLICT DO NOTHING;
