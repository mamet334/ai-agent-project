-- Quick Health Snapshot — run to verify ADR-0007 metrics work
SELECT
  ROUND(COUNT(t.*) FILTER (WHERE t.status = 'Done') * 100.0 / NULLIF(COUNT(t.*), 0), 1) AS task_completion_pct,
  COUNT(t.*) FILTER (WHERE t.status = 'InProgress') AS tasks_in_progress,
  COUNT(g.*) FILTER (WHERE g.status = 'Open') AS gaps_open,
  ROUND(COUNT(g.*) FILTER (WHERE g.status = 'Resolved') * 100.0 / NULLIF(COUNT(g.*), 0), 1) AS gap_closure_pct,
  ROUND(COUNT(v.*) FILTER (WHERE v.result IN ('Pass', 'PASS')) * 100.0 / NULLIF(COUNT(v.*), 0), 1) AS verification_pass_pct,
  COUNT(m.*) FILTER (WHERE m.status = 'Verified') AS verified_memory_entries
FROM engineering_tasks t, architecture_gaps g, verification_runs v, project_memory_entries m;
