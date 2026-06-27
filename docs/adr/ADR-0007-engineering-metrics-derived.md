# ADR-0007: Engineering Metrics — Derived from Existing Data

**Date:** 2026-06-27
**Status:** Accepted
**Phase:** Post-Baseline (Observability Layer)

## Context

Mamet Engineer memiliki kemampuan teknis yang berkembang. Tanpa metrik objektif, pertanyaan seperti *"Apakah Engineer lebih baik dari tiga bulan lalu?"* hanya bisa dijawab dengan perasaan.

Namun, membangun tabel `engineering_metrics` tersendiri sebelum ada kebutuhan nyata (performa, histori multi-bulan, analisis tren) adalah overengineering.

**Keputusan:** Gunakan **Derived Metrics** — metrik yang dihitung langsung dari tabel yang sudah ada (`verification_runs`, `engineering_tasks`, `architecture_gaps`, `project_memory_entries`). Tabel dedicated `engineering_metrics` ditunda sampai ada kebutuhan nyata.

---

## Decision

### Kategori Metrik

| Kategori | Status |
|---|---|
| Derived (dapat dihitung sekarang) | ✅ Aktif |
| Tracked (butuh penyimpanan tambahan) | 🔜 Ditunda |

---

## Derived Metrics (Tersedia Sekarang)

### 1. Verification Pass Rate
**Definisi:** Persentase verification run yang hasilnya PASS.
**Pertanyaan yang dijawab:** Seberapa sering pekerjaan Engineer melewati verifikasi?
**Sumber:** `verification_runs.result`

```sql
SELECT
  COUNT(*) FILTER (WHERE result IN ('Pass', 'PASS')) * 100.0 / NULLIF(COUNT(*), 0)
    AS verification_pass_rate_pct,
  COUNT(*) AS total_runs,
  COUNT(*) FILTER (WHERE result IN ('Pass', 'PASS')) AS passed,
  COUNT(*) FILTER (WHERE result IN ('Fail', 'FAIL')) AS failed
FROM verification_runs;
```

---

### 2. Task Completion Rate
**Definisi:** Persentase engineering tasks yang mencapai status Done.
**Pertanyaan yang dijawab:** Seberapa banyak task yang benar-benar diselesaikan vs dibiarkan terbuka?
**Sumber:** `engineering_tasks.status`

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'Done') * 100.0 / NULLIF(COUNT(*), 0)
    AS task_completion_rate_pct,
  COUNT(*) AS total_tasks,
  COUNT(*) FILTER (WHERE status = 'Done') AS done,
  COUNT(*) FILTER (WHERE status = 'InProgress') AS in_progress,
  COUNT(*) FILTER (WHERE status = 'Proposed') AS proposed
FROM engineering_tasks;
```

---

### 3. Mean Time to Resolution (MTTR)
**Definisi:** Rata-rata waktu (dalam jam) dari task dibuat hingga statusnya Done.
**Pertanyaan yang dijawab:** Seberapa cepat Engineer menyelesaikan satu task?
**Sumber:** `engineering_tasks.created_at`, `engineering_tasks.updated_at`

```sql
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0)::numeric, 1)
    AS avg_resolution_hours,
  MIN(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0) AS min_hours,
  MAX(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0) AS max_hours
FROM engineering_tasks
WHERE status = 'Done';
```

---

### 4. Architecture Gap Closure Rate
**Definisi:** Persentase architecture gaps yang sudah di-resolve.
**Pertanyaan yang dijawab:** Seberapa efektif Engineer dalam menutup gap arsitektur?
**Sumber:** `architecture_gaps.status`

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'Resolved') * 100.0 / NULLIF(COUNT(*), 0)
    AS gap_closure_rate_pct,
  COUNT(*) AS total_gaps,
  COUNT(*) FILTER (WHERE status = 'Resolved') AS resolved,
  COUNT(*) FILTER (WHERE status = 'Open') AS open,
  COUNT(*) FILTER (WHERE status = 'InProgress') AS in_progress
FROM architecture_gaps;
```

---

### 5. Engineering Knowledge Growth Rate
**Definisi:** Jumlah Project Memory entries yang ditambahkan per bulan.
**Pertanyaan yang dijawab:** Apakah knowledge base Engineer bertumbuh?
**Sumber:** `project_memory_entries.created_at`

```sql
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS entries_added,
  COUNT(*) FILTER (WHERE status = 'Verified') AS verified_entries
FROM project_memory_entries
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC
LIMIT 6;
```

---

### 6. Health Snapshot (Gabungan)
**Definisi:** Satu query untuk melihat kondisi keseluruhan sistem Engineer.
**Gunakan untuk:** Phase 8 Self Maintenance health check.

```sql
SELECT
  -- Task Health
  COUNT(t.*) FILTER (WHERE t.status = 'Done') * 100.0 / NULLIF(COUNT(t.*), 0)
    AS task_completion_pct,
  COUNT(t.*) FILTER (WHERE t.status = 'InProgress') AS tasks_in_progress,

  -- Gap Health
  COUNT(g.*) FILTER (WHERE g.status = 'Open') AS gaps_open,
  COUNT(g.*) FILTER (WHERE g.status = 'Resolved') * 100.0 / NULLIF(COUNT(g.*), 0)
    AS gap_closure_pct,

  -- Verification Health
  COUNT(v.*) FILTER (WHERE v.result IN ('Pass', 'PASS')) * 100.0 / NULLIF(COUNT(v.*), 0)
    AS verification_pass_pct,

  -- Knowledge Health
  COUNT(m.*) FILTER (WHERE m.status = 'Verified') AS verified_memory_entries
FROM
  engineering_tasks t,
  architecture_gaps g,
  verification_runs v,
  project_memory_entries m;
```

---

## Tracked Metrics (Ditunda — Butuh Infrastructure)

Metrik berikut belum dapat dihitung dari data yang ada. Akan diimplementasikan ketika ada **kebutuhan nyata** (histori multi-bulan, analisis tren, perbandingan performa).

| Metrik | Blocker | Solusi Masa Depan |
|---|---|---|
| **Average Confidence** | Confidence score belum disimpan ke DB | Tambahkan `confidence_score NUMERIC` ke `verification_runs` |
| **Patch Acceptance Rate** | Belum ada tracking apakah patch diterima/direvisi | Tambahkan kolom `patch_accepted BOOLEAN` ke `engineering_tasks` |
| **Review Accuracy** | Belum ada feedback loop review → verifikasi | Tambahkan `review_confirmed BOOLEAN` ke `verification_runs` |
| **Recurring Bug Rate** | Bug belum dikategorikan/ditagging | Tambahkan `bug_category TEXT` ke `project_memory_entries` |

**Kapan membuat tabel `engineering_metrics` tersendiri?**
Hanya jika salah satu kondisi ini terpenuhi:
1. Derived queries terlalu lambat (>500ms) karena volume data besar.
2. Perlu menyimpan snapshot historis (trend bulan ke bulan).
3. Dashboard perlu polling real-time tanpa menghitung ulang setiap saat.

---

## Consequences

- **Tidak ada schema migration saat ini.** Zero risk, zero overhead.
- Semua metrik dapat langsung dijalankan di Supabase SQL Editor kapan saja.
- Engineer Dashboard dapat menambahkan metrik ini sebagai derived query di masa depan.
- ADR ini menjadi kontrak: jika tabel `engineering_metrics` dibuat nanti, ia harus mengacu pada definisi metrik di dokumen ini.
