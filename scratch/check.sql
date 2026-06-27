SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'project_memory_entries_entry_type_check';
