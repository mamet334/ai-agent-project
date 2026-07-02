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
      provider: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet'
    };
  }

  async initialize() {
    const savedProvider = localStorage.getItem('maef_ai_provider');
    const savedModel = localStorage.getItem('maef_ai_model');
    
    if (savedProvider) this.state.provider = savedProvider;
    if (savedModel) this.state.model = savedModel;

    console.log(`[BrainService] Initialized with ${this.state.provider} -> ${this.state.model}`);
  }

  setBrain(provider, model) {
    this.state.provider = provider;
    this.state.model = model;
    
    localStorage.setItem('maef_ai_provider', provider);
    localStorage.setItem('maef_ai_model', model);
    
    if (this.eventBus) {
      this.eventBus.emit('Brain:ConfigUpdated', this.state);
    }
  }

  getBrainConfig() {
    return { ...this.state };
  }

  /**
   * Retrieves the formatted model and the secure API key for the active brain.
   */
  async getActiveBrainContext() {
    const vault = this.serviceManager.get('VaultService');
    const key = vault ? vault.getKey(this.state.provider) : null;
    
    let formattedModel = this.state.model;
    if (this.state.provider === 'openrouter' && !formattedModel.startsWith('openrouter/')) {
      formattedModel = `openrouter/${this.state.model}`;
    } else if (this.state.provider === 'groq' && !formattedModel.startsWith('groq/')) {
      formattedModel = `groq/${this.state.model}`;
    }

    return {
      provider: this.state.provider,
      model: formattedModel,
      key: key
    };
  }
}

export { BrainService };
