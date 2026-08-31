# Changelog: Memory Governor Addendum Fase 1 + PR#8 Tech-Spec

Tanggal: 2026-08-31
Status: Selesai Diimplementasikan
Branch: `main`
Commit Awal: `83676bc` — feat(MemoryGovernor): implementasi Addendum Fase 1
Commit Akhir: `0257285` — docs(PR#8): susun tech-spec Linux-style Request Dispatch

---

## Ringkasan Eksekutif

Sesi ini menyelesaikan dua hal:

1. **Implementasi Addendum Fase 1 `MemoryGovernorService`** — melengkapi 4 kontrak
   perilaku yang belum ada di versi awal service (dibuat 2026-08-04). Addendum mencakup:
   Two-Stage Retrieval, Conflict Resolution, Access Tier, dan Soft-Delete Lifecycle.

2. **Penyusunan Tech-Spec PR#8** — dokumen desain baru untuk *Linux-style Request Dispatch*
   (`RequestClassifierService`, `LookupHandler`, `ConversationHandler`) yang sebelumnya
   hanya tercatat nama di `INDEX-ROADMAP.md` tanpa spesifikasi teknis.

---

## Bagian 1 — Memory Governor Addendum Fase 1

### Latar Belakang

`MemoryGovernorService.js` versi awal (2026-08-04) sudah punya Golden Source Rule
(`storeGoldenMemory`, `verifyMemorySummary`) tapi belum mengimplementasikan 4 kontrak
perilaku yang ditetapkan di roadmap Addendum:

| Kontrak | Status Sebelum | Status Setelah |
|---|---|---|
| Two-Stage Retrieval | ❌ Tidak ada | ✅ `retrieveMemory()` |
| Conflict Resolution | ❌ Tidak ada | ✅ `detectAndMarkConflict()` + `resolveConflict()` |
| Access Tier | ❌ Tidak ada kolom | ✅ kolom `access_tier` + filter query |
| Soft-Delete Lifecycle | ❌ Tidak ada kolom | ✅ `archiveMemory()` + `requestPurge()` + `executePurge()` |

### SQL Migration

**File baru:** `supabase/migrations/20260831_memory_governor_addendum_fase1.sql`

Kolom yang ditambahkan ke tabel `user_memories` (semua idempotent + backward compatible):

| Kolom | Tipe | Default | Kegunaan |
|---|---|---|---|
| `category` | TEXT | `'general'` | Two-Stage Filter Tahap 1 (no full-table scan) |
| `access_tier` | TEXT | `'generic'` | Enum: `generic` \| `sensitive` — sensitive exclude by default |
| `status` | TEXT | `'active'` | Enum: `active` \| `archived` \| `pending_purge` \| `CONFLICT_PENDING_REVIEW` |
| `version_sequence` | INTEGER | `1` | Untuk deteksi versi tidak sekuensial (conflict detection) |

Index baru: `idx_user_memories_retrieval` (composite: `user_id, category, status, access_tier`)

**Status:** ✅ Sudah dijalankan manual oleh Owner di Supabase Dashboard → SQL Editor
("Success. No rows returned" = berhasil)

### MemoryGovernorService.js

**File dimodifikasi:** `frontend/src/core/runtime/services/MemoryGovernorService.js`

5 fungsi baru ditambahkan:

**1. `retrieveMemory({ userId, categories, includeSensitive, topK })`**
- Two-Stage Filter sesuai kontrak roadmap
- Tahap 1: SQL `WHERE category IN (...) AND status = 'active' AND access_tier = 'generic'`
  → candidate pool dibatasi (tidak full-table scan)
- Tahap 2: Ranking berdasarkan `recency_score × 0.4 + confidence_score × 0.6`
- Log: `[MemoryGovernorService] Two-Stage: Tahap 1 → X kandidat, Tahap 2 → Y teratas`

**2. `detectAndMarkConflict({ userId, sourceFile, newContent, newVersionSeq })`**
- Deteksi: `source_reference` sama + `content` berbeda + versi tidak sekuensial
- Tindakan: UPDATE status → `CONFLICT_PENDING_REVIEW`
- Aturan wajib: **DILARANG auto-resolve** — hanya user yang bisa resolve
- Emit: `MemoryGovernor:ConflictDetected`

**3. `resolveConflict(memoryId, resolution)`**
- `resolution = 'keep'` → status kembali ke `active`
- `resolution = 'discard'` → status ke `archived`
- Hanya bisa resolve record berstatus `CONFLICT_PENDING_REVIEW`
- **Tidak ada jalur otomatis ke fungsi ini** — hanya via UI eksplisit user

**4. `archiveMemory(memoryId)`**
- Soft-delete: `active` → `archived`
- Record tetap di DB, di-exclude dari `retrieveMemory()`
- Emit: `MemoryGovernor:Archived`

**5. `requestPurge(memoryId)` + `executePurge(memoryId)`**
- Dua tahap wajib: `archived` → `pending_purge` → hard DELETE
- `executePurge()` verifikasi status `pending_purge` sebelum DELETE
- Tidak ada jalur otomatis (cron/background job) ke hard-delete
- Emit: `MemoryGovernor:Purged`

### MemoryService.js

**File dimodifikasi:** `frontend/src/core/runtime/services/MemoryService.js`

`getMemory(query, options)` diupdate:
- **Path utama:** delegasi ke `MemoryGovernorService.retrieveMemory()` jika service tersedia
- **Fallback:** keyword ilike search jika governor tidak tersedia (backward compatible)
- `_inferCategories(query)` — mapping sederhana query text → kategori
  (`general`, `engineering`, `preference`, `location`, `project`)

### MemoryContextPanel.jsx

**File dimodifikasi:** `frontend/src/components/workbench/MemoryContextPanel.jsx`

- Import `AlertTriangle` dari lucide-react
- Prop baru: `onResolveConflict(memoryId, resolution)`
- State baru: `resolvingId` — track item yang sedang di-resolve
- Item dengan `status === 'CONFLICT_PENDING_REVIEW'`:
  - Background merah `bg-red-950/30`, border `border-red-500/50`
  - Icon `AlertTriangle` menggantikan icon tipe normal
  - Badge `⚠️ KONFLIK` menggantikan label tipe
  - Dua tombol inline: **Simpan** (keep → active) dan **Buang** (discard → archived)
  - Tombol disabled + `...` saat sedang memproses

### ConversationEngine.jsx

**File dimodifikasi:** `frontend/src/components/workbench/ConversationEngine.jsx`

- `onResolveConflict` disambungkan ke `MemoryGovernorService.resolveConflict()`
- Auto-refresh panel setelah resolve jika `lastMemoryQuery` tersedia

---

## Bagian 2 — Sinkronisasi Repository

### git pull sebelum sesi dimulai

Lokal tertinggal 2 commit dari GitHub. Setelah `git pull`:
- `docs/project-memory/changelog/2026-08-29-security-hardening-supabase.md` — ditambahkan
- `docs/roadmap/roadmap memory governor.md` — diupdate (10 baris)

---

## Bagian 3 — PR#8 Tech-Spec

### File Baru

**`docs/roadmap/PR8-linux-style-dispatch.md`**

Tech-spec untuk implementasi berikutnya. Isi utama:

**Masalah yang diselesaikan:**
`AssistantService.processMessage()` menjalankan alur yang sama (memory retrieval + RAG +
semantic context + CMG + trimming) untuk setiap pesan, termasuk pertanyaan singkat yang
tidak butuh itu semua.

**3 komponen yang akan dibuat:**

| Komponen | Tipe | Fungsi |
|---|---|---|
| `RequestClassifierService` | File baru | Dispatch deterministik — 0 LLM cost, classify dalam microseconds |
| `LookupHandler` | Method private di AssistantService | Skip memory/RAG/semantic untuk LOOKUP |
| `ConversationHandler` | Refactor method | Extract alur penuh yang sudah ada |

**Tipe klasifikasi:**
- `LOOKUP` — pesan ≤80 char + pola tanya + tidak ada konteks sambungan
- `CONVERSATION` — default (alur penuh, perilaku saat ini)
- `ENGINEER` — jika `resolvedMode === 'ENGINEER'`
- `COMMAND` — pesan command eksplisit (`/run`, "buat folder", dll)
- `SKILL` — slot disiapkan untuk Skill Implementation, belum diisi

**Kaitan ke depan:**
Skill Implementation (`teknis-skil-implementasi.md`) bergantung pada
`RequestClassifierService.classify()` sebagai titik ekstensi untuk route ke skill handler.

### INDEX-ROADMAP.md

Diupdate:
- Tandai `roadmap memory governor.md` sebagai ✅ Fase 1 Selesai
- Tambahkan `PR8-linux-style-dispatch.md` ke tabel status
- Update urutan pengerjaan: PR#8 sebagai posisi sekarang

---

## Daftar File yang Dibuat / Dimodifikasi

| File | Aksi | Bagian |
|---|---|---|
| `supabase/migrations/20260831_memory_governor_addendum_fase1.sql` | Dibuat | Addendum SQL |
| `frontend/src/core/runtime/services/MemoryGovernorService.js` | Dimodifikasi | +5 fungsi Addendum |
| `frontend/src/core/runtime/services/MemoryService.js` | Dimodifikasi | Two-Stage delegation |
| `frontend/src/components/workbench/MemoryContextPanel.jsx` | Dimodifikasi | Badge konflik + resolve UI |
| `frontend/src/components/workbench/ConversationEngine.jsx` | Dimodifikasi | onResolveConflict wiring |
| `docs/roadmap/PR8-linux-style-dispatch.md` | Dibuat | Tech-spec PR#8 |
| `docs/roadmap/INDEX-ROADMAP.md` | Dimodifikasi | Status update |

---

## Commit History Sesi Ini

- `83676bc` — feat(MemoryGovernor): implementasi Addendum Fase 1 — 4 kontrak perilaku
- `0257285` — docs(PR#8): susun tech-spec Linux-style Request Dispatch + update INDEX-ROADMAP

---

## Catatan untuk AI Berikutnya

- **SQL Addendum sudah dijalankan** di Supabase — kolom `category`, `access_tier`,
  `status`, `version_sequence` sudah ada di tabel `user_memories`.
- **PR#8 siap diimplementasikan** — baca `docs/roadmap/PR8-linux-style-dispatch.md`
  sebelum mulai. Tidak perlu menyusun tech-spec lagi.
- **`teknis-skil-implementasi.md` belum dibuat** — susun dulu setelah PR#8 selesai,
  sebelum mengerjakan Skill Implementation.
- **CMG threshold masih 0.3 (longgar)** — monitor `[AssistantService] CMG REJECT`
  di console, perketat ke 0.5 setelah ada data frekuensi yang cukup.
- **PR#5 integration masih inactive** — menunggu `KnowledgeService` refactor agar
  mengembalikan raw chunk objects (bukan string gabungan).
