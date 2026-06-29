# ADR-0011: Project Memory Canonical Source of Truth

**ID:** ADR-0011
**Judul:** `project_memory_entries` (Supabase DB) sebagai Canonical Source of Truth Project Memory
**Status:** APPROVED
**Tanggal:** 2026-06-29
**Penulis:** Mamet Engineering (Constitution Review Wave 3)
**Menutup Gap:** GAP-NEW-005
**Berlaku untuk:** Seluruh sistem yang membaca atau menulis Project Memory

---

## 1. Konteks dan Latar Belakang

### 1.1 Masalah yang Ditemukan

Constitution Review 2026-06-29 menemukan GAP-NEW-005: **Project Memory bersifat hybrid** — ada dua representasi yang tidak tersinkronisasi:

| Representasi | Lokasi | Dibaca oleh |
|---|---|---|
| File Markdown | `docs/project-memory/PROJECT-MEMORY.md` | Manusia, AI dalam konteks dokumen |
| Database Tabel | `project_memory_entries` (Supabase) | Runtime Engine (Brain 1), API |

Akibatnya:
- Engineer tidak tahu mana yang lebih baru
- Update di database tidak selalu tercermin di markdown
- Update di markdown tidak masuk ke database
- Brain 1 membaca database, bukan markdown — tapi engineer manusia membaca markdown

### 1.2 Implikasi Sebelum ADR Ini

Sebelum keputusan ini, sistem beroperasi dalam ambiguitas:

```
Engineer (manusia) membaca docs/project-memory/PROJECT-MEMORY.md
          ↓ (mungkin stale)
Runtime Engineer (AI) membaca project_memory_entries
          ↓ (mungkin tidak ada di file)
Tidak ada jaminan konsistensi
```

---

## 2. Keputusan

### 2.1 Penetapan Canonical Source

**`project_memory_entries` di Supabase adalah Canonical Source of Truth untuk Project Memory.**

Implikasi langsung:
1. Semua query runtime (Brain 1, API search, Engineering Dashboard) membaca dari DB
2. File markdown adalah **snapshot** — bukan sumber kebenaran
3. Konflik antara DB dan markdown → DB yang menang
4. Update resmi harus masuk ke DB terlebih dahulu

### 2.2 Hirarki Otoritas Project Memory

```
MAEF v2 → Vision Constitution v2
         ↓
   project_memory_entries (DB)     ← CANONICAL
         ↓ (generated from)
   docs/project-memory/PROJECT-MEMORY.md  ← SNAPSHOT
```

---

## 3. Definisi Status Artefak

Setiap artefak dalam ekosistem Project Memory memiliki status berikut:

### 3.1 CANONICAL

**Definisi:** Sumber kebenaran. Dipakai oleh runtime sistem. Selalu up-to-date.

**Syarat:**
- Tersimpan di `project_memory_entries` dengan `governance_status = 'ACTIVE'` atau `'VERIFIED'`
- Memiliki `is_current = true`
- Memiliki `entry_type` yang terdaftar: `ADRLink`, `Solution`, `Lesson`, `RootCause`, `Task`, `ArchGap`, `Verification`

**Contoh artefak CANONICAL:**
- Entries di `project_memory_entries` dengan governance_status ACTIVE/VERIFIED
- ADR yang sudah approved dan di-link ke DB
- Verified findings yang tercatat di DB

**Siapa yang membaca:** Runtime Brain 1, Engineering Dashboard, API search

### 3.2 SNAPSHOT

**Definisi:** Representasi human-readable dari data CANONICAL. Dibuat dari DB. Bukan sumber kebenaran.

**Syarat:**
- Berupa file markdown di `docs/project-memory/`
- Berisi tanggal pembuatan snapshot
- Berisi disclaimer bahwa ini bukan sumber kebenaran

**Contoh artefak SNAPSHOT:**
- `docs/project-memory/PROJECT-MEMORY.md`
- `docs/project-memory/JOURNEY.md`
- Dokumen ringkasan yang dibuat dari DB query

**Siapa yang membaca:** Manusia (engineer, owner), AI dalam sesi dokumentasi

**Aturan:** Snapshot boleh lebih lama dari Canonical. Snapshot tidak boleh di-edit manual sebagai cara utama update — harus lewat DB.

