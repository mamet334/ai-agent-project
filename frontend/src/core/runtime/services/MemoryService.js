import { supabase } from '../../../supabase.js';

/**
 * MemoryService - Layer 2 Capability Service
 * Bertanggung jawab atas pengelolaan memori OS secara terpusat.
 */
export class MemoryService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.fileSystem = serviceManager.get('FileSystem'); // Optional deps
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
   */
  async storeMemory(key, value) {
    if (!this.isInitialized) throw new Error('MemoryService not initialized');
    
    console.log(`[MemoryService] Storing memory [${key}]`);
    let success = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      const { error } = await supabase
        .from('user_memories')
        .insert([
          { user_id: userId, content: `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`, metadata: { key } }
        ]);
        
      if (error) throw error;
      success = true;
    } catch (err) {
      console.error('[MemoryService] Error storing memory:', err);
    }
    
    this.eventBus.emit('Memory:Stored', { key, success });
    return success;
  }
}
