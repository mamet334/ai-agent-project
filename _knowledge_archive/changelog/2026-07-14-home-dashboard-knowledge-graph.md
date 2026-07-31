# Mamet Brain View - Home Dashboard Implementation
**Date:** 2026-07-14

## Overview
The Home screen has been completely overhauled to align with the **Mamet Knowledge Graph Dashboard Constitution (`23_HOME_DASHBOARD_SPEC.md`)**. Previously displaying a generic "Good evening" greeting with standard dashboard widgets, the Home route (`app:home`) now serves as a real-time, interactive visualizer of Mamet's artificial brain.

## Architecture & Implementation Scope
- **Strict Isolation:** This implementation was built strictly as a visual plugin for `HomeDashboard.jsx`. It does not alter or interfere with the global UI layout, `AppShell`, `ConversationEngine`, Sidebar Navigation, or any other working workspace mode.
- **Library Selection:** Integrated `react-force-graph-2d` for high-performance Canvas-based rendering, capable of handling large datasets without freezing the DOM.
- **Live Database Connection:** The graph is fed by actual live data retrieved from Supabase, completely eschewing dummy data.

## Node Hierarchy & Constellation Mapping
The graph is designed to resemble a neural network or a digital brain (similar to Obsidian Graph / Hermes):

1. **Central Node (White):** 
   - `SUPABASE` acts as the absolute center of gravity.
2. **First-Layer Virtual Nodes (Slate):**
   - Branches out into `USER MEMORY`, `RAG KNOWLEDGE`, `CONVERSATION`, and `WORKSPACE`.
3. **Second-Layer Real Data Nodes:**
   - **Green Nodes:** Represents `user_memories`.
   - **Purple Nodes:** Represents `documents` (RAG).
   - **Yellow Nodes:** Represents `chats` (Conversations).
   
## Visual Features
- **Dynamic Physics:** Nodes dynamically repel and settle using D3-force simulations, providing an organic, "living" feel.
- **Directional Particles:** Links feature moving particles to represent data flow between the central core and the distributed knowledge nodes.
- **Realtime Metrics Panel:** A dedicated side panel displays live counts of Total Memories, Documents, and Conversations, alongside Database Core status and Health Score.

## Success Criteria Achieved
When the user clicks the "Home" button, the emotional and visual goal of "I am looking at Mamet's brain" is fulfilled. Transitioning to Lite, Assistant, or Engineer modes retains their production-stable layouts without any bleed-over effects.
