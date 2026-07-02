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
    
    console.log(`[MemoryService] Fetching memory for query: ${query}`);
    const placeholderResult = []; // TODO: Implement API/DB Fetch
    
    this.eventBus.emit('Memory:Retrieved', { query, result: placeholderResult });
    return placeholderResult;
  }

  /**
   * Menyimpan memori baru.
   * @param {string} key 
   * @param {any} value 
   */
  async storeMemory(key, value) {
    if (!this.isInitialized) throw new Error('MemoryService not initialized');
    
    console.log(`[MemoryService] Storing memory [${key}]`);
    // TODO: Implement API/DB Save
    
    this.eventBus.emit('Memory:Stored', { key, success: true });
    return true;
  }
}
