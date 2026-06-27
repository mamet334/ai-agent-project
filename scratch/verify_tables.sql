SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'project_memory_entries',
    'engineering_tasks',
    'architecture_gaps',
    'verification_runs'
  )
ORDER BY table_name;
