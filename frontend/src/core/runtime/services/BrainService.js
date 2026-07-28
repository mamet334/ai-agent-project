/**
 * BrainService
 * Manages the AI Brain configuration (Provider & Model).
 * Interfaces with VaultService for credentials.
 * 
 * FIX: Model sekarang disimpan bersamaan dengan provider agar pilihan dari
 * Settings UI tidak hilang saat pesan dikirim ke backend.
 * 
 * UPGRADE: executeLLM() ditambahkan agar Engineer.js dapat memanggil LLM
 * langsung tanpa harus melewati ConversationEngine.
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

  /**
   * Memanggil LLM via backend Supabase edge function.
   * Digunakan oleh Engineer untuk membuat patch tanpa melalui ConversationEngine.
   * 
   * Format request harus match dengan yang diterima agent-process:
   * - Field: message (string), mode, appSource, model, dll.
   * - API key dikirim via header x-byok-{provider}
   * 
   * @param {string} prompt - Prompt lengkap untuk dikirim ke LLM
   * @param {object} options - Opsi override (model, dll)
   * @returns {Promise<string>} - Raw text response dari LLM
   */
  async executeLLM(prompt, options = {}) {
    const context = await this.getActiveBrainContext();
    const model = options.model || context.model || this.state.model;
    const provider = context.provider || this.state.provider;
    const apiKey = context.key || '';

    console.log(`[BrainService:executeLLM] 🧠 Memanggil LLM: provider=${provider}, model=${model}`);

    // Ambil session token dari supabase
    let token = '';
    try {
      if (typeof window !== 'undefined') {
        // Cari token dari semua key localStorage yang mengandung auth-token
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('auth-token')) {
            try {
              const parsed = JSON.parse(localStorage.getItem(key));
              if (parsed?.access_token) {
                token = parsed.access_token;
                break;
              }
            } catch (_) {}
          }
        }
      }
    } catch (e) {
      console.warn('[BrainService:executeLLM] Gagal ambil session token:', e.message);
    }

    // Fallback ke VITE anon key
    const authToken = token || (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_ANON_KEY : '') || '';
    const endpoint = 'https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process';

    // Format payload HARUS match dengan yang backend agent-process terima
    const payload = {
      message: prompt,          // string, bukan array
      mode: 'ENGINEER',
      appSource: 'engineer',
      history: [],
      globalMemory: '',
      semanticContext: '',
      stream: false,
      ragEnabled: false,        // Matikan RAG untuk Engineer (kita sudah inject context sendiri)
      model: model || undefined
    };
    if (!payload.model) delete payload.model;

    // Headers: API key via header x-byok-{provider}
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken.replace(/[^\x00-\x7F]/g, '')}`
    };

    if (apiKey) {
      const cleanKey = apiKey.replace(/[^\x00-\x7F]/g, '');
      if (provider === 'openrouter') headers['x-byok-openrouter'] = cleanKey;
      else if (provider === 'openai') headers['x-byok-openai'] = cleanKey;
      else if (provider === 'groq') headers['x-byok-groq'] = cleanKey;
      else if (provider === 'gemini') headers['x-byok-gemini'] = cleanKey;
      else if (provider === 'anthropic') headers['x-byok-anthropic'] = cleanKey;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Backend error ${response.status}: ${errText}`);
      }

      const result = await response.json();
      // Backend agent-process mengembalikan field 'message' (bukan 'reply')
      // Chain: message → reply → content → text → fallback JSON.stringify
      const rawText = result?.message || result?.reply || result?.content || result?.text || JSON.stringify(result);
      console.log(`[BrainService:executeLLM] ✅ Response diterima: ${rawText.length} chars`);
      console.log(`[BrainService:executeLLM] 🔍 First 200 chars: ${rawText.substring(0, 200)}`);
      return rawText;
    } catch (e) {
      console.error('[BrainService:executeLLM] ❌ Fetch gagal:', e.message);
      throw e;
    }
  }
}

export { BrainService };