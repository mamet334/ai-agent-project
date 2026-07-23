/**
 * WorkspaceManager - OS Level Orchestrator for UI Workspaces
 * Handles the lifecycle defined in 20_WORKSPACE_ARCHITECTURE.md
 */

import { supabase } from '../../supabase';
import { EventBus } from '../runtime/EventBus';

export class WorkspaceManager {
  constructor(appId = 'global', serviceManager) {
    this.appId = appId;
    this.serviceManager = serviceManager;
    this.eventBus = new EventBus(); // Isolated Local EventBus to prevent state leakage
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

    this.syncTimeout = null; // Debouncer reference for layout sync

    // Technical Debt Fix: Kernel Shutdown Hook
    this._setupShutdownHook();
  }

  _setupShutdownHook() {
    window.addEventListener('beforeunload', () => {
      if (this.activeWorkspaceId) {
        // Synchronously save to local storage before tab closes
        localStorage.setItem(`mamet_v3_${this.appId}_layout_${this.activeWorkspaceId}`, JSON.stringify(this.state.layout));
        localStorage.setItem(`mamet_v3_${this.appId}_widgets_${this.activeWorkspaceId}`, JSON.stringify(this.state.widgets));
      }
    });
  }

  /**
   * Subscribes to Workspace State changes (React components will use this)
   */
  subscribe(listener) {
    return this.eventBus.on('Workspace:StateChanged', listener);
  }

  _notify() {
    this.eventBus.emit('Workspace:StateChanged', {
      ...this.state,
      workspaceId: this.activeWorkspaceId,
      sessionId: this.activeSessionId
    });
  }

  _updateState(updates) {
    this.state = { ...this.state, ...updates };
    this._notify();
  }

  /**
   * Phase 1 & 2: Load Manifest
   */
  async _loadManifest(workspaceId) {
    const metadataService = this.serviceManager.get('MetadataService');
    if (!metadataService) {
      console.warn('[WorkspaceManager] MetadataService not available. Falling back to default.');
      return this._getDefaultManifest(workspaceId);
    }

    const config = metadataService.getWorkspaceConfig(workspaceId);
    if (!config) {
      console.warn(`[WorkspaceManager] Workspace ${workspaceId} not found in metadata. Falling back.`);
      return this._getDefaultManifest(workspaceId);
    }

    return {
      id: config.id,
      type: config.id.split('-')[1]?.toUpperCase() || 'GLOBAL',
      name: config.name,
      context: { memory_source: 'USER_MEMORY', knowledge_source: 'PERSONAL_KNOWLEDGE' },
      capabilities: config.capabilities || [],
      default_layout: config.default_layout || { left_workbench: [], right_workbench: [], bottom_workbench: [] },
      permissions: config.permissions || { allow_global_memory: true }
    };
  }

  _getDefaultManifest(workspaceId) {
    return {
      id: workspaceId || 'ws-assistant',
      type: 'ASSISTANT',
      name: 'Mamet OS',
      context: { memory_source: 'USER_MEMORY', knowledge_source: 'PERSONAL_KNOWLEDGE' },
      capabilities: ['cap:web-search', 'cap:automation'],
      default_layout: { left_workbench: [], right_workbench: [], bottom_workbench: [] },
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
    // Fetch layout from Supabase User Metadata (or fallback to localStorage/default)
    const { data: { user } } = await supabase.auth.getUser();
    let userLayouts = {};
    if (user && user.user_metadata && user.user_metadata.workspace_layouts) {
      userLayouts = user.user_metadata.workspace_layouts;
    }

    const storedLayoutStr = localStorage.getItem(`mamet_v4_${this.appId}_layout_${manifest.id}`);
    const storedWidgetsStr = localStorage.getItem(`mamet_v4_${this.appId}_widgets_${manifest.id}`);

    let rawLayout = userLayouts[`v4_${this.appId}_layout_${manifest.id}`];
    let rawWidgets = userLayouts[`v4_${this.appId}_widgets_${manifest.id}`];

    if (!rawLayout) {
      if (storedLayoutStr) {
        try { rawLayout = JSON.parse(storedLayoutStr); } catch (e) { }
      }
      if (storedWidgetsStr) {
        try { rawWidgets = JSON.parse(storedWidgetsStr); } catch (e) { }
      }
    }

    const layout = this._validateAndSanitizeLayout(rawLayout, manifest.default_layout);
    const widgets = rawWidgets && typeof rawWidgets === 'object' ? rawWidgets : {};

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
   * Architectural Guarantee: State Protection
   * Validates raw persistence data against the Manifest schema.
   * Discards corrupted states and falls back to default safely.
   */
  _validateAndSanitizeLayout(rawLayout, defaultLayout) {
    if (!rawLayout || typeof rawLayout !== 'object') {
      return defaultLayout;
    }

    const sanitized = { ...rawLayout };

    // Enforce array types for workbenches and floating windows
    ['left_workbench', 'right_workbench', 'bottom_workbench', 'floating_windows'].forEach(key => {
      if (sanitized[key] && !Array.isArray(sanitized[key])) {
        console.warn(`[WorkspaceManager] Corrupted layout state detected for ${key}. Falling back to default.`);
        sanitized[key] = defaultLayout[key] || [];
      }
    });

    return sanitized;
  }

  /**
   * Helper to sync Layout to Supabase User Metadata
   */
  async _syncLayoutToSupabase(workspaceId, layout, widgets) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const currentLayouts = user.user_metadata?.workspace_layouts || {};
      const newLayouts = {
        ...currentLayouts,
        [`v4_${this.appId}_layout_${workspaceId}`]: layout,
        [`v4_${this.appId}_widgets_${workspaceId}`]: widgets
      };

      await supabase.auth.updateUser({
        data: { workspace_layouts: newLayouts }
      });
      console.log(`[WorkspaceManager] Synced layout to Supabase for ${workspaceId}`);
    } catch (e) {
      console.error(`[WorkspaceManager] Failed to sync layout to Supabase`, e);
    }
  }

