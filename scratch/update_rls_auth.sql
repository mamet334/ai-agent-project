-- Update RLS to allow authenticated users to read Project Memory
CREATE POLICY "authenticated_read_pm" ON project_memory_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_et" ON engineering_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_ag" ON architecture_gaps FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_vr" ON verification_runs FOR SELECT TO authenticated USING (true);
