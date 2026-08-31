# Mamet Knowledge Observatory V2.0 - Home Dashboard Upgrade
**Date:** 2026-07-14

## Overview
The Home Dashboard (Mamet Brain View) has been upgraded from a passive "Database Graph Viewer" into a fully functional "Knowledge Observatory V2.0". This update transforms the visualizer into an advanced observability and debugging tool for tracking system memory, RAG chunks, and conversational data integrity.

## Strict Architectural Isolation
- **Scope Compliance:** All modifications were strictly confined to `HomeDashboard.jsx`. 
- **Protected Areas Intact:** No external dependencies, routing, `AppShell`, `ConversationEngine`, or sidebar components were altered, ensuring 100% stability across all core system environments (Lite, Assistant, Engineer, etc.).

## Feature Upgrades

### 1. Node Size by Importance
Node sizing is no longer uniform; it is now dynamically mapped to real database usage metrics.
- **Memory Nodes:** Node radius scales up proportionally based on `memory_hits`, immediately highlighting highly accessed or critical memories.
- **RAG Documents:** Node radius scales based on the underlying `document_chunks` count, making large corpus materials stand out visually from minor note entries.

### 2. Node Detail Panel (Node Inspector)
Introduced a responsive "Node Inspector" on the right sidebar. Clicking any non-category node transitions the Realtime Metrics panel into an intricate data viewer.
- **Real Metadata Fetching:** Displays the actual label, timestamp (`created_at`), usage count, origin source (`workspace_type`), and active relational connections.
- **Raw Metadata Rendering:** Gracefully unrolls and displays underlying JSON `metadata` without injecting dummy placeholder values.

### 3. Orphan Detector (Health Matrix)
Integrated a relational health coloring system to act as a diagnostic aid for the AI's cognitive state.
- **🔴 Red (Orphan/Problem):** Nodes possessing 0 relational links (e.g., a memory without causal links, or a document missing vector chunks). Alerts the engineer to disconnected data.
- **🟡 Yellow (Low Relations):** Nodes with 1 to 2 relations, signifying weak conceptual ties.
- **🟢 Green (Healthy):** Nodes with robust, multiple cross-relations (>2).

## Conclusion
The dashboard now serves its constitutional purpose. Rather than displaying arbitrary analytics, it provides absolute visibility into the growth, health, and relational complexity of the Mamet Ecosystem directly from Supabase.
