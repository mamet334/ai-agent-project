# 2026-07-14 UI Migration: Obsidian Deep & Mamet UI Constitution

## Overview
This changelog documents the complete visual migration of the Mamet OS Ecosystem to the "Obsidian Deep" design system. The migration strictly adheres to the **MAMET UI CONSTITUTION**, which designates the static HTML files within `stitch_mamet_os_login_portal` as the absolute *Visual Source of Truth* (Supreme UI Authority). 

While maintaining the robust internal React architecture (Contexts, ServiceManager, ApplicationManager), the visual and DOM outputs have been restructured to achieve 100% visual parity with the canonical Stitch design.

## Core Modifications

### 1. Global Shell Restructuring
- **`OSDesktopShell.jsx`**: 
  - **Removed `ActivityBar`** from the render tree. In the canonical Stitch design, there is no separate micro-sidebar for activities. Navigation is handled centrally within the main sidebar.
  - Adjusted root classes to use `bg-background` and `text-on-surface` instead of the legacy `slate-950` theme.
- **`AppShell.jsx`**: 
  - Restyled the `Header` to mirror the Stitch Top App Bar (`backdrop-blur-xl`, `bg-background/80`, `px-16`, `h-16`).
  - Added the exact layout structure for the "Models", "Knowledge", and "Plugins" navigation links.
  - Replaced the inner content wrapper background from `bg-[#0a0a0f]` to `bg-surface-container-lowest`.

### 2. Sidebar Alignment
- **`Sidebar.jsx`**: 
  - Overhauled to exactly replicate the `<aside>` behavior in Stitch.
  - Added the "Deep Dark Workspace" brand header.
  - Integrated the glowing "New Chat" button directly inside the navigation flow.
  - Mapped standard navigation paths (Recent, Settings, Help) using the new active UI state (a left-aligned `border-primary` highlight with `bg-secondary-container`).
  - Moved the user profile and session indicator ("Online" pulse) to the bottom footer.

### 3. Module Interface Conversions
- **`Settings.jsx`**: 
  - Refactored the entire grid to match `dashboard_settings_mamet_os_ecosystem/code.html`.
  - Converted the AI Model Management and API Key sections into `glass-panel` components with `rim-light` borders.
  - Ensured all Lucide icons were replaced with `material-symbols-outlined`.
- **`HomeDashboard.jsx`**:
  - Removed old Tailwind grid styles in favor of the new tokenized CSS variables (e.g., `bg-surface-container-low`, `border-outline-variant`).
  - Implemented the minimalist Glassmorphism design for data widgets.
- **`ConversationEngine.jsx` (Lite, Assistant, Engineer)**:
  - Completely redesigned the chat interface.
  - User and AI message bubbles now use `glass-panel` styling with proper contrast text (`text-on-surface`).
  - Upgraded the prompt input area to match the "Obsidian Chat" floating textarea, including the action buttons (attach file, images, web) and the glowing submission arrow.

## Architectural Notes
Per the UI Constitution (*Visual Parity > Interaction Parity > Maintainability > DOM Similarity*):
- The `DndContext` and React Router mechanisms were **not destroyed**. They remain active in the background, wrapping the required modules without generating extra visible borders or violating the canonical DOM dimensions.
- The use of `lucide-react` is officially being deprecated across the ecosystem in favor of `material-symbols-outlined` with `font-variation-settings`.

## Status
- **COMPLETED**: Visual Parity Audit.
- **VERIFIED**: No visual deviations exceeding the ±2px tolerance from the Stitch design.
