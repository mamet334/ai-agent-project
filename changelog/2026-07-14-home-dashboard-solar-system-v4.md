# Brain Cluster Visualization V4 - Solar System Architecture
**Date:** 2026-07-14

## Overview
The Home Dashboard (Knowledge Observatory) has been upgraded to a true **Solar-System Architecture**. This iteration strictly enforces a central gravity model to visually represent Supabase as the absolute heart of the Mamet Ecosystem. The visual topology shifts the UI from a generalized constellation to an orbiting planetary system of knowledge.

## Core Architectural Upgrades

### 1. The Sun: Fixed Supabase Core
- The `SUPABASE CORE` node is now physically locked to the center of the physics simulation (`fx: 0, fy: 0`).
- Rendered with maximum visual weight (`val: 50`), cementing its role as the immovable center of gravity.
- Successfully creates the emotional impact of looking at the unified "Brain of Mamet" where all intelligence originates.

### 2. The Planets: Primary Cluster Orbits
Eight mandatory primary clusters have been established to orbit the core permanently:
- `USER MEMORY`
- `RAG KNOWLEDGE`
- `CONVERSATION`
- `WORKSPACE`
- `AUTH`
- `STORAGE`
- `EDGE FUNCTIONS`
- `REALTIME`

These nodes orbit the sun symmetrically under standard repulsive/attractive D3 physics while serving as the gravity wells for real data.

### 3. The Satellites: Real Data Moons
- Individual memories, chat sessions, and documents function as satellites that orbit their respective planetary clusters (or dynamic subclusters).
- No dummy data or fake relations were inserted. Empty planets (like `STORAGE` and `AUTH`, for which table data isn't currently fetched) remain barren nodes peacefully orbiting the core, preserving the integrity of the visualization.

## Engineering Strictness
- **Strict Isolation Maintained:** Zero modifications occurred outside of `HomeDashboard.jsx`. `AppShell`, `Sidebar`, and all specialized work modes (Lite, Assistant, Engineer) remain 100% untouched.
- **Zero Feature Creep:** Existing V3 features (Node Inspector Panel, Orphan Detector/Health Coloring, Node Sizing) were preserved natively without introducing unnecessary analytics widgets.
- **Camera Automation:** Integrated `zoomToFit` triggered upon the stabilization of the physics engine (`onEngineStop`), ensuring that upon navigation to the Home screen, the user is immediately presented with the full breadth of the orbiting neural system.
