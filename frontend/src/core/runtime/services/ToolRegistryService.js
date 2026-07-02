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
    
    // Placeholder untuk memuat build-in tools
    
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