### 3.3 GENERATED

**Definisi:** Artefak yang dibuat secara otomatis dari sumber lain. Bukan untuk diedit manual.

**Syarat:**
- Ada header yang jelas: `> ⚠️ GENERATED — Jangan edit manual`
- Berisi timestamp generasi
- Berisi referensi ke sumber asal

**Contoh artefak GENERATED:**
- Export laporan dari dashboard
- Ringkasan otomatis dari ADR yang di-generate oleh sistem

**Siapa yang membaca:** Manusia untuk referensi, bukan untuk edit

### 3.4 DEPRECATED

**Definisi:** Artefak yang sudah tidak berlaku dan digantikan oleh sesuatu yang lebih baru.

**Syarat:**
- Memiliki header DEPRECATED yang jelas
- Memiliki pointer ke artefak penggantinya
- Tanggal deprecation tercatat

**Contoh artefak DEPRECATED:**
- `docs/governance/MAEF.md` (deprecated Wave 1, pointer ke MAEF v2)
- `docs/governance/VISION.md` (deprecated Wave 1, pointer ke Vision v2)
- Entry DB dengan `governance_status = 'SUPERSEDED'` atau `'DEPRECATED'`

---

## 4. Aturan Sinkronisasi

### 4.1 Aliran Data Resmi

```
Perubahan real → Masuk ke DB (project_memory_entries) dulu
                         ↓
              DB menjadi Canonical
                         ↓
        (opsional, periodik) Generate snapshot ke markdown
                         ↓
              Markdown menjadi Snapshot
```

### 4.2 Kapan Markdown Boleh Di-edit Langsung

Markdown di `docs/project-memory/` **BOLEH** di-edit langsung hanya untuk:
1. Perubahan format/presentasi yang tidak mengubah fakta engineering
2. Penambahan Journey entry (JOURNEY.md) — ini adalah log naratif, bukan data terstruktur
3. Pembuatan ADR baru di `docs/adr/` — ADR adalah dokumen terpisah dari Project Memory entries

Markdown di `docs/project-memory/` **TIDAK BOLEH** di-edit langsung untuk:
1. Mengubah fakta teknikal yang seharusnya ada di DB
2. Menambah Verified Finding yang belum ada di DB
3. Mengubah status task atau gap yang seharusnya di-update di DB

### 4.3 Kapan DB Harus Diupdate

DB (`project_memory_entries`) **WAJIB** di-update saat:
1. Ada bug baru yang ditemukan dan di-resolve → tambah entry `entry_type = 'RootCause'` + `'Solution'`
2. Ada lesson learned baru → tambah entry `entry_type = 'Lesson'`
3. ADR baru disetujui → tambah entry `entry_type = 'ADRLink'`
4. Status governance berubah → update `governance_status`
5. Ada versi baru dari entry yang sudah ada → update `is_current = false` pada entry lama, insert entry baru

### 4.4 Sinkronisasi Periodik (Manual, Belum Otomatis)

Sampai ada mekanisme otomatis, sinkronisasi dilakukan secara manual:

**Frekuensi:** Setelah setiap Wave implementasi selesai

**Prosedur:**
1. Query DB: `SELECT * FROM project_memory_entries WHERE governance_status IN ('ACTIVE', 'VERIFIED') AND is_current = true ORDER BY created_at DESC`
2. Bandingkan dengan isi `PROJECT-MEMORY.md`
3. Tambahkan ke markdown apa yang ada di DB tapi belum tercermin
4. Catat tanggal sync di header markdown

**Catatan:** Prosedur ini akan diotomatisasi di Wave masa depan (lihat §7 Migration Plan).

---

## 5. Schema Referensi: `project_memory_entries`

Tabel DB yang menjadi Canonical Source:

```sql
-- Kolom yang relevan untuk Project Memory
project_memory_entries:
  id                UUID PRIMARY KEY
  entry_type        TEXT  -- 'ADRLink' | 'Solution' | 'Lesson' | 'RootCause' | 'Task' | 'ArchGap' | 'Verification'
  title             TEXT  -- Judul singkat, identifiable
  content           TEXT  -- Isi lengkap knowledge
  governance_status TEXT  -- 'DRAFT' | 'ACTIVE' | 'APPROVED' | 'VERIFIED' | 'SUPERSEDED' | 'DEPRECATED'
  is_current        BOOL  -- true = versi terbaru dari entry ini
  version_major     INT   -- Major version
  version_minor     INT   -- Minor version
  version_patch     INT   -- Patch version
  created_at        TIMESTAMPTZ
  updated_at        TIMESTAMPTZ
```

