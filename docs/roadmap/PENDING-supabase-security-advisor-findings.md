# [PENDING] Temuan Security Advisor Supabase — Lanjutan dari Security Hardening 29 Agustus 2026

**Status:** Belum dikerjakan. Ditemukan saat verifikasi RLS untuk keperluan bersih-bersih `_knowledge_archive/frontend_env` (31 Agustus 2026).
**Konteks:** Audit security hardening 29 Agustus 2026 sudah menyelesaikan RLS di 6 tabel yang sebelumnya bolong dan REVOKE EXECUTE untuk fungsi RPC destruktif. Advisor menemukan celah tambahan yang belum tercakup di audit itu.
**Sumber:** `Supabase:get_advisors` (type=security), dijalankan 31 Agustus 2026.

---

## 1. SECURITY DEFINER Functions — Executable oleh anon/authenticated (WARN)

9 fungsi `SECURITY DEFINER` bisa dipanggil lewat `/rest/v1/rpc/...` tanpa RLS check tambahan, karena `SECURITY DEFINER` menjalankan fungsi dengan hak akses pemilik fungsi (biasanya superuser), bukan hak akses pemanggil.

### Executable oleh role `anon` (tanpa login sama sekali):
- `public.check_daily_quota(target_user_id uuid)`
- `public.get_active_knowledge(p_user_id uuid, p_entry_types text[], p_limit integer)`
- `public.get_related_knowledge(p_entry_id uuid, p_depth integer, p_relation_types text[])`
- `public.rls_auto_enable()`

### Executable oleh role `authenticated` (user login manapun):
- Keempat fungsi di atas, ditambah:
- `public.advance_lifecycle(p_entry_id uuid, p_new_status text, p_notes text, p_performed_by uuid)`
- `public.cleanup_old_evidence_logs()`
- `public.create_new_version(p_entry_id uuid, p_new_content text, p_bump_type text, p_performed_by uuid)`
- `public.supersede_knowledge(p_old_entry_id uuid, p_new_entry_id uuid, p_performed_by uuid)`

### Kenapa ini penting
`advance_lifecycle` dan `supersede_knowledge` adalah fungsi governance dari **Knowledge Governance Engine** (lihat `docs/architecture/phase2-knowledge-governance.md`). Kalau `EXECUTE` belum di-revoke dari `authenticated`/`anon`, siapa pun yang punya anon key atau akun user biasa berpotensi mengubah status governance knowledge (`ACTIVE`, `SUPERSEDED`, dll) secara langsung lewat RPC, melewati jalur aplikasi yang seharusnya mengontrol siapa boleh melakukan itu.

`check_daily_quota` dan `get_active_knowledge`/`get_related_knowledge` mungkin memang sengaja publik (untuk fitur read-only), tapi perlu dikonfirmasi satu per satu — bukan diasumsikan aman.

### Langkah yang perlu dilakukan
1. Untuk tiap fungsi, tentukan: apakah memang harus bisa dipanggil publik/oleh semua user login, atau seharusnya dibatasi?
2. Kalau tidak seharusnya publik: `REVOKE EXECUTE ON FUNCTION public.<nama_fungsi> FROM PUBLIC;` (ingat pelajaran dari audit 29 Agustus: harus `FROM PUBLIC`, bukan cuma `FROM anon`, dan perlu cek signature exact dari `pg_proc` dulu sebelum REVOKE/GRANT).
3. Alternatif: ubah ke `SECURITY INVOKER` kalau fungsi memang seharusnya tunduk pada RLS pemanggil, bukan hak akses definer.
4. Remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable dan `...0029_authenticated_security_definer_function_executable`

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

## 3. Leaked Password Protection Nonaktif (WARN)

Supabase Auth saat ini **tidak** mengecek apakah password yang didaftarkan user pernah bocor di database HaveIBeenPwned.org.

### Kenapa ini penting
User (termasuk Owner sendiri) bisa saja mendaftar dengan password yang sudah pernah bocor di kebocoran data lain, tanpa peringatan apa pun.

### Langkah yang perlu dilakukan
1. Aktifkan lewat Supabase Dashboard → Authentication → Policies/Settings → aktifkan "Leaked Password Protection".
2. Ini setting sederhana, tidak perlu migrasi SQL — cukup toggle di dashboard.
3. Remediation reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

---

## Prioritas yang Disarankan
1. **Leaked Password Protection** — paling gampang (toggle dashboard), langsung kerjakan.
2. **SECURITY DEFINER functions** — perlu investigasi per-fungsi dulu (mana yang memang harus publik), baru REVOKE yang tidak perlu.
3. **Extension di public schema** — paling rendah urgensi, tapi perlu hati-hati soal dependency `vector` untuk RAG sebelum dipindah.
