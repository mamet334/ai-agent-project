# ADR-0001: Adopt MAEF As Highest Engineering Authority

Status: Accepted
Date: 2026-06-27

## Context

Mamet AI is evolving from a chatbot-style application into a personal AI Operating System. The repository contains multiple runtime surfaces, memory systems, RAG, dashboards, scripts, and experimental modules. Without a governance layer, implementation can drift away from the owner's vision.

## Decision

MAEF is adopted as the highest engineering authority for the repository.

The repository must follow this authority order:

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

## Consequences

- Architecture gaps must be documented before broad implementation changes.
- Project Memory becomes a first-class engineering artifact.
- Code changes should be tied to tasks and verification.
- Mamet Engineer behavior must begin from Project Memory before repository edits.

