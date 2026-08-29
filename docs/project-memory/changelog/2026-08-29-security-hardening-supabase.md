# Changelog: Security Hardening — Supabase (BrainBox AI)

**Tanggal:** 2026-08-29
**Project:** BrainBox AI (`uuyzdjifhdfyyvpxsofu`)
**Dipicu oleh:** Pengujian keamanan manual terhadap Mamet Ecosystem (Vercel + Supabase)
**Dilakukan oleh:** Slamet (via Claude, MCP Supabase)

## Ringkasan

Audit keamanan rutin (`Supabase:get_advisors` type=security) menemukan beberapa
celah pada database. Perbaikan diterapkan langsung sebagai migration.

## Temuan & Perbaikan

### 1. RPC destruktif bisa dipanggil publik tanpa login (KRITIS)

4 fungsi `SECURITY DEFINER` bisa dieksekusi oleh role `anon` (tanpa autentikasi)
lewat endpoint `/rest/v1/rpc/<nama_fungsi>`:

- `advance_lifecycle(uuid, text, text, uuid)` — mengubah status entry
- `create_new_version(uuid, text, text, uuid)` — membuat versi baru knowledge
- `supersede_knowledge(uuid, uuid, uuid)` — menggantikan entry knowledge
- `cleanup_old_evidence_logs()` — menghapus log evidence

**Perbaikan:** `REVOKE EXECUTE ... FROM PUBLIC` lalu `GRANT EXECUTE ... TO authenticated`.
Sekarang hanya user yang login yang bisa memanggil fungsi-fungsi ini.

Fungsi baca (`check_daily_quota`, `get_active_knowledge`, `get_related_knowledge`)
sengaja **dibiarkan publik** atas keputusan owner (risiko rendah, dibutuhkan untuk
alur yang belum login).

`rls_auto_enable()` diperiksa terpisah — ternyata event trigger function internal
(dipicu otomatis saat `CREATE TABLE`), bukan endpoint fungsional untuk dipanggil
manual. Dibiarkan apa adanya, risiko rendah.

Migration: `harden_rpc_security_revoke_public_grant_authenticated_only`

### 2. 15 fungsi dengan `search_path` mutable (SEDANG)

Berpotensi celah search-path injection. Semua fungsi berikut sekarang
menetapkan `SET search_path = public, pg_temp`:

`match_memories` (x2 overload), `check_daily_quota`, `cleanup_memories`,
`atomic_entity_lock`, `extract_cognitive_subgraph`, `update_memory_stats`,
`match_documents`, `prevent_core_deletion`, `update_updated_at_column`,
`cleanup_old_evidence_logs`, `get_active_knowledge`, `supersede_knowledge`,
`advance_lifecycle`, `create_new_version`, `get_related_knowledge`, `rls_auto_enable`

Migration: `harden_rpc_security_revoke_anon_and_fix_search_path_v2`

### 3. 6 tabel RLS enabled tanpa policy (SEDANG)

RLS aktif tapi tanpa policy berarti tabel efektif terkunci total (aman dari
kebocoran, tapi berpotensi mematikan fitur terkait). Ditambahkan policy
"owner-only" (`auth.uid() = user_id`) pada:

- `knowledge_spaces` (user_id uuid)
- `entity_locks` (user_id uuid)
- `chats_backup` (user_id uuid, nullable, tanpa PK)
- `mamet_memory` (user_id **text** — dibandingkan via `auth.uid()::text`)
- `memory_audit_log` (user_id **text** — dibandingkan via `auth.uid()::text`)
- `memory_relations` (**tidak ada kolom user_id** — kepemilikan diturunkan
  lewat `EXISTS` join ke `user_memories.source_memory_id`)

Migration: `add_rls_policies_for_unprotected_tables`

## Belum ditangani (butuh keputusan/kehati-hatian lebih lanjut)

| Item | Alasan ditunda |
|---|---|
| Extension `vector` & `pg_net` di schema `public` | Memindahkan extension berisiko merusak kolom `embedding` yang sudah ada dan fungsi yang bergantung pada `pg_net`. Perlu testing di branch dulu. |
| Leaked Password Protection nonaktif | Setting Supabase Auth, tidak bisa diubah lewat SQL — perlu diaktifkan manual di Dashboard → Authentication → Policies → Password Security. |

## Verifikasi

Semua perbaikan diverifikasi ulang lewat `Supabase:get_advisors` (type=security)
setelah setiap migration diterapkan. 3 dari 3 kategori temuan (RPC publik,
search_path, RLS tanpa policy) sudah tidak muncul lagi di laporan.

## Catatan tambahan

Sekaligus dicek **Vercel Deployment Protection** untuk 3 project
(`mamet-ecosystem`, `mamet-ecosystem-backend`, `mametlite`): preview deployment
terkunci (SSO), domain production terbuka publik — konfigurasi ini wajar
untuk aplikasi yang memang ditujukan diakses publik.
