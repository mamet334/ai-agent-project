-- ==========================================
-- FASE 4A: SETUP TABEL BIAYA & TOKEN USAGE
-- ==========================================

-- 1. Buat tabel utama untuk melacak penggunaan API
CREATE TABLE IF NOT EXISTS public.api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,          -- ID pengguna yang mengeksekusi prompt
    provider TEXT NOT NULL,         -- Nama penyedia (contoh: 'gemini', 'groq', 'openai')
    model TEXT NOT NULL,            -- Model spesifik (contoh: 'gemini-2.5-flash')
    input_tokens INTEGER DEFAULT 0, -- Jumlah token pertanyaan
    output_tokens INTEGER DEFAULT 0,-- Jumlah token jawaban
    cost_usd NUMERIC DEFAULT 0.0,   -- Estimasi biaya dalam USD
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Buat index agar perhitungan akumulasi harian sangat cepat
CREATE INDEX IF NOT EXISTS api_usage_user_id_created_at_idx 
ON public.api_usage (user_id, created_at DESC);

-- 3. Keamanan (RLS)
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- Izin untuk membaca dan menambah data (agar frontend/backend bisa mencatat log)
CREATE POLICY "Allow read access to api_usage" ON public.api_usage FOR SELECT USING (true);
CREATE POLICY "Allow insert access to api_usage" ON public.api_usage FOR INSERT WITH CHECK (true);

-- 4. Fungsi RPC (Remote Procedure Call) untuk Circuit Breaker
-- Fungsi ini akan dipanggil oleh Edge Function sebelum menembak API.
-- Menghitung total biaya USD yang dihabiskan user HARI INI (dalam waktu UTC).
CREATE OR REPLACE FUNCTION check_daily_quota(target_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    total_cost NUMERIC;
BEGIN
    SELECT COALESCE(SUM(cost_usd), 0.0) INTO total_cost
    FROM public.api_usage
    WHERE user_id = target_user_id
      -- Hanya hitung data dari jam 00:00 hari ini
      AND created_at >= date_trunc('day', timezone('utc'::text, now()));
      
    RETURN total_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
