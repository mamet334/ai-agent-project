# MAMET AI ENGINEERING FRAMEWORK (MAEF)

> [!CAUTION]
> **STATUS: DEPRECATED — Dokumen ini TIDAK LAGI berlaku.**
>
> Dokumen ini adalah MAEF v1.0 dan telah digantikan oleh **MAEF v2.0**.
>
> **Source of Truth yang berlaku:**
> `docs/project-memory/MAEF V2.md`
>
> Jangan gunakan dokumen ini sebagai referensi arsitektur. Semua keputusan harus mengacu ke MAEF v2.
>
> Deprecated on: 2026-06-29 | Superseded by: MAEF v2.0

---

Version: 1.0.0
Status: **DEPRECATED** (Superseded by MAEF v2.0)
Type: Constitution (Historical Reference Only)
Owner: Mamet AI Project

## Purpose

MAEF is the highest operating rule for Mamet AI. It governs architecture, development workflow, data ownership, AI behavior, repository structure, and deployment decisions.

No system, module, automation, or AI agent is above MAEF.

## Core Vision

Mamet AI is a personal AI Operating System that is:

- fully controlled by the owner
- independent from any single vendor
- independent from any single AI model
- powered by internal knowledge and memory
- able to evolve through a structured engineering process

## Scope

MAEF applies to:

- Mamet Assistant
- MametLite
- Mamet Engineer
- Knowledge System
- User Memory System
- Project Memory System
- Shared Services Layer
- AI Orchestrator
- API Layer
- Database Layer
- Repository
- Deployment System

## Core Principles

### Full Custom Control

All system control belongs to the project owner. AI may assist analysis and limited execution, but it does not own decisions.

### Knowledge First

Knowledge is the primary asset. Source code is an implementation of knowledge, not the source of truth.

### Documentation First

No implementation should happen without documentation.

### Architecture First

Architecture is above code. The repository follows architecture, not the other way around.

### Evolution Principle

The system must be able to evolve without damaging its core structure.

## Single Source Of Truth

Authority order:

1. MAEF
2. Vision
3. Master Architecture Index
4. System Architecture
5. ADR
6. Technical Specification
7. Development Standard
8. Engineering Blueprint
9. Roadmap
10. Repository
11. Runtime System

When conflicts exist, the higher authority wins.

## Repository Principle

The repository is implementation. It is not the highest source of truth. It may change, and it must follow MAEF.

## Architecture Gap Principle

Any difference between MAEF, architecture, repository, and implementation is an Architecture Gap.

Rules:

- gaps must be reported
- gaps must be analyzed before implementation
- gaps must be linked to a task before code changes

## AI Governance

AI may:

- analyze systems
- audit code
- draft tasks
- draft documentation
- help debug

AI may not:

- change MAEF
- change project purpose
- change architecture without ADR
- change repository without a task
- make final system decisions

## Engineering Rules

Every change must have:

- a clear purpose
- documentation
- a task
- analysis
- testing

## Capability Model

### Assistant

- user interaction
- uses knowledge and user memory
- does not change the system

### MametLite

- fast mode
- read-oriented
- lightweight and efficient

### Mamet Engineer

- system analysis
- debugging
- refactoring
- implementation
- Project Memory management

## Shared Services

Shared Services include:

- Knowledge System
- User Memory
- Project Memory
- Authentication
- Logging
- Configuration

All capabilities access this layer through controlled boundaries.

## Project Memory

Project Memory stores:

- bug history
- root causes
- solutions
- lessons learned
- related ADRs
- breaking changes
- performance insights

## Engineering Flow

Vision -> Architecture -> ADR -> Technical Spec -> Task -> Implementation -> Testing -> Project Memory -> Release.

This flow must not be skipped for meaningful system changes.

