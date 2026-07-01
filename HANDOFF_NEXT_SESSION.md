# Handoff: Next Session (MAEF Execution Monitor & Dependency Map)

## Current Status
- We have successfully transitioned the AI Chat to **DIRECT mode** (`stream: false`) in `ConversationEngine.jsx` to allow the backend to fully process RAG, tools, and subagents before rendering.
- We created a dedicated widget **MAEF Execution Monitor (`MaefExecutionMonitorWidget.jsx`)** and registered it in `WidgetRegistry.js` as `widget:maef-monitor`.
- We added `EventBus` injection in `WorkspaceManager.js` (`openWidgetInWorkbench`) to pass `jsonData` (Execution Trace) to the new widget when a chat response arrives.

## Current Bug (PR / Homework)
The USER reports that the **MAEF Execution Monitor widget still hasn't appeared** in the right workbench when a chat message finishes processing.
### Suspected Root Causes for Next Debugging:
1. **Layout State Sync:** `workspaceManager.openWidgetInWorkbench` adds `widget:maef-monitor` to the `right_workbench` array, but perhaps the React state in `WorkbenchZone.jsx` isn't updating properly or there's a typo in the `allowed_workspaces` mismatching the current workspace.
2. **EventBus Timing:** Although we added a `widgetDataStore` in `WorkspaceManager`, the UI component `WidgetHost` might be failing to mount the widget due to a `Suspense` error or layout mismatch.
3. **Check Console Logs:** Next session must check the browser console for `[WorkspaceManager] Opening widget:maef-monitor in right workbench` to verify if the function is even being called.

## Next Session Tasks
1. **Debug MAEF Monitor UI:** Trace why `widget:maef-monitor` refuses to render in the `right_workbench` after `openLifecycleInspector` is called. Fix the layout state/EventBus delivery.
2. **Continue Dependency Map:** The USER requested to resume mapping out the `DEPENDENCY_MAP.md` after the UI bug is fixed. Refer to the existing `DEPENDENCY_MAP.md` (lines 37-59 were recently reviewed).
3. **Merge as PR:** Once the monitor is stable, finalize the code as a Pull Request/stable commit for MAEF v3.0.0 architecture.

**Note to Next Agent:**
Do NOT change the `stream: false` behavior. The USER explicitly wants the backend to finish processing before sending the JSON response. Your primary goal is to make sure the Execution Trace JSON displays correctly in the Right Workbench.
