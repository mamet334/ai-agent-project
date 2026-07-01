/**
 * Phase 5: Window Manager Foundation
 * Level 5 in Mamet OS Architecture.
 * Responsible for managing the UI layout tree (Docking, Floating, Split Screen)
 * independently of the Workspace logic.
 */
export class WindowManager {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus'); // Use global EventBus from ServiceManager
    // The window tree state (Foundation for future GoldenLayout-like engine)
    this.state = {
      floatingWindows: new Map(),
      splitPanes: new Map(),
      activeFocus: null
    };
  }

  // --- Foundation APIs ---

  /**
   * Spawns a globally floating window (unbound from specific workspace layout)
   */
  spawnFloatingWindow(config) {
    const windowId = `win_${Date.now()}`;
    const windowDef = {
      id: windowId,
      title: config.title || 'Window',
      component: config.component,
      position: config.position || { x: 100, y: 100 },
      size: config.size || { width: 400, height: 300 },
      isMinimized: false,
      isMaximized: false,
      zIndex: this.state.floatingWindows.size + 100
    };

    this.state.floatingWindows.set(windowId, windowDef);
    this._notify();
    console.log(`[WindowManager] Spawned floating window: ${windowId}`);
    return windowId;
  }

  closeFloatingWindow(windowId) {
    if (this.state.floatingWindows.has(windowId)) {
      this.state.floatingWindows.delete(windowId);
      this._notify();
    }
  }

  /**
   * Foundation for split-screen layouts
   */
  createSplitPane(direction, children) {
    const paneId = `split_${Date.now()}`;
    this.state.splitPanes.set(paneId, { direction, children });
    // Future implementation: integrate with layout engine
    return paneId;
  }

  // --- Observability ---
  subscribe(listener) {
    return this.eventBus.on('WINDOW_STATE_CHANGED', listener);
  }

  _notify() {
    this.eventBus.emit('WINDOW_STATE_CHANGED', {
      floatingWindows: Array.from(this.state.floatingWindows.values()),
      splitPanes: Array.from(this.state.splitPanes.values())
    });
  }
}
