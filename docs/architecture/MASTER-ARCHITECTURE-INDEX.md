# Master Architecture Index

Version: 2.0
Status: Active
Authority: Dibawah MAEF v2 dan Vision Constitution v2, di atas implementasi.
Last Updated: 2026-06-29 (Constitution Review — Constitution v2 integration)

---

## Konstitusi Tertinggi

> [!IMPORTANT]
> **Dua dokumen berikut adalah Source of Truth tertinggi di atas semua dokumen lain.**
> Segala konflik antara dokumen ini dengan implementasi, kode, atau dokumen lain harus diselesaikan mengacu ke dokumen ini.

| Dokumen | Versi | Lokasi | Keterangan |
|---|---|---|---|
| MAMET AI ENGINEERING FRAMEWORK (MAEF) | **v2.0** | `docs/project-memory/MAEF V2.md` | ✅ AKTIF — Konstitusi engineering tertinggi |
| MAMET AI VISION CONSTITUTION | **v2.0** | `docs/project-memory/MAMET AI VISION CONSTITUTION V2.md` | ✅ AKTIF — Konstitusi visi dan capability |
| MAEF v1.0 | 1.0 | `docs/governance/MAEF.md` | ⛔ DEPRECATED — Lihat MAEF v2 |
| Vision v1.0 | 1.0 Draft | `docs/governance/VISION.md` | ⛔ DEPRECATED — Lihat Vision Constitution v2 |

---

## Hirarki Otoritas Dokumen (MAEF v2 §5)

| Urutan | Dokumen | Lokasi |
|---|---|---|
| 1 | MAEF v2 | `docs/project-memory/MAEF V2.md` |
| 2 | Vision Constitution v2 | `docs/project-memory/MAMET AI VISION CONSTITUTION V2.md` |
| 3 | Master Architecture Index (dokumen ini) | `docs/architecture/MASTER-ARCHITECTURE-INDEX.md` |
| 4 | Architecture Decision Records (ADR) | `docs/adr/` |
| 5 | Technical Specification / Blueprints | `docs/blueprints/` |
| 6 | Engineering Tasks | `docs/tasks/` |
| 7 | Repository (implementasi) | `supabase/`, `frontend/`, `mametlite/` |
| 8 | Runtime System | Supabase Edge Functions (deployed) |

---

## Purpose

This index connects Mamet AI's vision to the repository. It is the first place to check before changing architecture or implementation.

## System Identity

Mamet AI is a personal AI Operating System. LLM providers are replaceable reasoning engines, not the system identity.

## Capability Layers

| Capability | Role | Current Repository Area | Notes |
| --- | --- | --- | --- |
| Assistant | Daily assistant using memory and knowledge | `frontend/`, `supabase/functions/agent-process/` | Full product surface with dashboards and desktop mode |
| MametLite | Fast, read-oriented mode | `mametlite/`, `supabase/functions/rag-process/`, `supabase/functions/agent-process/` | Must remain lightweight and avoid unwanted memory writes |
| Engineer | Internal engineering mode | `docs/project-memory/`, `docs/tasks/`, `docs/adr/`, source repo | Runtime-capable via `appSource: "engineer"` policy in `agent-process` |

## Shared Services

| Service | Role | Current Repository Area |
| --- | --- | --- |
| User Memory | Personal preferences and habits | `user_memories`, memory plugins |
| Knowledge RAG | External documents and references | `documents`, `document_chunks`, `rag-process` |
| Project Memory | Engineering truth and lessons | `project_memory_entries` (DB) + `docs/project-memory/` (snapshot) |
| AI Orchestrator | Tool routing and provider calls | `supabase/functions/agent-process/` |
| Observability | Logs, billing, health | dashboard components, `agent_logs`, `api_usage`, health functions |

## Current Runtime Surfaces

- `frontend/`: full Mamet AI web and Electron shell.
- `mametlite/`: lightweight RAG/research client.
- `backend/`: legacy Express backend, retained for compatibility but not the modern primary runtime.
- `supabase/functions/agent-process/`: main AI orchestration backend.
- `supabase/functions/rag-process/`: document ingestion and embedding pipeline.

## Architecture Rule

Any implementation that conflicts with MAEF v2, Vision Constitution v2, or this index must be recorded in `docs/architecture/ARCHITECTURE-GAPS.md` before being changed.

## Active Architecture Gaps

See: `docs/architecture/ARCHITECTURE-GAPS.md`

## Constitution Review

See: `docs/architecture/CONSTITUTION-REVIEW-REPORT-2026-06-29.md`

