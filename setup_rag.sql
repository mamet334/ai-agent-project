-- 1. Aktifkan ekstensi pgvector untuk menyimpan angka koordinat AI
create extension if not exists vector;

-- 2. Buat tabel 'documents' untuk menyimpan judul/nama file PDF yang diunggah
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Buat tabel 'document_chunks' untuk menyimpan potongan-potongan paragraf (chunks) dan vektornya
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade not null,
  content text not null,
  embedding vector(768) -- 768 adalah dimensi standar dari model AI Gemini text-embedding-004
);

-- 4. Buat indeks pintar (HNSW) agar pencarian di antara jutaan paragraf terjadi dalam milidetik
create index if not exists document_chunks_embedding_idx on document_chunks using hnsw (embedding vector_cosine_ops);

-- 5. Buat fungsi pintar (RPC) untuk mencari paragraf yang paling mirip dengan pertanyaan user
create or replace function match_documents (
  query_embedding vector(768),
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
