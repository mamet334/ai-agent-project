-- Database update for TASK-0014: Engineer Reviewer & Confidence

INSERT INTO engineering_tasks (task_number, title, status, phase, goal) VALUES
('TASK-0014', 'Engineer Reviewer & Confidence Framework', 'Proposed', 6, 'Implement Engineer as Reviewer (Phase 6) requiring Task+Diff+ADR+Rules context, and introduce Engineering Confidence score on all engineer recommendations.')
ON CONFLICT (task_number) DO UPDATE SET status = EXCLUDED.status, phase = EXCLUDED.phase;

INSERT INTO project_memory_entries (entry_type, status, title, content, related_task, tags) VALUES
('ADRLink', 'Verified', 'ADR-0004: Engineer Reviewer & Confidence', 'Mamet Engineer diwajibkan menyertakan 4 pilar (Task, Diff, ADR, Coding Rule) untuk setiap review. Seluruh rekomendasi AI wajib dilampirkan dengan skor "Engineering Confidence" beserta alasan logisnya untuk menghindari halusinasi.', 'TASK-0014', ARRAY['adr', 'phase6', 'confidence', 'reviewer'])
ON CONFLICT DO NOTHING;
