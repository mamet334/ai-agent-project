-- ============================================================
-- Knowledge Governance Schema — Mamet AI Knowledge OS Phase 2
-- ============================================================
-- Menambahkan lapisan tata kelola di atas project_memory_entries:
--   - governance_status (lifecycle)
--   - versioning (major.minor.patch + is_current)
--   - knowledge_relationships (graph)
--   - knowledge_conflicts (conflict resolver)
--   - knowledge health views & functions
-- ============================================================

-- ============================================================
-- BAGIAN 1: GOVERNANCE STATUS + VERSIONING
-- Tambah kolom ke project_memory_entries
-- ============================================================

-- Enum governance status
DO $$ BEGIN
  CREATE TYPE governance_status_enum AS ENUM (
    'DRAFT',       -- Baru dibuat, belum direview
    'REVIEW',      -- Sedang dalam proses review
    'VERIFIED',    -- Sudah diverifikasi, belum final
    'APPROVED',    -- Disetujui, siap dipakai
    'ACTIVE',      -- Sedang aktif digunakan sistem
    'DEPRECATED',  -- Masih ada tapi tidak disarankan
    'ARCHIVED',    -- Disimpan permanen, tidak dipakai
    'SUPERSEDED'   -- Digantikan oleh versi/entry baru
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tambah kolom governance ke project_memory_entries
ALTER TABLE project_memory_entries
  ADD COLUMN IF NOT EXISTS governance_status TEXT DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES project_memory_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_major INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_minor INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version_patch INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Index untuk query governance
CREATE INDEX IF NOT EXISTS idx_pme_governance_status ON project_memory_entries(governance_status);
CREATE INDEX IF NOT EXISTS idx_pme_is_current ON project_memory_entries(is_current);
CREATE INDEX IF NOT EXISTS idx_pme_version ON project_memory_entries(entry_type, is_current, version_major DESC);

-- Migrasi data lama: set governance_status berdasarkan kolom status lama
UPDATE project_memory_entries
SET governance_status = CASE
  WHEN status = 'Verified' THEN 'ACTIVE'
  WHEN status = 'Draft' THEN 'DRAFT'
  WHEN status = 'Deprecated' THEN 'DEPRECATED'
  WHEN status = 'Archived' THEN 'ARCHIVED'
  ELSE 'ACTIVE'
END
WHERE governance_status = 'ACTIVE'; -- Hanya update yang belum di-set manual

-- ============================================================
-- BAGIAN 2: FUNGSI GOVERNANCE
-- ============================================================

-- Fungsi: Ambil knowledge yang valid (ACTIVE/APPROVED/VERIFIED + is_current)
-- Ini yang harus dipakai Brain 1 Loader — BUKAN query langsung ke tabel
CREATE OR REPLACE FUNCTION get_active_knowledge(
  p_user_id UUID DEFAULT NULL,
  p_entry_types TEXT[] DEFAULT ARRAY['ADRLink', 'Solution', 'Lesson', 'RootCause', 'Vision', 'MAEF'],
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  entry_type TEXT,
  title TEXT,
  content TEXT,
  governance_status TEXT,
  version_major INTEGER,
  version_minor INTEGER,
  version_patch INTEGER,
  is_current BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pme.id,
    pme.entry_type,
    pme.title,
    pme.content,
    pme.governance_status,
    pme.version_major,
    pme.version_minor,
    pme.version_patch,
    pme.is_current,
    pme.created_at
  FROM project_memory_entries pme
  WHERE
    (p_user_id IS NULL OR pme.user_id = p_user_id)
    AND pme.governance_status IN ('ACTIVE', 'APPROVED', 'VERIFIED')
    AND pme.is_current = TRUE
    AND pme.entry_type = ANY(p_entry_types)
  ORDER BY pme.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Fungsi: Supersede satu knowledge dengan yang baru (atomic)
CREATE OR REPLACE FUNCTION supersede_knowledge(
  p_old_entry_id UUID,
  p_new_entry_id UUID,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_title TEXT;
  v_new_title TEXT;
BEGIN
  -- Ambil judul untuk logging
  SELECT title INTO v_old_title FROM project_memory_entries WHERE id = p_old_entry_id;
  SELECT title INTO v_new_title FROM project_memory_entries WHERE id = p_new_entry_id;

  IF v_old_title IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Old entry not found');
  END IF;

  IF v_new_title IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'New entry not found');
  END IF;

  -- Atomic supersede
  UPDATE project_memory_entries
  SET
    governance_status = 'SUPERSEDED',
    is_current = FALSE,
    superseded_by = p_new_entry_id,
    deprecated_at = NOW()
  WHERE id = p_old_entry_id;

  -- Pastikan entry baru is_current
  UPDATE project_memory_entries
  SET
    governance_status = 'ACTIVE',
    is_current = TRUE
  WHERE id = p_new_entry_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'superseded', v_old_title,
    'replaced_by', v_new_title,
    'at', NOW()
  );
END;
$$;

-- Fungsi: Advance lifecycle dengan validasi transisi legal
CREATE OR REPLACE FUNCTION advance_lifecycle(
  p_entry_id UUID,
  p_new_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
  v_valid_transitions TEXT[];
BEGIN
  SELECT governance_status INTO v_current_status
  FROM project_memory_entries WHERE id = p_entry_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Entry not found');
  END IF;

  -- Definisi transisi yang legal
  v_valid_transitions := CASE v_current_status
    WHEN 'DRAFT'       THEN ARRAY['REVIEW', 'ARCHIVED']
    WHEN 'REVIEW'      THEN ARRAY['VERIFIED', 'DRAFT', 'ARCHIVED']
    WHEN 'VERIFIED'    THEN ARRAY['APPROVED', 'REVIEW', 'DEPRECATED']
    WHEN 'APPROVED'    THEN ARRAY['ACTIVE', 'DEPRECATED']
    WHEN 'ACTIVE'      THEN ARRAY['DEPRECATED', 'SUPERSEDED', 'ARCHIVED']
    WHEN 'DEPRECATED'  THEN ARRAY['ARCHIVED', 'ACTIVE']
    WHEN 'SUPERSEDED'  THEN ARRAY['ARCHIVED']
    WHEN 'ARCHIVED'    THEN ARRAY[]::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_new_status = ANY(v_valid_transitions)) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', format('Transisi tidak valid: %s → %s. Transisi legal: %s',
        v_current_status, p_new_status, array_to_string(v_valid_transitions, ', '))
    );
  END IF;

  -- Lakukan transisi
  UPDATE project_memory_entries
  SET
    governance_status = p_new_status,
    review_notes = COALESCE(p_notes, review_notes),
    approved_by = CASE WHEN p_new_status IN ('APPROVED', 'ACTIVE') THEN p_performed_by ELSE approved_by END,
    approved_at = CASE WHEN p_new_status IN ('APPROVED', 'ACTIVE') THEN NOW() ELSE approved_at END,
    deprecated_at = CASE WHEN p_new_status = 'DEPRECATED' THEN NOW() ELSE deprecated_at END,
    archived_at = CASE WHEN p_new_status = 'ARCHIVED' THEN NOW() ELSE archived_at END
  WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'entry_id', p_entry_id,
    'from', v_current_status,
    'to', p_new_status,
    'at', NOW()
  );
