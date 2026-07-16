/**
 * BrainService
 * Manages the AI Brain configuration (Provider & Model).
 * Interfaces with VaultService for credentials.
 * 
 * FIX: Model sekarang disimpan bersamaan dengan provider agar pilihan dari
 * Settings UI tidak hilang saat pesan dikirim ke backend.
 */
class BrainService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.state = {
      provider: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet'
    };
  }

  async initialize() {
    const savedProvider = localStorage.getItem('maef_ai_provider');
    const savedModel = localStorage.getItem('maef_ai_model');
    if (savedProvider) this.state.provider = savedProvider;
    if (savedModel) this.state.model = savedModel;
    console.log(`[BrainService] Initialized with provider: ${this.state.provider}, model: ${this.state.model}`);
  }

  setBrain(provider, model) {
    this.state.provider = provider;
    if (model) this.state.model = model;
    localStorage.setItem('maef_ai_provider', provider);
    if (model) localStorage.setItem('maef_ai_model', model);
    
    if (this.eventBus) {
      this.eventBus.emit('Brain:ConfigUpdated', { ...this.state });
    }
  }

  getBrainConfig() {
    return { ...this.state };
  }

  /**
   * Retrieves the active brain context (provider, model, apiKey) for an API call.
   * API key diambil dari VaultService yang terisi saat user Save di Settings.
   */
  async getActiveBrainContext() {
    const vault = this.serviceManager.get('VaultService');
    const key = vault ? vault.getKey(this.state.provider) : null;
    
    return {
      provider: this.state.provider,
      model: this.state.model,
      key: key
    };
  }
}

export { BrainService };