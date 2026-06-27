# Technical Specification: Project Memory Service

Status: Draft
Task: TASK-0006
Owner: Mamet Engineer
Date: 2026-06-27
Phase: 2

---

## 1. Purpose

Project Memory Service adalah layer penyimpanan terstruktur untuk seluruh pengetahuan engineering proyek Mamet AI.

Tujuan:
- Menyimpan Bug, Root Cause, Solution, Lessons Learned secara queryable
- Memungkinkan Mamet Engineer membaca riwayat engineering dari database (bukan hanya file .md)
- Memisahkan Project Memory dari User Memory dan Knowledge RAG

---

## 2. Scope

Service ini menyentuh:
- Supabase PostgreSQL (schema baru)
- RLS (Row Level Security)
- Supabase Edge Function (opsional read API di masa depan)

Service ini TIDAK menyentuh:
- `user_memories` (User Memory)
- `documents` / `document_chunks` (Knowledge RAG)
- `agent_logs` (Runtime telemetry)

---

## 3. Data Model

### 3.1 Table: `project_memory_entries`

Menyimpan setiap entri pengetahuan engineering.

```sql
CREATE TABLE project_memory_entries (
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
```

### 3.2 Table: `engineering_tasks`

Mirror terstruktur dari `docs/tasks/` di database.

```sql
CREATE TABLE engineering_tasks (
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
```

### 3.3 Table: `architecture_gaps`

Mirror dari `docs/architecture/ARCHITECTURE-GAPS.md`.

```sql
CREATE TABLE architecture_gaps (
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
```

### 3.4 Table: `verification_runs`

Log setiap verifikasi yang dilakukan terhadap sebuah task.

```sql
CREATE TABLE verification_runs (
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
```

---

## 4. RLS Security Model

Semua tabel menggunakan RLS. Prinsip:

| Role | Read | Write |
|---|---|---|
| `anon` | ❌ | ❌ |
| `authenticated` (user biasa) | ✅ own entries | ✅ own entries |
| `service_role` | ✅ all | ✅ all |

```sql
-- Enable RLS
ALTER TABLE project_memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE architecture_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_runs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for Mamet Engineer via Edge Function)
CREATE POLICY "service_role_all" ON project_memory_entries
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON engineering_tasks
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON architecture_gaps
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all" ON verification_runs
  FOR ALL USING (auth.role() = 'service_role');
```

---

## 5. Auto-update Trigger

```sql
-- updated_at auto-refresh
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_memory_entries_updated_at
  BEFORE UPDATE ON project_memory_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_engineering_tasks_updated_at
  BEFORE UPDATE ON engineering_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_architecture_gaps_updated_at
  BEFORE UPDATE ON architecture_gaps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 6. Runtime Read/Write Flow

```
Mamet Engineer (appSource: "engineer")
  │
  ├── READ flow:
  │   agent-process → service_role client
  │   → SELECT FROM project_memory_entries WHERE ...
  │   → Context injected into Engineer prompt
  │
  └── WRITE flow (future):
      Owner approves Task
      → Edge Function (project-memory-write)
      → INSERT INTO project_memory_entries
      → UPDATE engineering_tasks SET status = 'Done'
```

---

## 7. Migration Plan

TASK-0008 (Phase 3): Execute migration SQL ke Supabase.
TASK-0009 (Phase 3): Backfill existing docs/project-memory/ entries ke database.
TASK-0010 (Phase 3): Integrate read ke agent-process Engineer mode.

---

## 8. Acceptance Criteria — TASK-0006

- [x] Schema draft exists (this document + SQL file)
- [x] Security model exists (RLS policies defined)
- [x] Runtime read/write flow documented
- [x] Migration task can be created (TASK-0008 identified)
