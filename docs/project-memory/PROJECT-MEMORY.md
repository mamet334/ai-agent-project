# Mamet AI Project Memory

> [!NOTE]
> **STATUS DOKUMEN: SNAPSHOT**
>
> Dokumen ini adalah representasi human-readable dari data di `project_memory_entries` (Supabase DB).
> **Bukan sumber kebenaran runtime.**
>
> Sumber kebenaran: tabel `project_memory_entries` di Supabase.
> Lihat ADR-0011 untuk aturan lengkap.
>
> **Sync terakhir:** 2026-06-29 (Wave 3 — Project Memory Unification)

---

**Status:** Snapshot (v2 — updated Wave 3)
**Owner:** Mamet Engineer
**Governed by:** ADR-0011 — Project Memory Canonical Source

---

## Purpose

Project Memory adalah memori engineering yang tahan lama dari Mamet AI. Ia menyimpan apa yang telah dipelajari sistem melalui keputusan arsitektur, bug, root cause, perbaikan, pengujian, dan rilis.

Source code dapat berubah. Project Memory menjaga pengalaman.

**Arsitektur Project Memory (per ADR-0011):**

| Layer | Lokasi | Peran |
|---|---|---|
| **CANONICAL** | `project_memory_entries` (Supabase DB) | Source of truth runtime — dibaca Brain 1 |
| **SNAPSHOT** | `docs/project-memory/PROJECT-MEMORY.md` (file ini) | Human-readable copy — boleh stale |
| **LOG NARATIF** | `docs/project-memory/JOURNEY.md` | Kronologi development, bukan data terstruktur |

---

## Journey Log

Kronologi pengembangan tersimpan di:

- `docs/project-memory/JOURNEY.md`

---

## Current Understanding

Mamet AI adalah personal AI Operating System dengan beberapa internal capability:

- **Assistant:** daily assistant penuh dengan memory dan RAG
- **MametLite:** mode ringan, read-oriented, no memory write
- **Engineer:** internal engineering capability dengan Two-Brain Model

LLM adalah reasoning engine yang dapat diganti. Aset utama adalah knowledge.

---

## Repository Map

| Area | Meaning | Status |
|---|---|---|
| `frontend/` | Full Mamet AI web dan Electron client | Production |
| `mametlite/` | Lightweight client untuk RAG dan research | Production |
| `supabase/functions/agent-process/` | Main AI orchestrator | Production |
| `supabase/functions/rag-process/` | Document ingestion dan embedding | Production |
| `backend/` | Legacy Express backend | Legacy (tidak digunakan sebagai primary runtime) |
| `docs/` | Architecture, governance, tasks, ADR, Project Memory | Active |
| `scratch/` | Investigation dan patch scripts | NON-PRODUCTION (lihat `scratch/README.md`) |

---

## Artifact Status Registry

Per ADR-0011, setiap artefak memiliki status:

| Status | Definisi | Contoh |
|---|---|---|
| **CANONICAL** | Sumber kebenaran runtime, tersimpan di DB | `project_memory_entries` dengan status ACTIVE/VERIFIED |
| **SNAPSHOT** | Copy human-readable dari Canonical | File ini (`PROJECT-MEMORY.md`) |
| **GENERATED** | Dibuat otomatis dari sumber lain, jangan edit manual | Export dari dashboard |
| **DEPRECATED** | Tidak berlaku lagi, ada penggantinya | `docs/governance/MAEF.md` |

---

## Verified Findings

> [!NOTE]
> Findings di bawah ini adalah snapshot dari `project_memory_entries` di DB.
> Data definitif ada di DB. Markdown ini mungkin tidak mencerminkan entry terbaru.

### PM-0001: Modern runtime is Supabase-first

**Status:** Verified
**DB entry_type:** Solution
**governance_status (DB):** VERIFIED

Frontend penuh dan MametLite memanggil Supabase Edge Functions untuk agent processing. `backend/server.js` ada, tapi itu adalah legacy relatif terhadap runtime berbasis Supabase saat ini.

---

### PM-0002: `agent-process/index.ts` Context Repair

**Status:** Resolved ✅
**DB entry_type:** Solution
**governance_status (DB):** VERIFIED

File memiliki kode context object yang invalid. Semua dotted property names dan premature `ctx` usage telah diperbaiki.

Update 2026-06-27 (Static Verification):
- `MametExecutionContext` type menggunakan property names yang valid.
- `ctx` dibuat sebelum akses `ctx.*` mana pun (baris 266).
- `AUTH_USER_ID` di-bind dari Supabase JWT (baris 205), bukan dari client payload.
- `canReadMemory: !isMametLite` dan `canWriteMemory: mode === "AI" && !isMametLite` ditegakkan di policy layer.
- Node tsc parse: tidak ada syntax errors.

Deploy verification 2026-06-27:
- Deployed ke BrainBox AI (ref: uuyzdjifhdfyyvpxsofu) via `npx supabase functions deploy`.
- Deployed sebagai **version 246**, status: ACTIVE.
- Runtime check: `OPTIONS /functions/v1/agent-process` → HTTP 200, CORS header `*` confirmed.

