# TODO - Activity Cluster Dashboard: Execution Trace Timeline UI

- [ ] Read current HomeDashboard.jsx and confirm where to inject timeline UI.
- [ ] Implement minimal Execution Trace Timeline rendering inside existing dashboard panel.
- [ ] Use `executionTrace.timeline` (already loaded by trace_id) and render events ascending by timestamp.
- [ ] Handle `executionTrace.loading`, `executionTrace.error`, and empty timeline.
- [ ] Display minimal fields per event: type/action, timestamp, status (if available), metadata summary (if available).
- [ ] Avoid schema/backend/pipeline changes (UI only, KISS & YAGNI, no large refactor).
- [ ] Build/test frontend.
- [ ] Commit with message: `feat: render execution trace timeline in activity cluster dashboard`.
- [ ] Push to branch: `blackboxai/activity-cluster`.