END;
$$;

-- Fungsi: Buat versi baru dari knowledge yang ada
CREATE OR REPLACE FUNCTION create_new_version(
  p_entry_id UUID,
  p_new_content TEXT,
  p_bump_type TEXT DEFAULT 'minor', -- 'major' | 'minor' | 'patch'
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry RECORD;
  v_new_major INTEGER;
  v_new_minor INTEGER;
  v_new_patch INTEGER;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_entry FROM project_memory_entries WHERE id = p_entry_id AND is_current = TRUE;

  IF v_entry.id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Entry not found or not current version');
  END IF;

  -- Hitung versi baru
  v_new_major := v_entry.version_major;
  v_new_minor := v_entry.version_minor;
  v_new_patch := v_entry.version_patch;

  IF p_bump_type = 'major' THEN
    v_new_major := v_new_major + 1; v_new_minor := 0; v_new_patch := 0;
  ELSIF p_bump_type = 'minor' THEN
    v_new_minor := v_new_minor + 1; v_new_patch := 0;
  ELSE -- patch
    v_new_patch := v_new_patch + 1;
  END IF;

  -- Set versi lama sebagai bukan current
  UPDATE project_memory_entries
  SET is_current = FALSE
  WHERE id = p_entry_id;

  -- Insert versi baru
  INSERT INTO project_memory_entries (
    user_id, entry_type, title, content, status, governance_status,
    is_current, version_major, version_minor, version_patch, approved_by
  )
  VALUES (
    v_entry.user_id, v_entry.entry_type, v_entry.title, p_new_content,
    'Verified', 'ACTIVE', TRUE,
    v_new_major, v_new_minor, v_new_patch, p_performed_by
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'new_id', v_new_id,
    'version', format('%s.%s.%s', v_new_major, v_new_minor, v_new_patch),
    'title', v_entry.title
  );
END;
$$;


-- ============================================================
-- BAGIAN 3: KNOWLEDGE RELATIONSHIPS (GRAPH)
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_id UUID NOT NULL REFERENCES project_memory_entries(id) ON DELETE CASCADE,
  to_id UUID NOT NULL REFERENCES project_memory_entries(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  -- INFLUENCES: A mempengaruhi B
  -- SUPERSEDES: A menggantikan B
  -- GENERATED: A menghasilkan B (ADR → Task)
  -- IMPLEMENTS: A mengimplementasikan B (Task → ADR)
  -- CONFLICTS_WITH: A berkonflik dengan B
  -- REFERENCES: A merujuk B
  -- CAUSED_BY: A disebabkan oleh B (Lesson → RootCause)
  -- RESOLVED_BY: A diselesaikan oleh B
  strength FLOAT DEFAULT 1.0 CHECK (strength >= 0 AND strength <= 1),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_id, to_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_kr_from_id ON knowledge_relationships(from_id);
CREATE INDEX IF NOT EXISTS idx_kr_to_id ON knowledge_relationships(to_id);
CREATE INDEX IF NOT EXISTS idx_kr_relation_type ON knowledge_relationships(relation_type);

ALTER TABLE knowledge_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON knowledge_relationships
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Auth users read" ON knowledge_relationships
  FOR SELECT TO authenticated USING (true);

-- Fungsi traversal graph (depth-limited)
CREATE OR REPLACE FUNCTION get_related_knowledge(
  p_entry_id UUID,
  p_depth INTEGER DEFAULT 2,
  p_relation_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  entry_id UUID,
  title TEXT,
  entry_type TEXT,
  relation_type TEXT,
  depth INTEGER,
  path UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE graph AS (
    -- Base: entry itu sendiri
    SELECT
      pme.id AS entry_id,
      pme.title,
      pme.entry_type,
      ''::TEXT AS relation_type,
      0 AS depth,
      ARRAY[pme.id] AS path
    FROM project_memory_entries pme
    WHERE pme.id = p_entry_id

    UNION ALL

    -- Rekursif: ikuti relasi
    SELECT
      pme.id,
      pme.title,
      pme.entry_type,
      kr.relation_type,
      g.depth + 1,
      g.path || pme.id
    FROM graph g
    JOIN knowledge_relationships kr ON kr.from_id = g.entry_id
    JOIN project_memory_entries pme ON pme.id = kr.to_id
    WHERE
      g.depth < p_depth
      AND NOT (pme.id = ANY(g.path)) -- Hindari siklus
      AND (p_relation_types IS NULL OR kr.relation_type = ANY(p_relation_types))
  )
  SELECT * FROM graph ORDER BY depth;
END;
$$;


-- ============================================================
-- BAGIAN 4: KNOWLEDGE CONFLICTS
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_conflicts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_a_id UUID NOT NULL REFERENCES project_memory_entries(id) ON DELETE CASCADE,
  entry_b_id UUID NOT NULL REFERENCES project_memory_entries(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL,
  -- DIRECTION: A says "do X", B says "do NOT X"
  -- SCOPE: A applies to domain X, B also claims domain X
  -- SUPERSESSION: A should supersede B but hasn't been marked
  -- DUPLICATE: A and B contain nearly identical information
  description TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolution_status TEXT DEFAULT 'OPEN',
  -- OPEN | RESOLVED | IGNORED | NEEDS_REVIEW
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  severity TEXT DEFAULT 'MEDIUM',
  -- LOW | MEDIUM | HIGH | CRITICAL
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kc_entry_a ON knowledge_conflicts(entry_a_id);
CREATE INDEX IF NOT EXISTS idx_kc_entry_b ON knowledge_conflicts(entry_b_id);
CREATE INDEX IF NOT EXISTS idx_kc_resolution ON knowledge_conflicts(resolution_status);

ALTER TABLE knowledge_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access kc" ON knowledge_conflicts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Auth users read kc" ON knowledge_conflicts
  FOR SELECT TO authenticated USING (true);


-- ============================================================
-- BAGIAN 5: LIFECYCLE AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS lifecycle_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID REFERENCES project_memory_entries(id) ON DELETE SET NULL,
  entry_title TEXT,
  from_status TEXT,
  to_status TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lal_entry_id ON lifecycle_audit_log(entry_id);
CREATE INDEX IF NOT EXISTS idx_lal_created_at ON lifecycle_audit_log(created_at DESC);

ALTER TABLE lifecycle_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access lal" ON lifecycle_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- BAGIAN 6: VIEWS
-- ============================================================

-- View: Governance summary
CREATE OR REPLACE VIEW knowledge_governance_summary AS
SELECT
  entry_type,
  governance_status,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE is_current = TRUE) AS current_count
FROM project_memory_entries
GROUP BY entry_type, governance_status
ORDER BY entry_type, governance_status;

-- View: Versi terkini setiap knowledge
CREATE OR REPLACE VIEW current_knowledge_versions AS
SELECT
  id,
  entry_type,
  title,
  governance_status,
  version_major,
  version_minor,
  version_patch,
  format('%s.%s.%s', version_major, version_minor, version_patch) AS version_string,
  is_current,
  created_at
FROM project_memory_entries
WHERE is_current = TRUE
  AND governance_status IN ('ACTIVE', 'APPROVED', 'VERIFIED')
ORDER BY entry_type, created_at DESC;

-- View: Knowledge Health Dashboard (Priority 10)
CREATE OR REPLACE VIEW knowledge_health_dashboard AS
WITH
base AS (
  SELECT
    COUNT(*) FILTER (WHERE governance_status = 'ACTIVE' AND is_current = TRUE) AS active_count,
    COUNT(*) FILTER (WHERE governance_status = 'DRAFT') AS draft_count,
    COUNT(*) FILTER (WHERE governance_status = 'DEPRECATED') AS deprecated_count,
    COUNT(*) FILTER (WHERE governance_status = 'SUPERSEDED') AS superseded_count,
    COUNT(*) FILTER (WHERE governance_status = 'ARCHIVED') AS archived_count,
    COUNT(*) FILTER (WHERE governance_status = 'REVIEW') AS review_count
  FROM project_memory_entries
),
conflicts AS (
  SELECT COUNT(*) FILTER (WHERE resolution_status = 'OPEN') AS open_conflicts
  FROM knowledge_conflicts
),
orphans AS (
  SELECT COUNT(*) AS orphan_count
  FROM project_memory_entries pme
  WHERE pme.governance_status = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM knowledge_relationships kr WHERE kr.from_id = pme.id OR kr.to_id = pme.id)
)
SELECT
  b.active_count,
  b.draft_count,
  b.deprecated_count,
  b.superseded_count,
  b.archived_count,
  b.review_count,
  c.open_conflicts,
  o.orphan_count,
  -- Health score: 100 - (conflicts*10) - (orphans*5) - (draft*2) + (active*2)
  GREATEST(0, LEAST(100,
    100
    - (c.open_conflicts * 10)
    - (o.orphan_count * 5)
    - (b.draft_count * 2)
    + LEAST(b.active_count * 2, 40)
  )) AS health_score
FROM base b, conflicts c, orphans o;


-- ============================================================
-- KONFIRMASI
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '=== KNOWLEDGE GOVERNANCE SCHEMA APPLIED ===';
  RAISE NOTICE 'BAGIAN 1: Columns added to project_memory_entries';
  RAISE NOTICE '  - governance_status, superseded_by, version_*, is_current';
  RAISE NOTICE 'BAGIAN 2: Functions created';
  RAISE NOTICE '  - get_active_knowledge()';
  RAISE NOTICE '  - supersede_knowledge()';
  RAISE NOTICE '  - advance_lifecycle()';
  RAISE NOTICE '  - create_new_version()';
  RAISE NOTICE 'BAGIAN 3: knowledge_relationships table created';
  RAISE NOTICE '  - get_related_knowledge() graph traversal';
  RAISE NOTICE 'BAGIAN 4: knowledge_conflicts table created';
  RAISE NOTICE 'BAGIAN 5: lifecycle_audit_log table created';
  RAISE NOTICE 'BAGIAN 6: Views created';
  RAISE NOTICE '  - knowledge_governance_summary';
  RAISE NOTICE '  - current_knowledge_versions';
  RAISE NOTICE '  - knowledge_health_dashboard';
  RAISE NOTICE '';
  RAISE NOTICE 'LANGKAH SELANJUTNYA:';
  RAISE NOTICE '1. Jalankan query migrasi data lama (lihat komentar di bawah)';
  RAISE NOTICE '2. Deploy agent-process Edge Function';
  RAISE NOTICE '3. Deploy knowledge-health Edge Function';
END $$;

-- ============================================================
-- MIGRASI DATA LAMA (jalankan secara manual setelah verifikasi)
-- ============================================================
-- UPDATE project_memory_entries
-- SET governance_status = 'ACTIVE', is_current = TRUE,
--     version_major = 1, version_minor = 0, version_patch = 0
-- WHERE status = 'Verified' AND governance_status IS NULL;
--
-- UPDATE project_memory_entries
-- SET governance_status = 'DEPRECATED'
-- WHERE status = 'Deprecated' AND governance_status = 'ACTIVE';
