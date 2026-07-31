-- 1. Pastikan ekstensi pg_net dan pg_cron sudah aktif di Supabase Anda
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Jadwalkan Health Checker berjalan setiap 15 menit
SELECT cron.schedule(
  'health-checker-15min', -- Nama Job
  '*/15 * * * *',         -- Cron Expression (setiap 15 menit)
  $$
    SELECT net.http_post(
      url:='https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/health-check',
      headers:='{"Content-Type": "application/json"}'::jsonb
    ) as request_id;
  $$
);

-- 3. Jadwalkan Auto-Cleanup Mingguan untuk tabel 'checks' (Hapus data > 30 hari)
SELECT cron.schedule(
  'cleanup-checks-weekly',
  '0 0 * * 0', -- Setiap hari Minggu jam 00:00
  $$
    DELETE FROM public.checks WHERE checked_at < NOW() - INTERVAL '30 days';
  $$
);

-- 4. Jadwalkan Auto-Cleanup Bulanan untuk tabel 'incidents' (Hapus data > 90 hari)
SELECT cron.schedule(
  'cleanup-incidents-monthly',
  '0 0 1 * *', -- Setiap tanggal 1 jam 00:00
  $$
    DELETE FROM public.incidents WHERE resolved_at < NOW() - INTERVAL '90 days';
  $$
);
