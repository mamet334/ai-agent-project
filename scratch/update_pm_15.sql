-- Database update for TASK-0015: Engineer Implementer Phase 7

INSERT INTO engineering_tasks (task_number, title, status, phase, goal) VALUES
('TASK-0015', 'Engineer Implementer & Safety Flow', 'Proposed', 7, 'Implement Engineer as Implementer (Phase 7) requiring Generate Patch -> Self Verification -> User Review -> Apply safety flow.')
ON CONFLICT (task_number) DO UPDATE SET status = EXCLUDED.status, phase = EXCLUDED.phase;

INSERT INTO project_memory_entries (entry_type, status, title, content, related_task, tags) VALUES
('ADRLink', 'Verified', 'ADR-0005: Engineer Implementer Safety Flow', 'Setiap kali AI membuat blok kode perubahan, AI WAJIB menyertakan blok "Self Verification" (Syntax, Architecture, Rules, Dependency) sebelum meminta "User Review" dan sebelum kode di-"Apply".', 'TASK-0015', ARRAY['adr', 'phase7', 'implementer', 'safety'])
ON CONFLICT DO NOTHING;
