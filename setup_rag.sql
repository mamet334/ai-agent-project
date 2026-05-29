-- 1. Aktifkan ekstensi pgvector untuk menyimpan angka koordinat AI
create extension if not exists vector;

-- 2. Hapus versi lama agar tidak error
drop function if exists match_documents;
drop table if exists document_chunks cascade;
drop table if exists documents cascade;

-- 3. Buat tabel 'documents' untuk menyimpan judul/nama file PDF yang diunggah
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Buat tabel 'document_chunks' untuk menyimpan potongan-potongan paragraf (chunks) dan vektornya
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade not null,
  content text not null,
  embedding vector(3072) -- 3072 adalah dimensi standar dari model AI gemini-embedding-2
);

-- 5. Buat indeks untuk mempercepat pencarian (Opsional tapi direkomendasikan)
-- create index on document_chunks using hnsw (embedding vector_cosine_ops);

-- 6. Buat fungsi pintar (RPC) untuk mencari paragraf yang paling mirip dengan pertanyaan user
create or replace function match_documents (
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
returns table (
  id uuid,
  document_id uuid,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    documents.title,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  join documents on document_chunks.document_id = documents.id
  -- Pastikan user hanya bisa mencari di dalam dokumen miliknya sendiri! (Keamanan)
  where documents.user_id = p_user_id 
    and 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
