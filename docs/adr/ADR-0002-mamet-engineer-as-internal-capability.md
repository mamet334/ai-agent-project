# ADR-0002: Mamet Engineer As Internal Capability

Status: Accepted
Date: 2026-06-27

## Context

The Vision defines Engineer as the official workshop for Mamet AI. Engineer must understand source code, architecture, database, workflow, agents, deployment, testing, and bug history.

Without a clear boundary, Engineer could become just another generic coding assistant. That would violate the Vision and MAEF.

## Decision

Mamet Engineer is accepted as an internal capability of Mamet AI, not a separate product identity.

Engineer must operate from:

1. MAEF
2. Vision
3. Project Memory
4. Architecture
5. Task
6. Repository

Engineer must update Project Memory after meaningful engineering work.

## Consequences

- Engineer runtime work must have a policy boundary.
- Project Memory is required infrastructure, not optional documentation.
- Code changes should remain traceable to task, verification, and Project Memory.
- Future UI should expose Engineer state to the owner.

