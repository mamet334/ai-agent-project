-- ============================================================
-- PROJECT MEMORY SERVICE — Schema Migration
-- Task: TASK-0006 / TECH-SPEC-0006
-- Status: DESIGN DRAFT — Do not execute without TASK-0008
-- Owner: Mamet Engineer
-- Date: 2026-06-27
-- ============================================================
-- WARNING: This file is a schema design artifact.
-- Execute only after TASK-0008 is formally opened and approved.
-- ============================================================

-- Table: project_memory_entries
-- Stores all structured engineering knowledge entries.

CREATE TABLE IF NOT EXISTS project_memory_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type      text NOT NULL CHECK (entry_type IN (
                    'Bug', 'RootCause', 'Solution', 'Lesson',
                    'ADRLink', 'Task', 'Verification', 'ReleaseNote'
                  )),
  status          text NOT NULL DEFAULT 'Hypothesis' CHECK (status IN (
                    'Hypothesis', 'InProgress', 'Verified', 'Deprecated', 'Rejected'
                  )),
  title           text NOT NULL,
  content         text NOT NULL,
  tags            text[] DEFAULT '{}',
  related_task    text,        -- e.g. 'TASK-0007'
  related_adr     text,        -- e.g. 'ADR-0003'
  related_gap     text,        -- e.g. 'GAP-0001'
  source_ref      text,        -- file path or URL reference
  created_by      text NOT NULL DEFAULT 'system',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Table: engineering_tasks
-- Structured mirror of docs/tasks/ in database form.

CREATE TABLE IF NOT EXISTS engineering_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number     text UNIQUE NOT NULL,  -- e.g. 'TASK-0007'
  title           text NOT NULL,
  status          text NOT NULL DEFAULT 'Proposed' CHECK (status IN (
                    'Proposed', 'InProgress', 'Done', 'Cancelled'
                  )),
  phase           int NOT NULL DEFAULT 1,
  owner           text NOT NULL DEFAULT 'Mamet Engineer',
  goal            text,
  acceptance      text,
  verification    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Table: architecture_gaps
-- Structured mirror of docs/architecture/ARCHITECTURE-GAPS.md.

CREATE TABLE IF NOT EXISTS architecture_gaps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_number      text UNIQUE NOT NULL,  -- e.g. 'GAP-0001'
  title           text NOT NULL,
  status          text NOT NULL DEFAULT 'Open' CHECK (status IN (
                    'Open', 'InProgress', 'Resolved', 'WontFix'
                  )),
  description     text,
  resolution      text,
  related_task    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Table: verification_runs
-- Verification log for each task execution.

CREATE TABLE IF NOT EXISTS verification_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  related_task        text NOT NULL,
  verification_type   text NOT NULL CHECK (verification_type IN (
                        'StaticAnalysis', 'Build', 'Deploy', 'Runtime', 'Manual'
                      )),
  result              text NOT NULL CHECK (result IN (
                        'Pass', 'Fail', 'Pending'
                      )),
  evidence            text,
  command_used        text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS: Row Level Security
-- ============================================================

ALTER TABLE project_memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE architecture_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_runs ENABLE ROW LEVEL SECURITY;

-- Service role has full access (Mamet Engineer via Edge Function)
CREATE POLICY "service_role_all_pm" ON project_memory_entries
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_et" ON engineering_tasks
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_ag" ON architecture_gaps
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_vr" ON verification_runs
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- Triggers: updated_at auto-refresh
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pm_entries_updated_at
  BEFORE UPDATE ON project_memory_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_engineering_tasks_updated_at
  BEFORE UPDATE ON engineering_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_architecture_gaps_updated_at
  BEFORE UPDATE ON architecture_gaps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Indexes: basic performance indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pm_entries_type   ON project_memory_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_pm_entries_status ON project_memory_entries(status);
CREATE INDEX IF NOT EXISTS idx_pm_entries_task   ON project_memory_entries(related_task);
CREATE INDEX IF NOT EXISTS idx_eng_tasks_status  ON engineering_tasks(status);
CREATE INDEX IF NOT EXISTS idx_eng_tasks_phase   ON engineering_tasks(phase);
CREATE INDEX IF NOT EXISTS idx_arch_gaps_status  ON architecture_gaps(status);
CREATE INDEX IF NOT EXISTS idx_verif_runs_task   ON verification_runs(related_task);

-- ============================================================
-- END OF SCHEMA DESIGN
-- Next step: TASK-0008 — Execute migration
-- ============================================================
