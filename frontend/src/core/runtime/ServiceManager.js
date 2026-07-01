export class ServiceManager {
  constructor() {
    this.services = new Map();
  }

  register(name, service) {
    if (this.services.has(name)) {
      console.warn(`[ServiceManager] Overwriting existing service: ${name}`);
    }
    this.services.set(name, service);
    console.debug(`[ServiceManager] Registered: ${name}`);
  }

  get(name) {
    if (!this.services.has(name)) {
      throw new Error(`[ServiceManager] Service not found: ${name}`);
    }
    return this.services.get(name);
  }

  has(name) {
    return this.services.has(name);
  }
}

// Global Singleton for the DI Container
export const serviceManager = new ServiceManager();
