/**
 * WorkspaceManager - OS Level Orchestrator for UI Workspaces
 * Handles the lifecycle defined in 20_WORKSPACE_ARCHITECTURE.md
 */

import { widgetRegistry } from './WidgetRegistry';

class WorkspaceManager {
  constructor() {
    this.activeWorkspaceId = null;
    this.activeSessionId = null;
    
    // Runtime State
    this.state = {
      layout: {},          // Sizes and positions of workbenches
      widgets: {},         // Widget visibility and placement
      capabilities: [],    // Allowed capabilities for the active workspace
      memoryContext: null, // Memory binding
      knowledgeContext: null, // Knowledge binding
      status: 'IDLE'       // INITIALIZE, READY, SUSPENDED, etc.
    };

    this.listeners = new Set();
  }

  /**
   * Subscribes to Workspace State changes (React components will use this)
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    for (const listener of this.listeners) {
      listener({ ...this.state, workspaceId: this.activeWorkspaceId, sessionId: this.activeSessionId });
    }
  }

  _updateState(updates) {
    this.state = { ...this.state, ...updates };
    this._notify();
  }

  /**
   * Phase 1 & 2: Load Manifest
   */
  async _loadManifest(workspaceId) {
    // In a real implementation, this might fetch from an API or local JSON.
    // For now, we mock the manifest structure based on the architecture doc.
    if (workspaceId === 'ws-engineer') {
      return {
        id: 'ws-engineer',
        type: 'ENGINEER',
        name: 'Engineer Console',
        context: { memory_source: 'PROJECT_MEMORY', knowledge_source: 'ENGINEERING_KNOWLEDGE' },
        capabilities: ['cap:code-execution', 'cap:architecture-verification', 'cap:repository-access'],
        default_layout: {
          left_workbench: ['widget:engineering-tasks', 'widget:architecture-gaps'],
          right_workbench: ['widget:verification-log'],
          bottom_workbench: []
        },
        permissions: { allow_global_memory: false }
      };
    }

    // Default Fallback (Owner Workspace)
    return {
      id: workspaceId || 'ws-owner',
      type: 'OWNER',
      name: 'Mamet OS',
      context: { memory_source: 'USER_MEMORY', knowledge_source: 'PERSONAL_KNOWLEDGE' },
      capabilities: ['cap:web-search', 'cap:automation'],
      default_layout: {
        left_workbench: ['widget:workspace-nav'],
        right_workbench: [],
        bottom_workbench: []
      },
      permissions: { allow_global_memory: true }
    };
  }

  /**
   * Central Lifecycle Method: Load and switch to a Workspace
   */
  async switchWorkspace(workspaceId) {
    console.log(`[WorkspaceManager] Switching to workspace: ${workspaceId}`);
    
    // 1. Unmount Phase (Save current layout/state)
    if (this.activeWorkspaceId && this.activeSessionId) {
      await this.suspendCurrentSession();
    }

    this._updateState({ status: 'INITIALIZE' });

    // 2. Load Manifest Phase
    const manifest = await this._loadManifest(workspaceId);
    this.activeWorkspaceId = manifest.id;
    
    // 3 & 4. Bind Context & Load Capability Phase
    this._updateState({
      memoryContext: manifest.context.memory_source,
      knowledgeContext: manifest.context.knowledge_source,
      capabilities: manifest.capabilities,
      status: 'LOADING_MANIFEST'
    });

    // Generate or fetch a Session ID for this Workspace
    this.activeSessionId = `session-${manifest.id}-${Date.now()}`;

    // 5. Restore Layout Phase
    // Here we would normally read from localStorage or DB using the Workspace/Session ID
    const storedLayoutStr = localStorage.getItem(`mamet_layout_${manifest.id}`);
    const storedWidgetsStr = localStorage.getItem(`mamet_widgets_${manifest.id}`);
    
    let layout = manifest.default_layout; // fallback to manifest default
    let widgets = {};

    if (storedLayoutStr) {
      try { layout = JSON.parse(storedLayoutStr); } catch (e) {}
    }
    if (storedWidgetsStr) {
      try { widgets = JSON.parse(storedWidgetsStr); } catch (e) {}
    }

    this._updateState({
      layout,
      widgets,
      status: 'RESTORING_LAYOUT'
    });

    // 6. Restore Session (Chat History) -> handled by Conversation Engine listening to activeSessionId
    
    // 7. Ready Phase
    this._updateState({ status: 'READY' });
    console.log(`[WorkspaceManager] Workspace ${manifest.name} is READY.`);
  }

  /**
   * Suspend Phase: Save state before leaving
   */
  async suspendCurrentSession() {
    if (!this.activeWorkspaceId) return;
    this._updateState({ status: 'SUSPENDING' });
    
    // Save Layout Persistence
    localStorage.setItem(`mamet_layout_${this.activeWorkspaceId}`, JSON.stringify(this.state.layout));
    localStorage.setItem(`mamet_widgets_${this.activeWorkspaceId}`, JSON.stringify(this.state.widgets));
    
    console.log(`[WorkspaceManager] Suspended workspace: ${this.activeWorkspaceId}`);
  }

  /**
   * Widget Control: Used by the Workbench to update layouts
   */
  updateLayout(workbench, newSize) {
    const newLayout = { ...this.state.layout, [`${workbench}_size`]: newSize };
    this._updateState({ layout: newLayout });
    localStorage.setItem(`mamet_layout_${this.activeWorkspaceId}`, JSON.stringify(newLayout));
  }

  /**
   * Widget Control: Used by UI Events (like Conversation Engine) to pop open a widget
   */
  openWidgetInWorkbench(workbenchPosition, widgetId, widgetData) {
    console.log(`[WorkspaceManager] Opening ${widgetId} in ${workbenchPosition} workbench`);
    
    // In a full implementation, widgetData would be passed via an EventBus to the widget.
    // For now, we ensure the widget is visible in the layout.
    const currentLayout = this.state.layout;
    const workbenchKey = `${workbenchPosition}_workbench`;
    const currentWidgets = currentLayout[workbenchKey] || [];
    
    if (!currentWidgets.includes(widgetId)) {
      const newLayout = { 
        ...currentLayout, 
        [workbenchKey]: [...currentWidgets, widgetId] 
      };
      this._updateState({ layout: newLayout });
      localStorage.setItem(`mamet_layout_${this.activeWorkspaceId}`, JSON.stringify(newLayout));
    }
  }
}

export const workspaceManager = new WorkspaceManager();
