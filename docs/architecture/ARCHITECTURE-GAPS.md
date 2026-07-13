# Architecture Gaps

Status: Active
Last Updated: 2026-06-29 (Constitution Review — 18 gaps synced from audit)
Source: `docs/architecture/CONSTITUTION-REVIEW-REPORT-2026-06-29.md`

This file records differences between MAEF, Vision, architecture, and current implementation.

---

## Gap Status Key

| Status | Meaning |
|---|---|
| Open | Identified, not yet started |
| In Progress | Being worked on |
| Resolved | Fixed and verified |

---

## ORIGINAL GAPS (GAP-0001 to GAP-0004)

## GAP-0001: Project Memory did not exist as a first-class repository area

Status: In Progress

MAEF and Vision require Project Memory as a source of truth for Engineer. The repository previously had scattered audit notes, reports, and scratch files, but no canonical Project Memory location.

Resolution started:

- Added `docs/project-memory/PROJECT-MEMORY.md`
- Added ADR and task structure

## GAP-0002: MametLite is not fully isolated from full Assistant memory behavior

Status: In Progress

MametLite is defined as fast and read-oriented. Existing notes indicate it may share `agent-process` with full Mamet behavior and may risk memory retrieval/write coupling unless explicit source boundaries are enforced.

Required next step:

- Continue verifying the explicit request source boundary `appSource: "mametlite"`.
- Ensure MametLite does not write User Memory unless explicitly allowed.
- Verify RAG remains read-oriented for MametLite.

Progress:

- `mametlite/src/lib/callAgentSimple.js` now sends `appSource: "mametlite"`.
- `agent-process` policy now disables User Memory read/write for MametLite by default.

## GAP-0003: `agent-process/index.ts` contains syntactically invalid context code

Status: Resolved

The current file contains invalid TypeScript-like identifiers in type definitions and object literals, including `ctx.auth.userId` as a property name and `ctx` usage before declaration.

Progress:

- Invalid dotted shorthand context fields were replaced with valid explicit properties.
- `ctx` is now created before capability filtering.
- `tsc` parse check no longer reports syntax errors in `agent-process/index.ts`; remaining errors are Deno/remote import limitations and existing type issues in related modules.

## GAP-0004: Build pipeline fails on Windows path handling

Status: Resolved

Both `frontend` and `mametlite` production builds fail because Vite/Rollup receives absolute Windows paths for emitted `index.html`.

Resolution:

- The failure was caused by running through PowerShell `npm.ps1`/path handling.
- Running builds through `cmd` with `npm.cmd run build` succeeds for both `frontend` and `mametlite`.

---

## NEW GAPS (from Constitution Review 2026-06-29)

---

## GAP-NEW-001: Dua MAEF Aktif Tanpa Status Deprecated

Status: **Resolved** ✅ (TASK-NEW-001, 2026-06-29)

**Severity:** Critical
**Lokasi:** `docs/governance/MAEF.md` vs `docs/project-memory/MAEF V2.md`
**Dampak:** Single Source of Truth rusak. Seluruh sistem tidak tahu konstitusi mana yang berlaku.
**Resolusi:** `docs/governance/MAEF.md` ditandai DEPRECATED dengan pointer ke MAEF v2.

---

## GAP-NEW-002: Dua Vision Constitution Aktif Tanpa Hierarki Jelas

Status: **Resolved** ✅ (TASK-NEW-001, 2026-06-29)

**Severity:** Critical
**Lokasi:** `docs/governance/VISION.md` vs `docs/project-memory/MAMET AI VISION CONSTITUTION V2.md`
**Dampak:** Hirarki dokumen ambigu.
**Resolusi:** `docs/governance/VISION.md` ditandai DEPRECATED dengan pointer ke Vision Constitution v2.

---

## GAP-NEW-003: `index.ts` Monolith 2301 Baris

Status: **Resolved** ✅ (Wave 5-4 / ADR-0009)

**Severity:** Critical
**Lokasi:** `supabase/functions/agent-process/index.ts`
**Dampak:** Melanggar MAEF Architecture First. Tidak bisa diverifikasi secara incremental.
**Resolusi:** Seluruh komponen telah diekstraksi ke dalam hirarki `lib/request`, `lib/rag`, `lib/orchestration`, dll. File `index.ts` kini hanya berukuran 48 baris dan murni bertindak sebagai HTTP entrypoint/router.

---

## GAP-NEW-004: VerificationEngine Bukan Hard Gate Nyata

Status: **Resolved** ✅ (Wave 5-4)

