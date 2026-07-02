import { supabase } from '../../../supabase.js';

/**
 * KnowledgeService - Layer 2 Capability Service
 * Bertanggung jawab atas pengelolaan basis pengetahuan (RAG/Knowledge Base).
 */
export class KnowledgeService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // Placeholder untuk inisialisasi state/resource
    
    this.isInitialized = true;
    this.eventBus.emit('Knowledge:Ready', { status: 'READY', timestamp: Date.now() });
    console.log('[KnowledgeService] Initialized and Ready');
  }

  /**
   * Melakukan kueri pencarian ke Knowledge Base.
   * @param {string} query 
   */
  async queryKnowledge(query) {
    if (!this.isInitialized) throw new Error('KnowledgeService not initialized');
    
    console.log(`[KnowledgeService] Querying knowledge base for: ${query}`);
    let result = [];
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .ilike('content', `%${query}%`)
        .limit(50);
        
      if (error) throw error;
      result = data || [];
    } catch (err) {
      console.error('[KnowledgeService] Error querying knowledge:', err);
    }
    
    this.eventBus.emit('Knowledge:QueryResult', { query, result });
    return result;
  }

  /**
   * Mengindeks dokumen baru ke Knowledge Base.
   * @param {Object} doc 
   */
  async indexDocument(doc) {
    if (!this.isInitialized) throw new Error('KnowledgeService not initialized');
    
    console.log(`[KnowledgeService] Indexing document: ${doc.title || 'Untitled'}`);
    let success = false;
    let newDocId = doc.id || 'new';
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      const payload = { 
        user_id: userId,
        title: doc.title || 'Untitled',
        content: typeof doc.content === 'object' ? JSON.stringify(doc.content) : (doc.content || ''),
        metadata: doc.metadata || {}
      };
      
      // If doc has an ID, we could upsert. For simplicity, we just insert.
      const { data, error } = await supabase
        .from('knowledge_base')
        .insert([payload])
        .select('id')
        .single();
        
      if (error) throw error;
      if (data?.id) newDocId = data.id;
      success = true;
    } catch (err) {
      console.error('[KnowledgeService] Error indexing document:', err);
    }
    
    this.eventBus.emit('Knowledge:Indexed', { docId: newDocId, success });
    return success;
  }
}
