/**
 * ToolRegistryService - Layer 2 Capability Service
 * Bertanggung jawab sebagai pusat pendaftaran dan pengambilan spesifikasi Tool AI.
 */
export class ToolRegistryService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.isInitialized = false;
    this.tools = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Register built-in tools
    this.registerTool({
      name: 'memory_manager',
      description: 'Menyimpan, mencari, dan mengelola User Memory di Supabase',
      category: 'memory',
      execute: async (params) => {
        const memoryService = this.serviceManager.get('MemoryService');
        if (params.action === 'store') return await memoryService.storeMemory(params.key, params.value);
        if (params.action === 'get') return await memoryService.getMemory(params.query);
        return { error: 'Unknown action' };
      }
    });

    this.registerTool({
      name: 'web_search',
      description: 'Mencari informasi dari web menggunakan search engine',
      category: 'research',
      execute: async (params) => {
        // Placeholder - akan diisi nanti dengan API search
        return { message: 'Web search tool ready', query: params.query };
      }
    });

    this.registerTool({
      name: 'file_reader',
      description: 'Membaca dan menganalisis file (PDF, Excel, Word, TXT)',
      category: 'analysis',
      execute: async (params) => {
        return { message: 'File reader tool ready', filePath: params.filePath };
      }
    });

    this.registerTool({
      name: 'deep_research',
      description: 'Melakukan riset mendalam multi-langkah dengan sintesis',
      category: 'research',
      execute: async (params) => {
        return { message: 'Deep research tool ready', topic: params.topic };
      }
    });
    
    this.isInitialized = true;
    this.eventBus.emit('ToolRegistry:Ready', { status: 'READY', timestamp: Date.now() });
    console.log('[ToolRegistryService] Initialized and Ready');
  }

  /**
   * Mendaftarkan tool baru ke dalam registry.
   * @param {Object} toolConfig 
   */
  async registerTool(toolConfig) {
    if (!this.isInitialized) throw new Error('ToolRegistryService not initialized');
    
    const name = toolConfig.name;
    if (!name) throw new Error('Tool must have a name');
    
    console.log(`[ToolRegistryService] Registering tool: ${name}`);
    this.tools.set(name, toolConfig);
    
    this.eventBus.emit('Tool:Registered', { name });
    return true;
  }

  /**
   * Mengambil spesifikasi tool berdasarkan nama.
   * @param {string} toolName 
   */
  getTool(toolName) {
    return this.tools.get(toolName) || null;
  }

  /**
   * Mendapatkan daftar semua tools yang terdaftar.
   */
  listTools() {
    return Array.from(this.tools.values());
  }

  /**
   * (Opsional) Mensimulasikan trigger eksekusi tool.
   * @param {string} toolName 
   * @param {any} args 
   */
  async executeTool(toolName, args) {
    console.log(`[ToolRegistryService] Executing tool: ${toolName}`);
    this.eventBus.emit('Tool:Executed', { toolName, args });
    // TODO: Tool execution routing
    return { success: true };
  }
}
