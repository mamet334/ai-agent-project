-- ============================================================
-- MAMET AI ENGINEERING METRICS — DERIVED QUERIES (ADR-0007)
-- Jalankan di Supabase SQL Editor kapan saja.
-- Tidak memerlukan tabel tambahan.
-- ============================================================

-- 1. VERIFICATION PASS RATE
SELECT
  COUNT(*) FILTER (WHERE result IN ('Pass', 'PASS')) * 100.0 / NULLIF(COUNT(*), 0)
    AS verification_pass_rate_pct,
  COUNT(*) AS total_runs,
  COUNT(*) FILTER (WHERE result IN ('Pass', 'PASS')) AS passed,
  COUNT(*) FILTER (WHERE result IN ('Fail', 'FAIL')) AS failed
FROM verification_runs;

-- 2. TASK COMPLETION RATE
SELECT
  COUNT(*) FILTER (WHERE status = 'Done') * 100.0 / NULLIF(COUNT(*), 0)
    AS task_completion_rate_pct,
  COUNT(*) AS total_tasks,
  COUNT(*) FILTER (WHERE status = 'Done') AS done,
  COUNT(*) FILTER (WHERE status = 'InProgress') AS in_progress,
  COUNT(*) FILTER (WHERE status = 'Proposed') AS proposed
FROM engineering_tasks;

-- 3. MEAN TIME TO RESOLUTION (MTTR) — dalam jam
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0)::numeric, 1)
    AS avg_resolution_hours,
  MIN(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0) AS min_hours,
  MAX(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0) AS max_hours
FROM engineering_tasks
WHERE status = 'Done';

-- 4. ARCHITECTURE GAP CLOSURE RATE
SELECT
  COUNT(*) FILTER (WHERE status = 'Resolved') * 100.0 / NULLIF(COUNT(*), 0)
    AS gap_closure_rate_pct,
  COUNT(*) AS total_gaps,
  COUNT(*) FILTER (WHERE status = 'Resolved') AS resolved,
  COUNT(*) FILTER (WHERE status = 'Open') AS open,
  COUNT(*) FILTER (WHERE status = 'InProgress') AS in_progress
FROM architecture_gaps;

-- 5. KNOWLEDGE GROWTH RATE (per bulan)
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS entries_added,
  COUNT(*) FILTER (WHERE status = 'Verified') AS verified_entries
FROM project_memory_entries
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC
LIMIT 6;

-- 6. HEALTH SNAPSHOT (gabungan semua dimensi) — BENAR: scalar subquery, bukan cross join
SELECT
  -- Task Health
  (SELECT ROUND(COUNT(*) FILTER (WHERE status = 'Done') * 100.0 / NULLIF(COUNT(*), 0), 1)
    FROM engineering_tasks) AS task_completion_pct,
  (SELECT COUNT(*) FROM engineering_tasks WHERE status = 'InProgress')
    AS tasks_in_progress,
  (SELECT COUNT(*) FROM engineering_tasks WHERE status = 'Proposed')
    AS tasks_proposed,

  -- Gap Health
  (SELECT COUNT(*) FROM architecture_gaps WHERE status = 'Open')
    AS gaps_open,
  (SELECT ROUND(COUNT(*) FILTER (WHERE status = 'Resolved') * 100.0 / NULLIF(COUNT(*), 0), 1)
    FROM architecture_gaps) AS gap_closure_pct,

  -- Verification Health
  (SELECT ROUND(COUNT(*) FILTER (WHERE result IN ('Pass', 'PASS')) * 100.0 / NULLIF(COUNT(*), 0), 1)
    FROM verification_runs) AS verification_pass_pct,
  (SELECT COUNT(*) FROM verification_runs) AS total_verifications,

  -- Knowledge Health
  (SELECT COUNT(*) FROM project_memory_entries WHERE status = 'Verified')
    AS verified_memory_entries,
  (SELECT COUNT(*) FROM project_memory_entries WHERE status = 'Deprecated')
    AS deprecated_entries;