**Severity:** Critical
**Lokasi:** `supabase/functions/agent-process/lib/verification_engine.ts`
**Dampak:** Vision mensyaratkan Verification Engine sebagai Hard Gate. Saat ini hanya cek struktural, tidak cek konten jawaban.
**Resolusi:** Telah ditambahkan Content-based checks ke dalam `VerificationEngine`, yaitu `CHECK_007_FORBIDDEN_PHRASES` (Hallucination detector) dan `CHECK_008_APOLOGETIC_REFUSAL` (Evasion detector). VerificationEngine kini beroperasi sebagai Hard Gate (gagal jika berhalusinasi).

---

## GAP-NEW-005: Project Memory Hybrid (File + DB) Tanpa Unified Interface

Status: **Resolved** ✅ (TASK-NEW-011, 2026-06-29 — Wave 3)

**Severity:** Major
**Lokasi:** `docs/project-memory/PROJECT-MEMORY.md` vs database `project_memory_entries`
**Dampak:** Engineer tidak tahu mana source of truth. Lessons Learned bisa hilang.
**Rencana:** Wave 3 — Definisikan aturan unified Project Memory.

---

## GAP-NEW-006: Architecture Gap Register Stale

Status: **Resolved** ✅ (TASK-NEW-003, 2026-06-29)

**Severity:** Major
**Lokasi:** `docs/architecture/ARCHITECTURE-GAPS.md`
**Dampak:** Gap aktual lebih banyak dari yang tercatat. Tidak ada visibility.
**Resolusi:** File ini diperbarui dengan semua 18 gap dari Constitution Review.

---

## GAP-NEW-007: 4 dari 9 Engineering Metrics Tidak Dapat Dihitung

Status: **Resolved** ✅ (Wave 2)

**Severity:** Major
**Lokasi:** ADR-0007 + DB schema
**Dampak:** Tidak ada cara mengukur apakah Engineer semakin baik — melanggar Vision §ENGINEERING METRICS.
**Resolusi:** Telah dibuat skema migrasi `GAP-NEW-007_schema_migration.sql` yang menambahkan `patch_accepted`, `review_confirmed`, dan `bug_category` ke dalam database untuk mendukung 4 metrik yang tertunda. *Dashboard SQL* gabungan 9 metrik telah dibuat di `scratch/GAP-NEW-007_engineering_metrics_dashboard.sql` sebagai artefak engineering yang tervalidasi.

---

## GAP-NEW-008: `confidence_score` Tidak Disimpan ke `verification_runs`

Status: **Resolved** ✅ (Wave 2 - RFC-013)

**Severity:** Major
**Lokasi:** DB schema — tabel `verification_audit_logs`
**Dampak:** Average Confidence metric tidak dapat dihitung.
**Resolusi:** Berdasarkan RFC-013, kolom `confidence_score SMALLINT` telah ditambahkan ke skema DB. File `verification_service.ts` telah diintegrasikan untuk mengekstrak dan menyimpan skor *Evidence Confidence* secara persisten pada tahap *post-execution guarantee*.

---

## GAP-NEW-009: Self Engineering Lifecycle Tidak Ada Implementasinya

Status: **APPROVED_FOR_DESIGN** (Implementasi Ditangguhkan)

**Severity:** Major
**Lokasi:** Vision §SELF ENGINEERING LIFECYCLE
**Dampak:** Tidak ada state machine. Tidak ada cara mengetahui posisi Engineer dalam lifecycle.
**Rencana:** Masuk roadmap Phase lanjutan.

---

## GAP-NEW-010: Universal Evidence Contract dan Context Fusion Adalah Dua Jalur Paralel

Status: **Resolved** ✅ (Wave 5-3 / ADR-0008)

**Severity:** Major
**Lokasi:** `lib/verification/universal_contract.ts` & `lib/rag/context_pipeline.ts`
**Dampak:** Bisa konflik. Melanggar prinsip deterministic engineering.
**Resolusi:** Berkas lama `universal_evidence_contract.ts` dan `context_fusion.ts` telah dihapus dan disatukan ke dalam arsitektur tunggal yang direpresentasikan oleh `universal_contract.ts` (penyusun prompt) dan `context_pipeline.ts` (engine pencarian). Single Source of Truth telah tercapai.

---

## GAP-NEW-011: Two-Brain Model Hanya untuk ENGINEER Mode

Status: Open

**Severity:** Minor
**Lokasi:** `supabase/functions/agent-process/index.ts` L1395
**Dampak:** Assistant tidak memiliki static knowledge context terstruktur.
**Rencana:** Masuk roadmap Phase lanjutan.

---

## GAP-NEW-012: JOURNEY.md Tidak Diupdate Konsisten

