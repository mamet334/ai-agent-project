/**
 * WidgetRegistry - OS Level Registry for UI Modules
 * Plugin-First Architecture: Components register themselves here,
 * rather than the UI hardcoding their existence.
 */
import { lazyLoadWithRetry } from './lazyLoadWithRetry';

class WidgetRegistry {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.widgets = new Map();
  }

  /**
   * Registers a new widget into the ecosystem.
   * @param {Object} metadata 
   * @param {string} metadata.id - Unique identifier for the widget (e.g. 'widget:task-list')
   * @param {string} metadata.name - Human readable name
   * @param {string} metadata.icon - Lucide icon name (string representation)
   * @param {string} metadata.version - Widget version
   * @param {string[]} metadata.allowed_workspaces - Array of workspace types (e.g. 'ENGINEER', 'OWNER')
   * @param {Object} metadata.default_size - { width, height }
   * @param {string} metadata.default_workbench - 'left', 'right', 'bottom', 'floating'
   * @param {Function} metadata.component - React component (often lazy loaded)
   */
  register(metadata) {
    if (!metadata.id) {
      throw new Error("Widget registration failed: 'id' is required.");
    }
    if (this.widgets.has(metadata.id)) {
      console.warn(`WidgetRegistry: Overwriting existing widget [${metadata.id}]`);
    }
    
    this.widgets.set(metadata.id, {
      ...metadata,
      registeredAt: Date.now()
    });

    console.debug(`[WidgetRegistry] Registered widget: ${metadata.id}`);
  }

  /**
   * Unregisters a widget (rarely used, but good for lifecycle management)
   */
  unregister(id) {
    this.widgets.delete(id);
  }

  /**
   * Gets a specific widget definition by ID
   */
  getWidget(id) {
    return this.widgets.get(id) || null;
  }

  /**
   * Gets all widgets allowed in a specific workspace
   * @param {string} workspaceType 
   * @returns {Object[]}
   */
  getWidgetsForWorkspace(workspaceType) {
    const allowed = [];
    for (const [id, widget] of this.widgets.entries()) {
      if (widget.allowed_workspaces.includes(workspaceType) || widget.allowed_workspaces.includes('*')) {
        allowed.push(widget);
      }
    }
    return allowed;
  }
}

console.log("[LIFECYCLE] Widget registry ready");
export { WidgetRegistry };