---

### PM-0003: UI Production Builds

**Status:** Resolved ✅
**DB entry_type:** Solution
**governance_status (DB):** VERIFIED

Verification 2026-06-27:
- `mametlite`: → **✓ built in 627ms**.
- `frontend`: → **✓ built in 17.48s**.
- Root cause (historical): PowerShell `npm.ps1` path handling. Fixed by using `cmd`.
- GAP-0004: Closed.

---

### PM-0004: Constitution v2 Audit & Wave 1 Execution

**Status:** Verified ✅
**DB entry_type:** Lesson
**governance_status (DB):** VERIFIED
**Date:** 2026-06-29

MAEF v2 dan Vision Constitution v2 ditetapkan sebagai Source of Truth tertinggi. Audit menemukan 18 Architecture Gaps. Wave 1 menutup 6 gap (governance documentation cleanup).

Lesson: Constitution review sistematis menemukan gap yang sebelumnya tidak terdokumentasi. Proses ini harus dilakukan secara periodik.

Ref: `docs/architecture/CONSTITUTION-REVIEW-REPORT-2026-06-29.md`

---

### PM-0005: Project Memory Canonical Source Established

**Status:** Verified ✅
**DB entry_type:** ADRLink
**governance_status (DB):** APPROVED
**Date:** 2026-06-29

ADR-0011 ditetapkan: `project_memory_entries` adalah Canonical Source of Truth. File markdown adalah SNAPSHOT. Aturan sinkronisasi didokumentasikan.

Ref: `docs/adr/ADR-0011-project-memory-canonical-source.md`

---

## Architecture Decision Records (Index)

| ADR | Judul | Status |
|---|---|---|
| ADR-0001 | MAEF as Highest Authority | APPROVED |
| ADR-0002 | Mamet Engineer as Internal Capability | APPROVED |
| ADR-0003 | Auth Binding Layer | APPROVED |
| ADR-0004 | Evidence-First Engineering | APPROVED |
| ADR-0005 | Unified Execution Policy | APPROVED |
| ADR-0006 | Two-Brain Context Model | APPROVED |
| ADR-0007 | Engineering Metrics Derived | APPROVED |
| ADR-0008 | Single Context Pipeline | APPROVED |
| ADR-0009 | index.ts Decomposition Plan | APPROVED |
| ADR-0010 | Verification Engine Hard Gate Spec | APPROVED |
| ADR-0011 | Project Memory Canonical Source | APPROVED |

---

## Open Engineering Tasks (Wave Status)

| Task | Deskripsi | Wave | Status |
|---|---|---|---|
| TASK-0001 | MAEF documentation baseline | — | Done ✅ |
| TASK-0002 | Repair agent-process context | — | Done ✅ |
| TASK-0003 | MametLite source boundary | — | Done ✅ |
| TASK-0004 | Windows build pipeline | — | Done ✅ |
| TASK-0005 | Mamet Engineer Blueprint | — | Done ✅ |
| TASK-0006 | Project Memory Service Design | — | Superseded by ADR-0011 |
| TASK-NEW-001 | Deprecate MAEF v1, Vision v1 | Wave 1 | Done ✅ |
| TASK-NEW-002 | Update Master Architecture Index | Wave 1 | Done ✅ |
| TASK-NEW-003 | Update Architecture Gap Register | Wave 1 | Done ✅ |
| TASK-NEW-004 | Update JOURNEY.md | Wave 1 | Done ✅ |
| TASK-NEW-005 | Schema migration confidence_score | Wave 2 (DB) | Pending |
| TASK-NEW-006 | ADR-0008 Context Pipeline | Wave 2 | Done ✅ |
| TASK-NEW-007 | ADR-0009 Decomposition Plan | Wave 2 | Done ✅ |
| TASK-NEW-008 | ADR-0010 Verification Engine Spec | Wave 2 | Done ✅ |
| TASK-NEW-009 | Label scratch files | Wave 1 | Done ✅ |
| TASK-NEW-010 | Update PROJECT-MEMORY.md | Wave 3 | Done ✅ |
| TASK-NEW-011 | ADR-0011 Project Memory Canonical | Wave 3 | Done ✅ |
| TASK-NEW-012 | index.ts Decomposition (Wave 5) | Wave 5 | In Progress |

---

## Memory Sync Rule (per ADR-0011)

Setiap perubahan engineering yang bermakna harus masuk ke DB terlebih dahulu, lalu markdown diupdate sebagai snapshot:

**Urutan wajib:**
1. Buat/update entry di `project_memory_entries` (DB — CANONICAL)
2. Setelah DB confirmed → update markdown ini sebagai SNAPSHOT
3. Catat tanggal sync di header dokumen ini

**Field wajib di DB untuk setiap entry:**
- `entry_type` — jenis knowledge
- `title` — judul identifiable
- `content` — isi lengkap
- `governance_status` — status governance
- `is_current` — apakah versi terbaru

**Referensi:** ADR-0011 `docs/adr/ADR-0011-project-memory-canonical-source.md`
