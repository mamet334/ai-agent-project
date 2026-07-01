export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.active = false;
  }

  activate() {
    this.active = true;
    console.log('[EventBus] System activated');
  }

  deactivate() {
    this.active = false;
    console.log('[EventBus] System deactivated');
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, payload) {
    if (!this.active && event !== 'KERNEL_PHASE_COMPLETED' && event !== 'SYSTEM_READY') {
      return; // Don't emit non-critical events before activation
    }

    // Emit to wildcard listeners first
    if (this.listeners.has('*')) {
      for (const callback of this.listeners.get('*')) {
        try {
          callback(event, payload);
        } catch (e) {
          console.error(`[EventBus] Error in wildcard listener:`, e);
        }
      }
    }

    // Then emit to specific event listeners
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        try {
          callback(payload);
        } catch (e) {
          console.error(`[EventBus] Error in listener for event ${event}:`, e);
        }
      }
    }
  }
}
