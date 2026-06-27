# Master Architecture Index

Status: Baseline
Authority: Below MAEF and Vision, above implementation.

## Purpose

This index connects Mamet AI's vision to the repository. It is the first place to check before changing architecture or implementation.

## System Identity

Mamet AI is a personal AI Operating System. LLM providers are replaceable reasoning engines, not the system identity.

## Capability Layers

| Capability | Role | Current Repository Area | Notes |
| --- | --- | --- | --- |
| Assistant | Daily assistant using memory and knowledge | `frontend/`, `supabase/functions/agent-process/` | Full product surface with dashboards and desktop mode |
| MametLite | Fast, read-oriented mode | `mametlite/`, `supabase/functions/rag-process/`, `supabase/functions/agent-process/` | Must remain lightweight and avoid unwanted memory writes |
| Engineer | Internal engineering mode | `docs/project-memory/`, `docs/tasks/`, `docs/adr/`, source repo | Not yet a separate runtime capability |

## Shared Services

| Service | Role | Current Repository Area |
| --- | --- | --- |
| User Memory | Personal preferences and habits | `user_memories`, memory plugins |
| Knowledge RAG | External documents and references | `documents`, `document_chunks`, `rag-process` |
| Project Memory | Engineering truth and lessons | `docs/project-memory/` |
| AI Orchestrator | Tool routing and provider calls | `supabase/functions/agent-process/` |
| Observability | Logs, billing, health | dashboard components, `agent_logs`, `api_usage`, health functions |

## Current Runtime Surfaces

- `frontend/`: full Mamet AI web and Electron shell.
- `mametlite/`: lightweight RAG/research client.
- `backend/`: legacy Express backend, retained for compatibility but not the modern primary runtime.
- `supabase/functions/agent-process/`: main AI orchestration backend.
- `supabase/functions/rag-process/`: document ingestion and embedding pipeline.

## Architecture Rule

Any implementation that conflicts with MAEF, Vision, or this index must be recorded in `docs/architecture/ARCHITECTURE-GAPS.md` before being changed.

