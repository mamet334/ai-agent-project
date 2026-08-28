-- ================================================
-- Migration: Atribusi Sumber RAG + Audit Log
-- PR#4 + PR#1 — ASSISTANT-CAPABILITY-ROADMAP
-- Tanggal: 2026-08-26
-- ================================================
--
-- Cara menjalankan:
--   Supabase Dashboard → SQL Editor → paste seluruh file ini → Run
--
-- BACKWARD-COMPATIBLE: semua kolom baru nullable.
-- Dokumen lama tanpa source_url tetap berfungsi normal.
-- Tidak ada tabel yang di-drop, tidak ada data yang hilang.

-- ================================================
-- 1. Tabel: documents — tambah source attribution
-- ================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_url    TEXT,
  ADD COLUMN IF NOT EXISTS source_type   TEXT
    CHECK (source_type IN ('web_search', 'user_upload', 'manual_entry') OR source_type IS NULL),
  ADD COLUMN IF NOT EXISTS retrieved_at  TIMESTAMPTZ;

-- Index untuk PR#5 (adaptive retrieval: filter berdasarkan source_type)
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents (source_type);

-- ================================================
-- 2. Tabel: document_chunks — tambah source attribution
-- ================================================

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS source_url    TEXT,
  ADD COLUMN IF NOT EXISTS source_type   TEXT
    CHECK (source_type IN ('web_search', 'user_upload', 'manual_entry') OR source_type IS NULL);

-- Index untuk PR#5 (identifikasi chunk dari sumber yang sama)
CREATE INDEX IF NOT EXISTS idx_document_chunks_source_type ON document_chunks (source_type);

-- ================================================
-- 3. Tabel: assistant_audit_log (baru — untuk PR#1)
-- ================================================

CREATE TABLE IF NOT EXISTS assistant_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by    TEXT        NOT NULL DEFAULT '',
  ai_decision     TEXT        NOT NULL DEFAULT '',
  command         TEXT        NOT NULL DEFAULT '',
  target_path     TEXT        NOT NULL DEFAULT '',
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_success  BOOLEAN     NOT NULL DEFAULT FALSE,
  result_output   TEXT        NOT NULL DEFAULT '',
  result_reason   TEXT        NOT NULL DEFAULT '',
  in_workspace    BOOLEAN     NOT NULL DEFAULT TRUE,
  is_destructive  BOOLEAN     NOT NULL DEFAULT FALSE,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk query terbaru per user
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id   ON assistant_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_logged_at ON assistant_audit_log (logged_at DESC);

-- ================================================
-- 4. Row Level Security — assistant_audit_log
-- ================================================

ALTER TABLE assistant_audit_log ENABLE ROW LEVEL SECURITY;

-- User hanya bisa baca log miliknya sendiri
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'assistant_audit_log'
    AND policyname = 'Users can view own audit logs'
  ) THEN
    CREATE POLICY "Users can view own audit logs"
      ON assistant_audit_log FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role boleh insert (AuditLogService memakai service role key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'assistant_audit_log'
    AND policyname = 'Service role can insert audit logs'
  ) THEN
    CREATE POLICY "Service role can insert audit logs"
      ON assistant_audit_log FOR INSERT
      WITH CHECK (TRUE);
  END IF;
END $$;

-- ================================================
-- Selesai. Verifikasi dengan query berikut:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'documents' AND column_name IN ('source_url','source_type','retrieved_at');
-- ================================================
