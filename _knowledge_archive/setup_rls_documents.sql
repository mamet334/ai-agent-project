-- ============================================================
-- MAMET AI: RLS (Row Level Security) untuk tabel RAG Documents
-- Jalankan SQL ini di Supabase Dashboard > SQL Editor
-- ============================================================

-- =============================================
-- 1. Tabel `documents` — Lindungi dokumen RAG
-- =============================================
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Policy: User hanya bisa melihat dokumen miliknya sendiri
CREATE POLICY "Users can view own documents" 
  ON documents FOR SELECT 
  USING (auth.uid() = user_id);

-- Policy: User hanya bisa mengunggah dokumen atas nama dirinya sendiri
CREATE POLICY "Users can insert own documents" 
  ON documents FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Policy: User hanya bisa menghapus dokumen miliknya sendiri
CREATE POLICY "Users can delete own documents" 
  ON documents FOR DELETE 
  USING (auth.uid() = user_id);


-- =============================================
-- 2. Tabel `document_chunks` — Lindungi potongan vektor RAG
-- (Menggunakan JOIN ke tabel documents untuk cek kepemilikan)
-- =============================================
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Policy: User hanya bisa melihat chunks dari dokumen miliknya
CREATE POLICY "Users can view own chunks"
  ON document_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents 
      WHERE documents.id = document_chunks.document_id 
      AND documents.user_id = auth.uid()
    )
  );

-- Policy: User hanya bisa insert chunks ke dokumen miliknya
CREATE POLICY "Users can insert own chunks"
  ON document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents 
      WHERE documents.id = document_chunks.document_id 
      AND documents.user_id = auth.uid()
    )
  );

-- Policy: User hanya bisa hapus chunks dari dokumen miliknya
CREATE POLICY "Users can delete own chunks"
  ON document_chunks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM documents 
      WHERE documents.id = document_chunks.document_id 
      AND documents.user_id = auth.uid()
    )
  );

-- =============================================
-- CATATAN PENTING:
-- Edge Function yang menggunakan service_role_key
-- secara otomatis BYPASS semua RLS policy di atas.
-- Jadi rag-process, agent-process, dll tetap bisa bekerja
-- tanpa ada perubahan kode di sisi backend/Edge Function.
-- =============================================
