# Changelog: Security Remediation — SECURITY DEFINER RPC & Auth Guard

Tanggal: 2026-09-02
Status: Selesai Diimplementasikan & Diterapkan ke Remote Database
Branch: `main`
Migration: [`supabase/migrations/20260902100500_security_remediation_rpc_definer.sql`](../../supabase/migrations/20260902100500_security_remediation_rpc_definer.sql)
Dokumen Terkait: [`docs/roadmap/PENDING-supabase-security-advisor-findings.md`](../../roadmap/PENDING-supabase-security-advisor-findings.md)

---

## 1. Ringkasan Eksekutif

Audit Supabase Security Advisor menemukan celah akses pada 9 fungsi `SECURITY DEFINER` yang sebelumnya dapat dieksekusi secara publik oleh role `anon` (tanpa autentikasi) atau `authenticated` (user login sembarang) lewat REST endpoint `/rest/v1/rpc/<nama_fungsi>`.

Perbaikan telah berhasil diterapkan ke remote database melalui migrasi terstruktur dengan membagi fungsi ke dalam dua kategori utama (Kategori A dan Kategori B).

---

## 2. Rincian Tindakan per Fungsi

### Kategori A: Server-Only / Maintenance / Trigger (Revoke Total dari Publik, Anon, & Authenticated)
Fungsi-fungsi ini tidak boleh dipanggil dari sisi client:
1. `public.rls_auto_enable()` — Internal Postgres Event Trigger untuk auto-enable RLS saat `CREATE TABLE`.
2. `public.cleanup_old_evidence_logs()` — Background maintenance job pembersih log bukti audit lama (>30 hari).
3. `public.advance_lifecycle(uuid, text, text, uuid)` — Transisi status governance knowledge (ADR/Vision).
4. `public.create_new_version(uuid, text, text, uuid)` — Pembuatan versi baru knowledge & deprecate versi lama.
5. `public.supersede_knowledge(uuid, uuid, uuid)` — Atomic supersede knowledge entry.
6. `public.get_related_knowledge(uuid, integer, text[])` — Traversal graf relasi knowledge.

*Eksekusi SQL:*
```sql
REVOKE EXECUTE ON FUNCTION public.<nama_fungsi>(...) FROM PUBLIC, anon, authenticated;
```

---

### Kategori B: Client-Callable Functions dengan Strict Auth Guard Clause
Fungsi yang sah dipanggil oleh frontend authenticated tetapi membutuhkan validasi kepemilikan data:

1. **`public.check_daily_quota(target_user_id uuid)`**
   * **Pemanggil Sah:** `frontend/src/components/BillingDashboard.jsx` (Client UI) & `supabase/functions/agent-process/lib/request/quota_middleware.ts` (Edge Function).
   * **Tindakan:** `REVOKE EXECUTE ... FROM anon`, izinkan `authenticated` dan `service_role`.
   * **Guard Clause:**
     ```sql
     IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM target_user_id THEN
         RAISE EXCEPTION 'Unauthorized: access denied to other users quota';
     END IF;
     ```

2. **`public.get_active_knowledge(p_user_id uuid, p_entry_types text[], p_limit integer)`**
   * **Tindakan:** `REVOKE EXECUTE ... FROM PUBLIC, anon`, izinkan `authenticated` dan `service_role`.
   * **Guard Clause:**
     ```sql
     IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
         RAISE EXCEPTION 'Unauthorized: access denied to other users knowledge entries';
     END IF;
     ```

---

## 3. Hasil Verifikasi Linter Supabase

Perintah `supabase db lint --linked` dijalankan terhadap database produksi:
* **Temuan `SECURITY DEFINER` (0028/0029 lint warnings):** **0 temuan (100% bersih / remediated)**.
* **Fungsi Billing & Quota:** Terverifikasi aman dari probing `anon` dan aman dari manipulasi ID user lain.

---

## 4. Rekonstruksi Riwayat Migrasi 29 Agustus 2026

Empat file migrasi historis (`20260829133308_remote.sql`, `20260829133338_remote.sql`, `20260829133547_remote.sql`, `20260829141406_remote.sql`) direkonstruksi langsung dari changelog audit keamanan 29 Agustus 2026 agar repositori lokal menjadi *single source of truth* yang utuh dan sinkron dengan Supabase CLI tanpa file 0-byte.

---

## 5. Ringkasan Akhir & Status Temuan Auth (Leaked Password Protection)

* **Skor Penyelesaian Teknis:** **8 dari 9 item selesai tuntas 100%** (seluruh fungsi RPC `SECURITY DEFINER` aman dan terverifikasi via `db lint`).
* **Item ke-9 (Leaked Password Protection):** ⏸️ **Deferred — Keputusan Bisnis Owner (Bukan Kegagalan Teknis)**.
  * **Fakta:** Upaya aktivasi fitur ini pada dashboard Supabase Auth telah dilakukan, namun diblokir oleh sistem karena fitur *Leaked Password Protection* adalah fitur eksklusif **Pro Plan ($25/bulan)**.
  * **Keputusan:** Owner secara sadar memutuskan menunda upgrade plan untuk saat ini demi pertimbangan efisiensi biaya dan menerima risiko ini sementara.
  * **Kesimpulan:** Item ini telah ditutup dari antrian backlog teknis Antigravity dan murni menjadi domain keputusan bisnis Owner di masa depan.


