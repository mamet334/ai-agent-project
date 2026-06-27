-- Cek RLS policies di semua tabel Project Memory
SELECT 
  schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('engineering_tasks', 'architecture_gaps', 'project_memory_entries', 'verification_runs')
ORDER BY tablename, policyname;
