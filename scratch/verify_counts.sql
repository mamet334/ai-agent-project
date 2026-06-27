SELECT 'engineering_tasks' AS tbl, COUNT(*) AS row_count FROM engineering_tasks
UNION ALL
SELECT 'architecture_gaps', COUNT(*) FROM architecture_gaps
UNION ALL
SELECT 'project_memory_entries', COUNT(*) FROM project_memory_entries
UNION ALL
SELECT 'verification_runs', COUNT(*) FROM verification_runs;