  /**
   * Debounced version of _syncLayoutToSupabase to prevent API spam during resize/drag
   */
  _debouncedSyncLayoutToSupabase(workspaceId, layout, widgets) {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = setTimeout(() => {
      this._syncLayoutToSupabase(workspaceId, layout, widgets);
    }, 2000); // 2 seconds debounce
  }

  /**
   * Suspend Phase: Save state before leaving
   */
  async suspendCurrentSession() {
    if (!this.activeWorkspaceId) return;
    this._updateState({ status: 'SUSPENDING' });

    // Save Layout Persistence locally and remotely
    localStorage.setItem(`mamet_v4_${this.appId}_layout_${this.activeWorkspaceId}`, JSON.stringify(this.state.layout));
    localStorage.setItem(`mamet_v4_${this.appId}_widgets_${this.activeWorkspaceId}`, JSON.stringify(this.state.widgets));

    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    await this._syncLayoutToSupabase(this.activeWorkspaceId, this.state.layout, this.state.widgets);

    console.log(`[WorkspaceManager] Suspended workspace: ${this.activeWorkspaceId}`);
  }

  /**
   * Widget Control: Used by the Workbench to update layouts
   */
  updateLayout(workbench, newSize) {
    const newLayout = { ...this.state.layout, [`${workbench}_size`]: newSize };
    this._updateState({ layout: newLayout });
    localStorage.setItem(`mamet_v4_${this.appId}_layout_${this.activeWorkspaceId}`, JSON.stringify(newLayout));

    // Throttled remote sync to prevent API limit drain
    this._debouncedSyncLayoutToSupabase(this.activeWorkspaceId, newLayout, this.state.widgets);
  }

  /**
   * Widget Control: Used by Golden Layout / Drag-and-Drop to move widgets
   */
  moveWidget(widgetId, fromWorkbench, toWorkbench, newIndex) {
    const layout = { ...this.state.layout };

    const fromList = [...(layout[`${fromWorkbench}_workbench`] || [])];
    const toList = fromWorkbench === toWorkbench ? fromList : [...(layout[`${toWorkbench}_workbench`] || [])];

    const currentIndex = fromList.indexOf(widgetId);
    if (currentIndex === -1) return;

    fromList.splice(currentIndex, 1);

    if (newIndex === undefined || newIndex === -1) {
      toList.push(widgetId);
    } else {
      toList.splice(newIndex, 0, widgetId);
    }

    layout[`${fromWorkbench}_workbench`] = fromList;
    if (fromWorkbench !== toWorkbench) {
      layout[`${toWorkbench}_workbench`] = toList;
    }

    this._updateState({ layout });
    localStorage.setItem(`mamet_v4_${this.appId}_layout_${this.activeWorkspaceId}`, JSON.stringify(layout));
    this._debouncedSyncLayoutToSupabase(this.activeWorkspaceId, layout, this.state.widgets);
  }

  /**
   * Widget Control: Closes a widget by removing it from all workbenches
   */
  closeWidget(widgetId) {
    const layout = { ...this.state.layout };
    let changed = false;

    ['left_workbench', 'right_workbench', 'bottom_workbench'].forEach(key => {
      if (layout[key] && layout[key].includes(widgetId)) {
        layout[key] = layout[key].filter(id => id !== widgetId);
        changed = true;
      }
    });

    if (changed) {
      this._updateState({ layout });
      localStorage.setItem(`mamet_v4_${this.appId}_layout_${this.activeWorkspaceId}`, JSON.stringify(layout));
      this._debouncedSyncLayoutToSupabase(this.activeWorkspaceId, layout, this.state.widgets);
    }
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
      localStorage.setItem(`mamet_v4_${this.appId}_layout_${this.activeWorkspaceId}`, JSON.stringify(newLayout));
      this._debouncedSyncLayoutToSupabase(this.activeWorkspaceId, newLayout, this.state.widgets);
    }

    if (widgetData) {
      this.widgetDataStore = this.widgetDataStore || {};
      this.widgetDataStore[widgetId] = widgetData;

      if (this.serviceManager && this.serviceManager.has('EventBus')) {
        const eventBus = this.serviceManager.get('EventBus');
        // Let the widget mount first if it was just added (for already mounted widgets)
        setTimeout(() => {
          eventBus.emit('Widget:DataInjected', {
            source: 'WorkspaceManager',
            widgetId,
            data: widgetData
          });
        }, 100);
      }
    }
  }

  /**
   * Retrieves data injected into a widget, useful for widgets that mount AFTER the data was injected.
   */
  getWidgetData(widgetId) {
    return this.widgetDataStore ? this.widgetDataStore[widgetId] : null;
  }
}
