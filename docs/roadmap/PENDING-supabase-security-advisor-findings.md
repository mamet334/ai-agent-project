# [REMEDIATED] Temuan Security Advisor Supabase — Lanjutan dari Security Hardening 29 Agustus 2026

**Status Akhir:**
- **Remediasi Teknis RPC (8 dari 9 Item):** ✅ **Selesai Tuntas (2026-09-02)** — 6 fungsi server-only di-revoke total, 2 fungsi client di-redefine dengan `auth.uid()` guard clause; terverifikasi bersih (0 lint warnings) via `supabase db lint --linked`.
- **Leaked Password Protection (Item ke-9):** ⏸️ **Deferred — Keputusan Bisnis Owner** (bukan backlog teknis).
- **Extension di Schema Public:** 📋 Backlog Arsitektur Jangka Panjang (risiko rendah, tidak memblokir operasional).

**Konteks:** Audit security hardening 29 Agustus 2026 sudah menyelesaikan RLS di 6 tabel yang sebelumnya bolong dan REVOKE EXECUTE untuk fungsi RPC destruktif. Advisor menemukan celah tambahan yang telah diremediasi pada 2026-09-02.
**Sumber:** `Supabase:get_advisors` (type=security), dijalankan 31 Agustus 2026 & diverifikasi via CLI linter 2 September 2026.

---

## 1. SECURITY DEFINER Functions — Executable oleh anon/authenticated (✅ SELESAI TUNTAS 8/8 FUNGSI)

**Status:** ✅ **Selesai Diremediasi (2026-09-02)** via Migration [`supabase/migrations/20260902100500_security_remediation_rpc_definer.sql`](../supabase/migrations/20260902100500_security_remediation_rpc_definer.sql).

### Tindakan yang Diterapkan:
1. **Kategori A (Server-Only / Maintenance / Trigger — 6 Fungsi):**
   * `public.rls_auto_enable()` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.cleanup_old_evidence_logs()` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.advance_lifecycle(uuid, text, text, uuid)` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.create_new_version(uuid, text, text, uuid)` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.supersede_knowledge(uuid, uuid, uuid)` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
   * `public.get_related_knowledge(uuid, integer, text[])` → `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`
2. **Kategori B (Client-Callable dengan Auth Guard Clause — 2 Fungsi):**
   * `public.check_daily_quota(target_user_id uuid)`:
     - `REVOKE EXECUTE ... FROM anon`
     - Ditambahkan guard: `IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM target_user_id THEN RAISE EXCEPTION ...; END IF;`
   * `public.get_active_knowledge(p_user_id uuid, p_entry_types text[], p_limit integer)`:
     - `REVOKE EXECUTE ... FROM PUBLIC, anon`
     - Ditambahkan guard: `IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION ...; END IF;`

**Hasil Verifikasi Linter:**
Perintah `supabase db lint --linked` mengonfirmasi bahwa seluruh peringatan keamanan lint `0028` dan `0029` untuk ke-8 fungsi RPC ini telah **0 / bersih total**.

---

## 2. Leaked Password Protection Nonaktif (⏸️ DEFERRED — KEPUTUSAN BISNIS OWNER)

Supabase Auth menyarankan pemeriksaan apakah password yang didaftarkan user pernah bocor di database HaveIBeenPwned.org.

### Status Investigasi & Keputusan:
1. **Upaya Eksekusi:** Upaya aktivasi fitur ini telah dilakukan via Supabase Auth Settings.
2. **Batasan Eksternal:** Fitur *Leaked Password Protection* dibatasi (*gated*) secara eksklusif oleh Supabase khusus untuk plan **Pro Tier ($25/bulan)** dan tidak tersedia pada plan Free.
3. **Keputusan Bisnis Owner:**
   * Owner secara sadar memilih untuk **menunda upgrade plan** untuk saat ini atas pertimbangan anggaran operasional, dan menerima risiko ini untuk sementara.
   * Item ini **bukan lagi tugas teknis/backlog engineering** Antigravity, melainkan keputusan bisnis murni.
   * Tidak ada tindakan teknis lebih lanjut yang dapat diambil sampai ada keputusan upgrade dari Owner di masa depan. Jika ada audit keamanan berikutnya, status ini dianggap final tanpa perlu diaudit ulang.
4. **Referensi:** https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

---

## 3. Extension Terpasang di Schema Public (📋 BACKLOG ARSITEKTUR JANGKA PANJANG)

- Extension `vector` terpasang di schema `public`.
- Extension `pg_net` terpasang di schema `public`.

### Analisis & Rencana:
* Bukan risiko akut, merupakan *best practice* Supabase untuk memindahkan extension ke schema `extensions`.
* Karena kolom `embedding` pada `document_chunks` dan `user_memories` bergantung langsung pada tipe `vector`, pemindahan extension membutuhkan window maintenance terpisah agar tidak merusak fungsi RAG live.
* Status: **Backlog jangka panjang / prioritas rendah**.
