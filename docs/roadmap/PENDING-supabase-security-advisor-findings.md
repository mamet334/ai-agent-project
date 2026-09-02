# [REMEDIATED] Temuan Security Advisor Supabase — Lanjutan dari Security Hardening 29 Agustus 2026

**Status:** Selesai Sebagian (Item 1 tuntas via migrasi 2026-09-02; Item 3 butuh toggle Dashboard; Item 2 pending optimasi masa depan)
**Konteks:** Audit security hardening 29 Agustus 2026 sudah menyelesaikan RLS di 6 tabel yang sebelumnya bolong dan REVOKE EXECUTE untuk fungsi RPC destruktif. Advisor menemukan celah tambahan yang telah diremediasi pada 2026-09-02.
**Sumber:** `Supabase:get_advisors` (type=security), dijalankan 31 Agustus 2026 & diverifikasi 2 September 2026.

---

## 1. SECURITY DEFINER Functions — Executable oleh anon/authenticated (✅ SELESAI)

**Status:** ✅ **Selesai Diremediasi (2026-09-02)** via Migration [`supabase/migrations/20260902100500_security_remediation_rpc_definer.sql`](../supabase/migrations/20260902100500_security_remediation_rpc_definer.sql).

### Tindakan yang Diterapkan:
1. **Kategori A (Server-Only / Maintenance / Trigger):**
   * `public.rls_auto_enable()` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.cleanup_old_evidence_logs()` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.advance_lifecycle(uuid, text, text, uuid)` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.create_new_version(uuid, text, text, uuid)` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.supersede_knowledge(uuid, uuid, uuid)` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.get_related_knowledge(uuid, integer, text[])` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
2. **Kategori B (Client-Callable dengan Auth Guard Clause):**
   * `public.check_daily_quota(target_user_id uuid)`:
     - `REVOKE EXECUTE ... FROM anon`
     - Ditambahkan guard: `IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM target_user_id THEN RAISE EXCEPTION ...; END IF;`
   * `public.get_active_knowledge(p_user_id uuid, p_entry_types text[], p_limit integer)`:
     - `REVOKE EXECUTE ... FROM PUBLIC, anon`
     - Ditambahkan guard: `IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION ...; END IF;`

---

## 2. Extension Terpasang di Schema Public (WARN)

- Extension `vector` terpasang di schema `public`.
- Extension `pg_net` terpasang di schema `public`.

### Kenapa ini penting
Bukan risiko akut, tapi praktik yang disarankan Supabase adalah memindahkan extension ke schema terpisah (biasanya `extensions`) supaya tidak bercampur dengan tabel aplikasi dan mengurangi permukaan serangan di schema public.

### Langkah yang perlu dilakukan
1. Cek dulu apakah ada dependency yang akan patah kalau extension dipindah (terutama `vector`, karena dipakai `document_chunks`/`documents` untuk RAG).
2. Kalau aman, pindahkan extension ke schema `extensions` sesuai panduan Supabase.
3. Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

---

## 3. Leaked Password Protection Nonaktif (WARN — ⚠️ PENDING KEPUTUSAN BISNIS)

Supabase Auth saat ini **tidak** mengecek apakah password yang didaftarkan user pernah bocor di database HaveIBeenPwned.org.

### Kenapa ini penting
User (termasuk Owner sendiri) bisa saja mendaftar dengan password yang sudah pernah bocor di kebocoran data lain, tanpa peringatan apa pun.

### Status & Hambatan:
* **Hambatan:** Fitur *Leaked Password Protection* di Supabase dibatasi (*gated*) khusus untuk plan **Pro Tier** ($25/bulan), dan tidak tersedia di plan Free.
* **Status:** Belum selesai / Pending — menunggu keputusan bisnis Owner apakah ingin upgrade plan Supabase ke Pro atau tetap pada Free plan.
* **Remediation reference:** https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
