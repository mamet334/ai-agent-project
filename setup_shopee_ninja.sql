-- Buat tabel antrean produk shopee
CREATE TABLE IF NOT EXISTS public.shopee_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_url TEXT NOT NULL,
    product_name TEXT, -- Opsional: Nama produk sebagai contekan untuk AI
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'posted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    posted_at TIMESTAMP WITH TIME ZONE
);

-- Index untuk mempercepat pencarian antrean yang belum diposting
CREATE INDEX IF NOT EXISTS shopee_queue_status_idx ON public.shopee_queue (status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.shopee_queue ENABLE ROW LEVEL SECURITY;

-- Berikan akses bebas (bypass) untuk keperluan backend/edge function
CREATE POLICY "Allow read access to shopee queue" ON public.shopee_queue FOR SELECT USING (true);
CREATE POLICY "Allow insert access to shopee queue" ON public.shopee_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update access to shopee queue" ON public.shopee_queue FOR UPDATE USING (true);

-- ==========================================
-- CONTOH CARA MEMASUKKAN DATA KE ANTARAAN:
-- INSERT INTO public.shopee_queue (original_url, product_name) 
-- VALUES ('https://shopee.co.id/Kipas-Angin-Mini-Portable-i.123.456', 'Kipas Angin Mini Portable');
-- ==========================================
