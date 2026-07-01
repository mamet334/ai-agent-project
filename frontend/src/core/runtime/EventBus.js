export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.active = true; // Always active!
  }

  activate() {
    this.active = true;
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
    // Always allow all events!
    if (this.listeners.has('*')) {
      for (const callback of this.listeners.get('*')) {
        try {
          callback(event, payload);
        } catch (e) {
          console.error(`[EventBus] Error in wildcard listener:`, e);
        }
      }
    }
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
