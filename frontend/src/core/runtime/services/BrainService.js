/**
 * BrainService
 * Manages the AI Brain configuration (Provider & Model).
 * Interfaces with VaultService for credentials.
 */
class BrainService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.state = {
      provider: 'openrouter'
    };
  }

  async initialize() {
    const savedProvider = localStorage.getItem('maef_ai_provider');
    if (savedProvider) this.state.provider = savedProvider;
    console.log(`[BrainService] Initialized with provider: ${this.state.provider}`);
  }

  setBrain(provider, model) {
    // Model tidak lagi disimpan di BrainService. Hanya provider yang disimpan.
    this.state.provider = provider;
    localStorage.setItem('maef_ai_provider', provider);
    
    if (this.eventBus) {
      this.eventBus.emit('Brain:ConfigUpdated', this.state);
    }
  }

  getBrainConfig() {
    return { ...this.state };
  }

  /**
   * Retrieves the API key for the active provider. 
   * Model selection is now handled purely by the backend payload (ctx.request.model).
   */
  async getActiveBrainContext() {
    const vault = this.serviceManager.get('VaultService');
    const key = vault ? vault.getKey(this.state.provider) : null;
    
    return {
      provider: this.state.provider,
      model: null, // <-- Kita kosongkan model di sini agar backend menggunakan payload dari UI
      key: key
    };
  }
}

export { BrainService };