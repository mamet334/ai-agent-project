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
    
    this.isInitialized = true;
    
    // Register built-in tools
    this.registerTool({
      name: 'memory_manager',
      description: 'Menyimpan, mencari, dan mengelola User Memory di Supabase',
      category: 'memory',
      execute: async (params) => {
        if (params.action === 'store') return await memoryService.storeMemory(params.key, params.value, {
          source_type: 'tool_call',
          source_reference: 'tool_memory_manager',
          version_code: `TOOL-${Date.now()}`,
          category: params.category || 'general',
          useGovernor: true
        });
        if (params.action === 'get') return await memoryService.getMemory(params.query);
        return { error: 'Unknown action' };
      }
    });

    this.registerTool({
      name: 'web_search',
      description: 'Mencari informasi dari web menggunakan search engine',
      category: 'research',
      execute: async (params) => {
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
    
    this.eventBus.emit('ToolRegistry:Ready', { status: 'READY', timestamp: Date.now() });
    console.log('[ToolRegistryService] Initialized and Ready');
  }

  async registerTool(toolConfig) {
    if (!this.isInitialized) throw new Error('ToolRegistryService not initialized');
    
    const name = toolConfig.name;
    if (!name) throw new Error('Tool must have a name');
    
    console.log(`[ToolRegistryService] Registering tool: ${name}`);
    this.tools.set(name, toolConfig);
    
    this.eventBus.emit('Tool:Registered', { name });
    return true;
  }

  getTool(toolName) {
    return this.tools.get(toolName) || null;
  }

  listTools() {
    return Array.from(this.tools.values());
  }

  async executeTool(toolName, args) {
    console.log(`[ToolRegistryService] Executing tool: ${toolName}`);
    this.eventBus.emit('Tool:Executed', { toolName, args });
    return { success: true };
  }
}