Entry yang di-load ke Brain 1 (runtime):
```sql
WHERE governance_status IN ('ACTIVE', 'APPROVED', 'VERIFIED')
  AND is_current = true
  AND entry_type IN ('ADRLink', 'Solution', 'Lesson', 'RootCause')
```

---

## 6. Dampak pada Komponen Sistem

| Komponen | Dampak ADR Ini |
|---|---|
| **Brain 1 (Runtime Engineer)** | ✅ Sudah benar — membaca DB. Tidak perlu perubahan. |
| **Brain 2 (Dynamic Context)** | ✅ Sudah benar — membaca `engineering_tasks`, `architecture_gaps`. Tidak perlu perubahan. |
| **`PROJECT-MEMORY.md`** | ⚠️ Perlu ditambah disclaimer SNAPSHOT. Diupdate di Wave 3. |
| **`JOURNEY.md`** | ✅ Sudah benar — ini adalah log naratif, bukan data struktural. |
| **Engineering Dashboard (future)** | 🔲 Harus membaca dari DB, bukan dari file markdown. |
| **RAG pipeline** | ✅ RAG membaca dari `documents` table, bukan dari `project_memory_entries`. Tidak konflik. |
| **Supabase Studio (manual)** | ✅ Interface untuk mengupdate DB entries secara manual. |

---

## 7. Migration Plan

### Phase 0 (Sekarang — Wave 3)
Dokumentasi saja. ADR ini ditetapkan. `PROJECT-MEMORY.md` diupdate dengan disclaimer SNAPSHOT.

### Phase 1 (Backfill — Wave 3 lanjutan, opsional)
Identifikasi Verified Findings di `PROJECT-MEMORY.md` yang belum ada di DB:
- PM-0001: Modern runtime is Supabase-first
- PM-0002: `agent-process/index.ts` context repair
- PM-0003: UI production builds

Buat SQL insert untuk memasukkan findings ini ke `project_memory_entries` dengan `governance_status = 'VERIFIED'`.

**Catatan:** Ini tidak mengubah kode runtime. Hanya data insert ke DB.

### Phase 2 (Otomasi — Future Wave)
Buat mekanisme otomatis untuk generate `PROJECT-MEMORY.md` dari DB query. Ini akan menjadi fitur Engineering Dashboard.

### Phase 3 (Validation — Future Wave)
Tambahkan check di pipeline CI/CD: jika ada ADR baru tapi tidak ada entry di DB → warning.

---

## 8. Konsekuensi

### Positif
- Single Source of Truth yang jelas: runtime tidak pernah bingung membaca dari mana
- Engineer manusia masih bisa membaca markdown, tapi tahu itu adalah snapshot
- Brain 1 sudah correct — tidak perlu perubahan runtime

### Risiko / Negatif
- Snapshot markdown bisa stale jika sinkronisasi tidak dilakukan secara disiplin
- Engineer yang hanya membaca markdown mungkin melihat informasi yang sudah usang
- Perlu disiplin untuk selalu update DB dulu sebelum markdown

### Mitigasi
- Header SNAPSHOT yang jelas di `PROJECT-MEMORY.md` dengan tanggal sync terakhir
- Prosedur sinkronisasi periodik yang terdokumentasi (§4.4)
- Aturan yang jelas tentang kapan DB wajib diupdate (§4.3)

---

## 9. Referensi

- GAP-NEW-005 — `docs/architecture/ARCHITECTURE-GAPS.md`
- TASK-NEW-005 (Wave 3) — Constitution Review Implementation Plan
- MAEF v2 §10 (Knowledge Governance): "knowledge wajib terdokumentasi, terverifikasi, dapat ditelusuri"
- MAEF v2 §11 (Project Memory Principle): "project memory adalah aset strategis"
- Vision Constitution v2 §PROJECT MEMORY
- ADR-0006 — Two-Brain Context Model (referensi Brain 1 membaca DB)