Status: **Resolved** ✅ (TASK-NEW-004, 2026-06-29)

**Severity:** Minor
**Lokasi:** `docs/project-memory/JOURNEY.md`
**Dampak:** Lessons Learned tidak terakumulasi. Knowledge tidak bertumbuh.
**Resolusi:** Entry baru ditambahkan untuk semua milestone besar yang belum terdokumentasi.

---

## GAP-NEW-013: Scratch Files di Root Repo Tanpa Status

Status: **Resolved** ✅ (TASK-NEW-009, 2026-06-29)

**Severity:** Minor
**Lokasi:** `scratch/` directory
**Dampak:** Melanggar struktur repository MAEF. Ambigu apakah ini production code.
**Resolusi:** README ditambahkan di folder scratch dengan keterangan status.

---

## GAP-NEW-014: `docs/governance/` Tidak Dirujuk oleh Master Architecture Index

Status: **Resolved** ✅ (TASK-NEW-002, 2026-06-29)

**Severity:** Minor
**Lokasi:** `docs/architecture/MASTER-ARCHITECTURE-INDEX.md`
**Dampak:** Governance folder tidak terintegrasi dalam hirarki dokumen.
**Resolusi:** MASTER-ARCHITECTURE-INDEX.md diperbarui dengan hirarki dokumen lengkap dan tabel konstitusi.

---

## GAP-NEW-015: Circuit Breaker $0.50/hari Masih Hardcoded

Status: Open

**Severity:** Informational
**Lokasi:** `supabase/functions/agent-process/index.ts` L419
**Dampak:** Harus bisa dikonfigurasi per user atau per mode.
**Rencana:** Masuk backlog.

---

## GAP-NEW-016: MametLite ragTopK=10 Lebih Tinggi dari AI Mode ragTopK=5

Status: Open

**Severity:** Informational
**Lokasi:** `supabase/functions/agent-process/index.ts` L309
**Dampak:** Counterintuitive. Lite seharusnya lebih ringan. Perlu verifikasi apakah ini disengaja.
**Rencana:** Masuk backlog — perlu verifikasi dengan owner apakah disengaja.

---

## GAP-NEW-017: MAEF Tidak Menyebut DeepSeek/Qwen Tapi Sudah Direferensi di Vision

Status: Open

**Severity:** Informational
**Lokasi:** Vision Constitution v2 §ARSITEKTUR
**Dampak:** Perlu konsistensi daftar LLM yang didukung.
**Rencana:** Masuk backlog.

---

## GAP-NEW-018: `docs/blueprints/` dan `docs/monetisasi/` Tidak Direferensi dari Mana Pun

Status: Open

**Severity:** Informational
**Lokasi:** `docs/` root
**Dampak:** Perlu audit isi dan integrasi ke hirarki dokumen.
**Rencana:** Masuk backlog.

---

## GAP-NEW-009: Self Engineering Lifecycle Belum Memiliki Implementasi Nyata

Status: **APPROVED_FOR_DESIGN** (Menunggu Kematangan RFC-015 & Kesiapan Arsitektur RFC-016)

**Severity:** Major
**Lokasi:** Orchestrator (`core_engine.ts`, `engineering_lifecycle.ts`)
**Dampak:** Agen beroperasi tanpa mematuhi tahapan Engineering System (Constitution 07), berpotensi melanggar Owner Sovereignty melalui eksekusi tool di luar fase.
**Resolusi (Sementara):** Telah diimplementasikan `EngineeringLifecycleManager` yang menegakkan state machine deterministik, explicit intent routing (`ENGINEER:PROPOSAL`, dll), dan Tool Filter Layer yang memastikan eksekusi alat hanya terjadi jika diizinkan oleh fase saat ini. 

---

## GAP-NEW-019: Tool Dispatcher & Hard Gate Implementation Belum Tersentralisasi

Status: Open

**Severity:** Major
**Lokasi:** `core_engine.ts`, `capability_adapter.ts` (Atau Desktop Bridge)
**Dampak:** Proteksi eksekusi alat (Execution Guard) pada RFC-014 dapat di-bypass jika LLM menghalusinasi output JSON atau jika desktop frontend mengeksekusi tool secara mandiri tanpa validasi backend.
**Rencana:** Telah diimplementasikan RFC-015 Phase 1-3 (*Shadow Mode*). Namun transisi final (*Hard Enforcement*) untuk mengunci kedaulatan Backend (*Backend Authoritative Execution Architecture*) akan ditangani melalui **RFC-016** dengan konsep *Signed Execution Token* (SET). Status *Open* dipertahankan sampai RFC-016 terimplementasi dan *Zero Rogue Edits* dijamin.

