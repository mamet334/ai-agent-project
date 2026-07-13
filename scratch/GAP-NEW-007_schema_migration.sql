-- Migration Script untuk GAP-NEW-007 (Engineering Metrics)
-- Menambahkan kolom untuk melengkapi 9 metrik yang disyaratkan Vision Constitution.
-- Dieksekusi di Supabase SQL Editor

-- 1. Patch Acceptance Rate (Apakah proposal perbaikan diterima oleh Owner?)
ALTER TABLE engineering_tasks 
ADD COLUMN IF NOT EXISTS patch_accepted BOOLEAN DEFAULT NULL;

-- 2. Review Accuracy (Apakah hasil verifikasi AI dikonfirmasi kebenarannya oleh Owner?)
-- Mengacu pada verification_audit_logs (sesuai RFC-013)
ALTER TABLE verification_audit_logs 
ADD COLUMN IF NOT EXISTS review_confirmed BOOLEAN DEFAULT NULL;

-- 3. Recurring Bug Rate (Kategorisasi bug untuk melacak regresi)
ALTER TABLE project_memory_entries 
ADD COLUMN IF NOT EXISTS bug_category TEXT DEFAULT NULL;

-- Optional: Comments for documentation
COMMENT ON COLUMN engineering_tasks.patch_accepted IS 'GAP-NEW-007: Tracking for Patch Acceptance Rate metric';
COMMENT ON COLUMN verification_audit_logs.review_confirmed IS 'GAP-NEW-007: Tracking for Review Accuracy metric';
COMMENT ON COLUMN project_memory_entries.bug_category IS 'GAP-NEW-007: Categorization for Recurring Bug Rate metric';
