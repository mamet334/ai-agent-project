import { supabase } from '../../../supabase.js';

/**
 * MemoryService - Layer 2 Capability Service
 * Bertanggung jawab atas pengelolaan memori OS secara terpusat.
 */
export class MemoryService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.storageManager = serviceManager.get('StorageManager'); // Optional deps
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Placeholder untuk inisialisasi state atau resource (misal: load memory cache)
    
    this.isInitialized = true;
    this.eventBus.emit('Memory:Ready', { status: 'READY', timestamp: Date.now() });
    console.log('[MemoryService] Initialized and Ready');
  }

  /**
   * Mengambil memori berdasarkan query.
   * @param {string} query 
   */
  async getMemory(query) {
    if (!this.isInitialized) throw new Error('MemoryService not initialized');
    
    console.log('[MemoryService] 🔍 Query ke Supabase untuk:', query);
    let result = [];
    try {
      const stopwords = ['hai', 'halo', 'saya', 'aku', 'adalah', 'apa', 'siapa', 'bagaimana', 'dimana', 'kapan', 'mengapa', 'coba', 'tolong', 'bisa', 'kan', 'dong', 'ya', 'yg', 'yang', 'ini', 'itu', 'dan', 'atau', 'ke', 'di', 'dari', 'untuk', 'dengan'];
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopwords.includes(w));
      
      let memoryQuery = supabase.from('user_memories').select('*');
      if (keywords.length > 0) {
          const filterString = keywords.map(k => `summary.ilike.%${k}%`).join(',');
          memoryQuery = memoryQuery.or(filterString);
      } else {
          memoryQuery = memoryQuery.ilike('summary', `%${query}%`);
      }
      const { data, error } = await memoryQuery.order('created_at', { ascending: false }).limit(10);
        
      console.log('[MemoryService] 📋 Data mentah dari Supabase:', JSON.stringify(data));
      if (error) {
        console.log('[MemoryService] ⚠️ Error jika ada:', error);
        throw error;
      }
      result = data || [];
    } catch (err) {
      console.error('[MemoryService] Error fetching memory:', err);
    }
    
    this.eventBus.emit('Memory:Retrieved', { query, result });
    return result;
  }

/**
   * Menyimpan memori baru.
   * @param {string} key 
   * @param {any} value 
   * @param {Object} [options] - Metadata opsional golden source
   * @param {string} [options.source_reference] - Reference ke sumber asli (file/path/doc)
   * @param {string} [options.chat_id] - Chat ID terkait
   * @param {string} [options.version_code] - Kode versi
   * @param {string} [options.source_type] - 'fact' | 'preference' | 'location' | 'engineer_session'
   */
  async storeMemory(key, value, options = {}) {
    if (!this.isInitialized) throw new Error('MemoryService not initialized');
    
    // Input validation
    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      console.error('[MemoryService] Invalid key: must be non-empty string');
      this.eventBus.emit('Memory:Stored', { key, success: false, error: 'Invalid key' });
      return false;
    }
    
    if (value === undefined || value === null) {
      console.error('[MemoryService] Invalid value: cannot be null or undefined');
      this.eventBus.emit('Memory:Stored', { key, success: false, error: 'Invalid value' });
      return false;
    }
    
    console.log(`[MemoryService] Storing memory [${key}]`);
    let success = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      if (!userId) {
        throw new Error('User not authenticated');
      }
      
      const content = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const summary = key.length > 100 ? key.substring(0, 100) + '...' : key;

      // === GOLDEN SOURCE PATH (MemoryGovernorService) ===
      // Jika metadata golden source disediakan, delegasikan ke MemoryGovernorService
      // agar raw content disimpan + ringkasan mendapat metadata wajib.
      const hasGoldenMeta = options.source_reference || options.chat_id || options.version_code;
      if (hasGoldenMeta) {
        const governor = this.serviceManager.has('MemoryGovernorService')
          ? this.serviceManager.get('MemoryGovernorService')
          : null;

        if (governor && typeof governor.storeGoldenMemory === 'function') {
          const result = await governor.storeGoldenMemory({
            user_id: userId,
            content,
            summary,
            source_type: options.source_type || 'fact',
            source_reference: options.source_reference || null,
            chat_id: options.chat_id || null,
            version_code: options.version_code || null
          });
          success = !!result;
          this.eventBus.emit('Memory:Stored', { key, success });
          return success;
        }
        // Fallback: if governor not available, continue standard insert below
      }

      // === STANDARD PATH (backward compatible) ===
      const { error } = await supabase
        .from('user_memories')
        .insert([
          { 
            user_id: userId, 
            summary: content, 
            memory_type: 'fact', 
            confidence: 1.0, 
            source: 'MemoryService' 
          }
        ]);
        
      if (error) throw error;
      success = true;
      console.log('[MemoryService] Memory stored successfully');
    } catch (err) {
      console.error('[MemoryService] Error storing memory:', err);
    }
    
    this.eventBus.emit('Memory:Stored', { key, success });
    return success;
  }
}
