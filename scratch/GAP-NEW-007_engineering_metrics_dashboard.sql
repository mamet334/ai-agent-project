-- Engineering Metrics Dashboard (Vision Constitution - 9 Metrics)
-- Dijalankan pada Supabase SQL Editor
-- Membutuhkan eksekusi GAP-NEW-007_schema_migration.sql terlebih dahulu

-- 1. Patch Acceptance Rate (Keberhasilan Usulan Perbaikan)
SELECT 
  ROUND(COUNT(*) FILTER (WHERE patch_accepted = true) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE patch_accepted IS NOT NULL), 0), 1) AS patch_acceptance_rate_pct
FROM engineering_tasks;

-- 2. Recurring Bug Rate (Frekuensi Bug Berulang)
SELECT 
  bug_category, 
  COUNT(*) AS recurrence_count 
FROM project_memory_entries 
WHERE bug_category IS NOT NULL 
GROUP BY bug_category 
HAVING COUNT(*) > 1 
ORDER BY recurrence_count DESC;

-- 3. Review Accuracy (Tingkat Akurasi Verifikasi AI vs Owner)
SELECT 
  ROUND(COUNT(*) FILTER (WHERE review_confirmed = true) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE review_confirmed IS NOT NULL), 0), 1) AS review_accuracy_pct
FROM verification_audit_logs;

-- 4. Average Confidence (GAP-NEW-008)
SELECT 
  ROUND(AVG(confidence_score), 1) AS avg_confidence_score
FROM verification_audit_logs 
WHERE confidence_score IS NOT NULL;

-- 5. Verification Pass Rate (Rasio Lulus Verifikasi)
SELECT
  ROUND(COUNT(*) FILTER (WHERE result IN ('Pass', 'PASS')) * 100.0 / NULLIF(COUNT(*), 0), 1) AS verification_pass_rate_pct
FROM verification_runs;

-- 6. Task Completion Rate (Rasio Penyelesaian Tugas)
SELECT
  ROUND(COUNT(*) FILTER (WHERE status = 'Done') * 100.0 / NULLIF(COUNT(*), 0), 1) AS task_completion_rate_pct
FROM engineering_tasks;

-- 7. Mean Time to Resolution (MTTR - Waktu Rata-Rata Resolusi)
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0)::numeric, 1) AS avg_resolution_hours
FROM engineering_tasks
WHERE status = 'Done';

-- 8. Architecture Gap Closure Rate (Kecepatan Penutupan Gap Arsitektur)
SELECT
  ROUND(COUNT(*) FILTER (WHERE status = 'Resolved') * 100.0 / NULLIF(COUNT(*), 0), 1) AS gap_closure_rate_pct
FROM architecture_gaps;

-- 9. Engineering Knowledge Growth Rate (Akumulasi Pengetahuan 30 Hari Terakhir)
SELECT
  COUNT(*) AS new_entries_30d
FROM project_memory_entries
WHERE created_at >= NOW() - INTERVAL '30 days';
