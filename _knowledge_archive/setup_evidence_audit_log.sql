-- ============================================================
-- Evidence Audit Log — Mamet AI Knowledge Operating System
-- ============================================================
-- Tabel ini mencatat SETIAP request ke LLM beserta evidence
-- yang digunakan. Ini memungkinkan auditability penuh:
-- "Di request mana pipeline gagal? Evidence apa yang dikirim?"
--
-- Filosofi (tujuan universal.txt):
-- "Jika terjadi kesalahan, Anda tahu persis di langkah mana pipeline gagal."
-- ============================================================

-- 1. Buat tabel
CREATE TABLE IF NOT EXISTS evidence_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id TEXT NOT NULL,          -- ID unik per request
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    mode TEXT NOT NULL,                -- LITE | AI | ENGINEER
    app_source TEXT,                   -- assistant | engineer | mametlite
    
    -- Evidence counts
    brain1_count INTEGER DEFAULT 0,    -- ADR, Lesson, Solution, dll
    brain2_count INTEGER DEFAULT 0,    -- Tasks + Gaps + Verifications
    rag_count INTEGER DEFAULT 0,       -- RAG documents
    memory_count INTEGER DEFAULT 0,    -- User memories
    total_evidence INTEGER DEFAULT 0,  -- Total semua evidence
    
    -- Evidence details (JSON arrays)
    brain1_ids JSONB DEFAULT '[]',     -- Daftar title Brain 1 yang loaded
    brain2_tasks JSONB DEFAULT '[]',   -- Daftar task numbers
    brain2_gaps JSONB DEFAULT '[]',    -- Daftar gap numbers
    rag_docs JSONB DEFAULT '[]',       -- Daftar doc titles dari RAG
    
    -- Gate verdict
    verdict TEXT NOT NULL,             -- PASSED | BLOCKED | WARNING
    block_reason TEXT,                 -- Alasan jika BLOCKED/WARNING
    llm_called BOOLEAN DEFAULT FALSE,  -- Apakah LLM akhirnya dipanggil?
    
    -- Request info
    message_preview TEXT,              -- 100 char pertama dari pesan user
    routing_scope TEXT,                -- CORE | WORKSPACE
    workspace_id UUID,                 -- Workspace yang digunakan untuk RAG
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index untuk query performa
CREATE INDEX IF NOT EXISTS idx_evidence_audit_user_id ON evidence_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_audit_created_at ON evidence_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_audit_verdict ON evidence_audit_logs(verdict);
CREATE INDEX IF NOT EXISTS idx_evidence_audit_mode ON evidence_audit_logs(mode);
CREATE INDEX IF NOT EXISTS idx_evidence_audit_llm_called ON evidence_audit_logs(llm_called);

-- 3. RLS (Row Level Security)
ALTER TABLE evidence_audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role bisa melakukan semua operasi (untuk Edge Function)
CREATE POLICY "Service role full access" ON evidence_audit_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- User hanya bisa membaca log miliknya sendiri
CREATE POLICY "Users can read own logs" ON evidence_audit_logs
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- 4. View untuk analisis cepat
CREATE OR REPLACE VIEW evidence_audit_summary AS
SELECT
    DATE_TRUNC('day', created_at) AS date,
    mode,
    verdict,
    COUNT(*) AS total_requests,
    AVG(total_evidence) AS avg_evidence,
    SUM(CASE WHEN llm_called THEN 1 ELSE 0 END) AS llm_called_count,
    SUM(CASE WHEN NOT llm_called THEN 1 ELSE 0 END) AS blocked_count
FROM evidence_audit_logs
GROUP BY DATE_TRUNC('day', created_at), mode, verdict
ORDER BY date DESC, mode, verdict;

-- 5. Function untuk cleanup log lama (> 30 hari)
CREATE OR REPLACE FUNCTION cleanup_old_evidence_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM evidence_audit_logs
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    RAISE NOTICE 'Old evidence audit logs cleaned up (older than 30 days)';
END;
$$;

-- Konfirmasi
DO $$
BEGIN
    RAISE NOTICE '✅ evidence_audit_logs table created successfully';
    RAISE NOTICE '✅ Indexes created';
    RAISE NOTICE '✅ RLS enabled and policies set';
    RAISE NOTICE '✅ evidence_audit_summary view created';
    RAISE NOTICE '✅ cleanup_old_evidence_logs function created';
END $$;
