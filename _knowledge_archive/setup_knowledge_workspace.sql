-- 1. ENUM & TABEL KNOWLEDGE SPACES
DO $$ BEGIN
    CREATE TYPE space_type_enum AS ENUM ('CORE', 'WORKSPACE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS knowledge_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  space_type space_type_enum DEFAULT 'WORKSPACE',
  archived BOOLEAN DEFAULT false,
  quality_filter_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 2. TABEL WORKSPACE SUMMARIES
CREATE TABLE IF NOT EXISTS workspace_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES knowledge_spaces(id) ON DELETE CASCADE NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ALTER TABEL DOCUMENTS
DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN space_id UUID REFERENCES knowledge_spaces(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 4. MIGRASI DATA LAMA KE 'CORE'
INSERT INTO knowledge_spaces (user_id, name, space_type, description, quality_filter_enabled)
SELECT DISTINCT user_id, 'My Core Knowledge', 'CORE'::space_type_enum, 'Default core memory space', false 
FROM documents
ON CONFLICT (user_id, name) DO NOTHING;

UPDATE documents 
SET space_id = (SELECT id FROM knowledge_spaces WHERE knowledge_spaces.user_id = documents.user_id AND space_type = 'CORE'::space_type_enum LIMIT 1)
WHERE space_id IS NULL;

DO $$ 
BEGIN 
  ALTER TABLE documents ALTER COLUMN space_id SET NOT NULL; 
EXCEPTION 
  WHEN others THEN NULL; 
END $$;

-- 5. PERUBAHAN MATCH_DOCUMENTS (RETRIEVAL)
DROP FUNCTION IF EXISTS match_documents(vector(3072), float, int, uuid);
DROP FUNCTION IF EXISTS match_documents(vector(3072), float, int, uuid, uuid);

CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  p_user_id uuid,
  p_space_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  title text,
  content text,
  space_name text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    d.title,
    dc.content,
    ks.name as space_name,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  JOIN knowledge_spaces ks ON d.space_id = ks.id
  WHERE d.user_id = p_user_id 
    AND ks.archived = false
    AND (p_space_id IS NULL OR d.space_id = p_space_id)
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 6. PERMISSION LAYER (RLS & TRIGGERS)
CREATE OR REPLACE FUNCTION prevent_core_deletion() RETURNS trigger AS $$
BEGIN
  IF OLD.space_type = 'CORE'::space_type_enum THEN
    RAISE EXCEPTION 'Akses Ditolak: Core Knowledge bersifat Read-Only untuk penghapusan.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_core_delete ON knowledge_spaces;
CREATE TRIGGER trigger_prevent_core_delete
BEFORE DELETE ON knowledge_spaces
FOR EACH ROW EXECUTE FUNCTION prevent_core_deletion();
