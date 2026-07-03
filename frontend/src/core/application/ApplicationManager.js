/**
 * ApplicationManager - Phase 2 Core
 * Handles the registration, activation, and lifecycle of Desktop Apps.
 * NOT a Service Locator. NOT an Event Bus.
 */
class ApplicationManager {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.apps = new Map();
    this.activeAppId = null;
  }

  subscribe(listener) {
    const eventBus = this.serviceManager.get('EventBus');
    console.log('[ApplicationManager] Subscriber registered');
    return eventBus.on('App:StateChanged', listener);
  }

  notify() {
    const state = this.getState();
    console.log('[ApplicationManager] Notifying state change. Apps count:', state.apps.length);
    const eventBus = this.serviceManager.get('EventBus');
    eventBus.emit('App:StateChanged', state);
  }

  getState() {
    return {
      activeAppId: this.activeAppId,
      apps: Array.from(this.apps.values())
    };
  }

  /**
   * App Definition: { id, name, iconComponent, renderComponent }
   */
  registerApp(appDef) {
    if (this.apps.has(appDef.id)) {
      console.warn(`[ApplicationManager] App ${appDef.id} is already registered.`);
      return;
    }

    this.apps.set(appDef.id, {
      ...appDef,
      status: 'REGISTERED'
    });
    
    console.log(`[ApplicationManager] Registered app: ${appDef.id}`);
    this.notify();
  }

  activateApp(appId) {
    if (!this.apps.has(appId)) {
      console.error(`[ApplicationManager] Cannot activate unknown app: ${appId}`);
      return;
    }

    if (this.activeAppId === appId) return;

    if (this.activeAppId) {
      const prevApp = this.apps.get(this.activeAppId);
      prevApp.status = 'BACKGROUND';
      console.log(`[ApplicationManager] App ${this.activeAppId} transitioned to BACKGROUND`);
    }

    const nextApp = this.apps.get(appId);
    nextApp.status = 'RUNNING';
    this.activeAppId = appId;
    
    console.log(`[ApplicationManager] App ${appId} transitioned to RUNNING`);
    this.notify();
  }
}

export { ApplicationManager };