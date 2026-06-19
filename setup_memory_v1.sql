-- =====================================================================================
-- MAMET AI - MEMORY MANAGER V1 SETUP (HARDENED)
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS user_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    embedding VECTOR(768),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    memory_hits INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS user_memories_embedding_idx 
ON user_memories 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- RPC Function untuk pencarian semantik
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding VECTOR(768),
    match_threshold FLOAT,
    match_count INT,
    target_user_id TEXT
)
RETURNS TABLE (
    id UUID,
    summary TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        user_memories.id,
        user_memories.summary,
        1 - (user_memories.embedding <=> query_embedding) AS similarity
    FROM user_memories
    WHERE user_memories.user_id = target_user_id
      AND 1 - (user_memories.embedding <=> query_embedding) > match_threshold
    ORDER BY user_memories.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- RPC Function untuk update statistik memory saat berhasil di-retrieve
CREATE OR REPLACE FUNCTION update_memory_stats(
    memory_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE user_memories
    SET 
        last_used_at = timezone('utc'::text, now()),
        memory_hits = memory_hits + 1
    WHERE id = ANY(memory_ids);
END;
$$;

-- Fungsi Cleanup Job (Hapus >90 hari tidak terpakai & duplikat kemiripan >0.98)
CREATE OR REPLACE FUNCTION cleanup_memories()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Hapus yang tidak pernah diakses > 90 hari
    DELETE FROM user_memories
    WHERE last_used_at < timezone('utc'::text, now()) - INTERVAL '90 days';

    -- 2. Hapus duplikat (similarity > 0.98) untuk user yang sama
    -- Kita pertahankan yang paling baru (created_at DESC)
    DELETE FROM user_memories a
    USING user_memories b
    WHERE a.user_id = b.user_id
      AND a.created_at < b.created_at -- Menghapus memori duplikat yang lebih lama
      AND a.id != b.id
      AND 1 - (a.embedding <=> b.embedding) > 0.98;
      
    -- 3. [SELF-HEALING] Hapus memori usang yang dianulir pengguna (confidence hancur)
    -- Perlu mengecek apakah kolom confidence ada terlebih dahulu agar backward compatible
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_memories' AND column_name='confidence') THEN
        EXECUTE 'DELETE FROM user_memories WHERE confidence < 0.2;';
    END IF;
END;
$$;
