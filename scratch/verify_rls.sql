-- Verify RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'project_memory_entries',
    'engineering_tasks',
    'architecture_gaps',
    'verification_runs'
  )
ORDER BY tablename;
