# Changelog: Deprecation of `cron-agent` (Legacy Shopee Ninja / Task Executor)

**Date:** 31 Agustus 2026
**Type:** Security / Scope Cleanup
**Status:** COMPLETE
**Related:** ADR-015 (Engineer Self-Maintenance Pipeline), §2.5 Owner-First Economics

---

## 1. Summary

Edge Function `cron-agent` dan cron trigger-nya (`mamet-cron-job`) telah **dinonaktifkan permanen**. Fungsi ini adalah peninggalan proyek AI agent lama, di luar scope Mamet OS Ecosystem, dan melanggar prinsip *Owner-Triggered Only* yang ditetapkan di ADR-015.

## 2. Findings (Audit Trigger)

Audit kesesuaian self-maintenance standard menemukan:

- `cron.job` (`jobid: 2`, name: `mamet-cron-job`) berjalan **setiap menit** (`* * * * *`) via `pg_net.http_post` ke endpoint `cron-agent`, tanpa approval Owner per-eksekusi.
- Endpoint `cron-agent` di-deploy dengan `verify_jwt: false` — dapat dipanggil publik tanpa autentikasi.
- Isi function (v40, live di production) ternyata jauh lebih luas dari sekadar task executor:
  1. **Scheduled task executor** — memanggil `agent-process` (LLM) untuk task di tabel `scheduled_tasks`, lalu mengirim laporan email via Resend.
  2. **"Shopee Ninja"** — bot afiliasi otomatis: scraping produk Shopee via Jina Reader, generate caption dari template, auto-post ke Telegram/Twitter/Facebook Page menggunakan token API di environment variables. Termasuk "stealth mode" (40% random skip) untuk menyamarkan pola otomatis.
  3. **Auto-Discovery** — pencarian web harian otomatis (DuckDuckGo/Jina) untuk menemukan produk trending dan memasukkannya ke antrean posting, tanpa keterlibatan Owner.
- Tabel `scheduled_tasks` kosong pada saat audit → tidak ada LLM cost yang sedang terjadi, namun risiko laten tetap ada (endpoint publik + auto-enable default jika ada row baru masuk).
- Fitur ini dikonfirmasi oleh Owner sebagai **peninggalan AI agent lama, di luar scope Mamet OS**.

## 3. Root Cause

Dibangun sebelum ADR-015 diformalkan (28 Juli 2026). Prinsip *"TIDAK ADA cron otomatis yang memanggil LLM"* dan *"TIDAK ADA background task tanpa sepengetahuan Owner"* belum ada saat `cron-agent` dibuat, sehingga tidak pernah dimigrasikan atau ditutup saat standar baru berlaku.

## 4. Actions Taken

| # | Action | Result |
|---|--------|--------|
| 1 | `SELECT cron.unschedule(2)` pada project `uuyzdjifhdfyyvpxsofu` | `mamet-cron-job` dihapus dari `cron.job`; tidak ada lagi eksekusi otomatis tiap menit |
| 2 | Redeploy `cron-agent` dengan stub kosong | Function tidak lagi menjalankan task executor, Shopee Ninja, atau Auto-Discovery. Semua request kini menerima `410 Gone` |
| 3 | Ubah `verify_jwt` pada `cron-agent` dari `false` → `true` | Endpoint tidak lagi dapat dipanggil publik tanpa autentikasi |

Cron job lain (`health-checker-15min`, `cleanup-checks-weekly`, `cleanup-incidents-monthly`, `cleanup-memories-daily`) **tidak diubah** — dikonfirmasi aman, tidak memanggil LLM atau layanan eksternal berbayar.

## 5. Not Yet Done (Owner Follow-up Required)

- **Revoke token API** milik Shopee Ninja (Telegram Bot Token, Twitter Bearer Token, Facebook Page Token, Resend API Key) langsung dari masing-masing platform — pembersihan kode tidak mencabut kredensial yang sudah ada di environment variables Supabase.
- Pertimbangkan hapus total tabel `shopee_queue` dan kolom terkait jika memang sudah tidak dipakai (belum dilakukan di sesi ini — butuh konfirmasi terpisah karena sifatnya destruktif).
- Repo lokal (`_knowledge_archive` / source `cron-agent/index.ts`) masih menyimpan source code lama untuk referensi historis; belum dipindah ke arsip resmi.

## 6. Compliance Note

Tindakan ini menegakkan kembali kepatuhan terhadap **ADR-015 §2.5 (Owner-First Economics)** dan prinsip **No Silent State Transition** — perubahan dicatat di sini, bukan dilakukan diam-diam di database.

---

**Approved by:** Slamet (Owner)
**Executed by:** AI Co-Pilot (Claude) via Supabase MCP, atas permintaan langsung Owner dalam sesi audit 31 Agustus 2026.
