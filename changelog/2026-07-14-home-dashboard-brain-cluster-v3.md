# Brain Cluster Visualization V3 - Home Dashboard Upgrade
**Date:** 2026-07-14

## Overview
The Knowledge Observatory (Home Dashboard) has undergone a major visual and structural transition into **Brain Cluster Visualization V3**. The dashboard now maps the Mamet OS Supabase environment as an organic, interconnected neural network, resembling an Obsidian/Hermes-style cognitive graph.

## Strict Architectural Compliance
- This upgrade maintained 100% strict isolation.
- `HomeDashboard.jsx` was the only file modified.
- No dummy data, no hardcoded relational scaffolding, and no backend schema modifications were used.

## Core V3 Features

### 1. Hierarchical Cluster Topography
The knowledge graph now organizes itself into distinct, gravity-bound semantic layers:
- **Core Node (Layer 0):** `SUPABASE CORE` explicitly acts as the universal center of gravity for all data.
- **Category Nodes (Layer 1):** Abstract domains (`USER MEMORY`, `RAG KNOWLEDGE`, `CONVERSATION`) orbit the Core.
- **Dynamic Subclusters (Layer 2):** Instead of direct attachment to categories, actual data nodes now autonomously group into context-specific semantic subclusters based solely on available live metadata (e.g., `workspace_type` for chats, `metadata.type` for memories, `file_type` for documents). 
- **Graceful Degradation:** If dynamic real-world metadata for a subcluster does not exist, the cluster is dynamically omitted rather than generating empty dummy nodes.

### 2. Neural Cross-Link Bridges (Relationship Visualization)
The engine now visualizes multidimensional data relationships across distant knowledge clusters.
- If a Memory object carries a metadata reference to a Conversation (`chat_id` / `source_id`), a neural bridge is drawn directly between the specific Chat node and the Memory node.
- If a Memory is derived from a specific Document (`document_id`), a direct relational link is plotted spanning the RAG cluster and the Memory cluster.

### 3. V2 Feature Retention
All existing analytical layers from V2 remain intact and operate harmoniously over the new cluster logic:
- **Node Size by Importance:** Actively resizes nodes via `memory_hits` and `document_chunks`.
- **Orphan Detector (Health Matrix):** Retains real-time Red/Yellow/Green chromatic diagnostics for disconnected knowledge shards.
- **Node Inspector:** Detail panel efficiently handles subclusters just as smoothly as atomic data nodes.

## Conclusion
Home Dashboard V3 successfully transcends standard analytics visualization, allowing the Owner to visually explore and debug the interconnected "thoughts", conversations, and reference documents making up Mamet's living brain.
