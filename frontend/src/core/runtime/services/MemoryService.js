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
   * Prioritas: MemoryGovernorService.retrieveMemory() (two-stage filter + ranking)
   * Fallback: keyword ilike search (backward compatible)
   *
   * @param {string} query
   * @param {Object} [options]
   * @param {string[]} [options.categories] - Kategori untuk two-stage filter. Default: ['general']
   * @param {boolean} [options.includeSensitive] - Hanya true jika flag eksplisit dari user
   */
  async getMemory(query, options = {}) {
    if (!this.isInitialized) throw new Error('MemoryService not initialized');

    console.log('[MemoryService] 🔍 Query memori untuk:', query);
    let result = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // === PATH UTAMA: Two-Stage Retrieval via MemoryGovernorService ===
      const governor = this.serviceManager.has('MemoryGovernorService')
        ? this.serviceManager.get('MemoryGovernorService')
        : null;

      if (governor && typeof governor.retrieveMemory === 'function' && userId) {
        // Tentukan kategori dari query jika tidak disediakan
        const categories = options.categories || this._inferCategories(query);
        result = await governor.retrieveMemory({
          userId,
          categories,
          includeSensitive: options.includeSensitive || false,
          topK: 10
        });
        console.log(`[MemoryService] Two-Stage retrieval: ${result.length} memori`);

      } else {
        // === FALLBACK: keyword ilike (backward compatible) ===
        // Selalu exclude status non-active jika kolom status ada
        console.log('[MemoryService] Fallback ke keyword search (MemoryGovernorService tidak tersedia)');
        const stopwords = ['hai', 'halo', 'saya', 'aku', 'adalah', 'apa', 'siapa', 'bagaimana', 'dimana', 'kapan', 'mengapa', 'coba', 'tolong', 'bisa', 'kan', 'dong', 'ya', 'yg', 'yang', 'ini', 'itu', 'dan', 'atau', 'ke', 'di', 'dari', 'untuk', 'dengan'];
        const sanitizedFull = (query || '').replace(/[%_"'(),\\]/g, ' ').replace(/\s+/g, ' ').trim();
        const keywords = sanitizedFull.toLowerCase().split(/\s+/).map(w => w.replace(/[^\w\s-]/g, '').trim()).filter(w => w.length > 2 && !stopwords.includes(w));

        let memoryQuery = supabase.from('user_memories').select('*');
        if (keywords.length > 0) {
          const filterString = keywords.map(k => `summary.ilike.%${k}%`).join(',');
          memoryQuery = memoryQuery.or(filterString);
        } else if (sanitizedFull.length > 0) {
          memoryQuery = memoryQuery.ilike('summary', `%${sanitizedFull}%`);
        } else {
          return [];
        }
        // Exclude archived/pending_purge/conflict
        memoryQuery = memoryQuery.not('status', 'in', '("archived","pending_purge","CONFLICT_PENDING_REVIEW")');
        const { data, error } = await memoryQuery.order('created_at', { ascending: false }).limit(10);

        if (error) {
          // status kolom belum ada (data lama) → retry tanpa filter status
          const { data: data2 } = await supabase
            .from('user_memories')
            .select('*')
            .ilike('summary', `%${sanitizedFull}%`)
            .order('created_at', { ascending: false })
            .limit(10);
          result = data2 || [];
        } else {
          result = data || [];
        }
      }

    } catch (err) {
      console.error('[MemoryService] Error fetching memory:', err);
    }

    this.eventBus.emit('Memory:Retrieved', { query, result });
    return result;
  }

  /**
   * Infer kategori dari query text — mapping sederhana untuk Two-Stage Filter.
   * Kategori default 'general' selalu disertakan.
   * @private
   */
  _inferCategories(query = '') {
    const q = query.toLowerCase();
    const categories = ['general'];
    if (q.includes('engineer') || q.includes('file') || q.includes('kode') || q.includes('code')) categories.push('engineering');
    if (q.includes('preferens') || q.includes('suka') || q.includes('ingin')) categories.push('preference');
    if (q.includes('lokasi') || q.includes('alamat') || q.includes('tempat')) categories.push('location');
    if (q.includes('proyek') || q.includes('project') || q.includes('fitur')) categories.push('project');
    return [...new Set(categories)];
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

      // === GOLDEN SOURCE PATH (MemoryGovernorService - Secure by Default) ===
      // Selalu delegasikan ke MemoryGovernorService jika tersedia agar raw content disimpan
      // dan ringkasan selalu mendapat metadata wajib.
      const governor = this.serviceManager.has('MemoryGovernorService')
        ? this.serviceManager.get('MemoryGovernorService')
        : null;

      if (governor && typeof governor.storeGoldenMemory === 'function') {
        const result = await governor.storeGoldenMemory({
          user_id: userId,
          content,
          summary,
          source_type: options.source_type || 'fact',
          source_reference: options.source_reference || 'memory_service',
          chat_id: options.chat_id || null,
          version_code: options.version_code || `MEM-${Date.now()}`,
          category: options.category || 'general',
          access_tier: options.access_tier || 'generic',
          status: options.status || 'active',
          version_sequence: options.version_sequence || 1
        });
        success = !!result;
        this.eventBus.emit('Memory:Stored', { key, success });
        return success;
      }

      // === STANDARD PATH (Safety Net Fallback jika Governor tidak tersedia) ===
      const { error } = await supabase
        .from('user_memories')
        .insert([
          { 
            user_id: userId, 
            summary: content, 
            memory_type: options.source_type || 'fact', 
            confidence: 1.0, 
            source: options.source_reference || 'MemoryService' 
          }
        ]);
        
      if (error) throw error;
      success = true;
      console.log('[MemoryService] Memory stored successfully (Fallback standard path)');
    } catch (err) {
      console.error('[MemoryService] Error storing memory:', err);
    }
    
    this.eventBus.emit('Memory:Stored', { key, success });
    return success;
  }
}
