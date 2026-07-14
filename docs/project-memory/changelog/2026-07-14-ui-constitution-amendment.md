# 2026-07-14 UI Constitution Amendment: AI Workspace Transformation

## Overview
This changelog documents the radical shift in the Mamet OS visual philosophy based on the **Mamet UI Constitution Amendment (Version 1.0)**. The system has been fundamentally transformed from an "Enterprise Admin Dashboard" into a pure "AI Workspace" modeled after Claude Desktop, ChatGPT, and Cursor.

## Core Philosophical Shifts
- **Primary Design Principle**: "Conversation Space is the product. Everything else is secondary."
- **Right Panel Rule**: "Context On Demand." The right side panel (telemetry, memory, logs, tools) is now forbidden as a default UI state and will remain completely closed (0px width) until explicitly opened.
- **Forbidden Elements**: KPI cards, statistics dashboards, and permanent telemetry have been entirely eliminated. 

## Technical Implementations

### 1. Minimalist Icon-Only Sidebar
- **`Sidebar.jsx`**: 
  - Shrunk from `w-64` (256px) down to **`w-16` (64px)**.
  - Removed all text labels, brand headers, and plan descriptions.
  - Navigation now relies entirely on centered Material Icons with standard `title` attributes for hover tooltips.
  - The profile section is reduced to a single compact avatar with a pulsing presence indicator.

### 2. Expanded Conversation Area
- **`ApplicationContainer.jsx`**: 
  - Adjusted the layout offset from `ml-64` to `ml-16` to match the new sidebar width. This reclaims a massive amount of horizontal screen real estate for the conversation engine.

### 3. Dynamic Grid Collapsing
- **`AppShell.jsx`**: 
  - Refactored the `gridTemplateColumns` calculation.
  - If `leftWidgets` or `rightWidgets` are empty, they are mathematically forced to `0px` rather than occupying a default `300px` or `350px`. 
  - The main workspace (`1fr`) now correctly claims 100% of the available horizontal space by default.

### 4. Destruction of the KPI Dashboard
- **`HomeDashboard.jsx`**: 
  - Completely erased the previous ERP-style dashboard structure containing system metrics and monitoring grids.
  - Converted the Home route into a clean, minimalist "Welcome Screen" featuring a "Good evening" greeting and two prominent action cards: "Start a Conversation" and "Engineering Workspace".

## Status
- **COMPLETED**: Layout restructuring and widget demolition.
- **VERIFIED**: Sidebar width, right panel collapsing, and dashboard removal meet all Amendment conditions.

## Urgent Bug Fixes (Post-Inspection)

### 1. AppShell Grid Overflow Bug
- **Issue**: Long chat messages expanded infinitely without triggering the scrollbar, pushing the entire workspace layout upward and out of bounds.
- **Fix**: Added `min-h-0` to the main flex container inside the CSS Grid (`AppShell.jsx`), strictly constraining height and forcing `overflow-y-auto` to function.

### 2. ChatHistory Sidebar Violation
- **Issue**: `ChatHistory.jsx` occupied a static 256px (`w-64`) on the left, violating the "Maximize Conversation Space" rule, and used outdated `bg-slate-950` colors.
- **Fix**: 
  - Refactored color tokens to Obsidian Deep (`bg-surface-container-low`, `border-outline-variant`).
  - Implemented a collapsible toggle state (`isSidebarOpen`), defaulting to **CLOSED (0px)**.

### 3. WorkspaceManager Layout Cache Buster
- **Issue**: Persistent layout caching stored in `localStorage` caused deprecated widgets (like `WorkspaceNavWidget` and `Verification Log`) to still render despite removal from `workspace.json`.
- **Fix**: Incremented the persistence namespace prefix from `mamet_v2_` to `mamet_v3_` in `WorkspaceManager.js`. This cache-bust forces all clients to drop legacy layout states and adopt the new, clean Constitutional defaults upon reload.

### 4. Destruction of the Global Header
- **Issue**: The static top bar (`Obsidian Workspace | Models | Knowledge...`) was consuming 64px of vertical space globally and causing z-index visual overlaps with chat content.
- **Fix**: Deleted the entire `<header>` block from `AppShell.jsx`. The application now renders completely edge-to-edge vertically, identical to Claude Desktop.

### 5. Resolution of the Vertical Stacking Grid Bug (Engineer Workspace)
- **Issue**: When an AI execution finished, `widget:maef-monitor` was automatically opened in the `right_workbench`. However, `workspace.json` had a hardcoded `"grid_columns": "1fr"` rule for `ws-engineer`. This broke the `AppShell` 3-column CSS grid, forcing the Right Workbench to render as a full-width block *underneath* the chat interface, consuming half the screen.
- **Fix**: Removed the `"grid_columns": "1fr"` override from `workspace.json` and bumped the `WorkspaceManager` cache namespace to `v4_`. The Right Workbench will now correctly render on the far right as a 320px column, keeping the Conversation Engine's vertical space undisturbed.
