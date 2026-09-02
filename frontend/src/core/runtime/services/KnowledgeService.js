/**
 * KnowledgeService — Layer 2 Capability Service (Universal ES Module)
 *
 * Bertanggung jawab atas query mentah ke basis pengetahuan (RAG / Knowledge Base).
 *
 * PR#9 Refactor:
 * - Bebas dari import statis browser-only (kompatibel Deno & Browser).
 * - Mendukung Dependency Injection untuk supabaseClient.
 * - Mengambil candidate chunks dari tabel `document_chunks` / `documents` sesuai skema PR#4/PR#5.
 * - Mengembalikan Array<ChunkObject>: { id, document_id, content, source_url, source_type, similarity }.
 * - TIDAK menyentuh tabel user_memories / MemoryService / MemoryGovernorService (jalur RAG independen).
 */

const DEFAULT_STOPWORDS = new Set([
  'dan', 'yang', 'ini', 'itu', 'atau', 'ke', 'di', 'dari', 'untuk',
  'dengan', 'adalah', 'ada', 'apa', 'saya', 'aku', 'the', 'and', 'for', 'with'
]);

export class KnowledgeService {
  /**
   * @param {Object} [deps] - serviceManager (client) atau { supabaseClient, eventBus } (Deno/Edge)
   */
  constructor(deps = {}) {
    // Dukung ServiceManager pattern di client (Kernel.js) atau options object di Deno
    if (deps && typeof deps.get === 'function') {
      this.serviceManager = deps;
      this.eventBus = deps.has('EventBus') ? deps.get('EventBus') : null;
      this.supabaseClient = null;
    } else {
      this.serviceManager = null;
      this.eventBus = deps?.eventBus || null;
      this.supabaseClient = deps?.supabaseClient || null;
    }
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    if (this.eventBus?.emit) {
      this.eventBus.emit('Knowledge:Ready', { status: 'READY', timestamp: Date.now() });
    }
    console.log('[KnowledgeService] Initialized and Ready');
  }

  /**
   * Helper: ekstraksi kata kunci bermakna dari query.
   * @param {string} query
   * @param {number} [maxKeywords=5]
   * @returns {string[]}
   */
  _extractKeywords(query = '', maxKeywords = 5) {
    if (!query || typeof query !== 'string') return [];
    return query
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^\w\s-]/g, '').trim())
      .filter(w => w.length > 2 && !DEFAULT_STOPWORDS.has(w))
      .slice(0, maxKeywords);
  }

  /**
   * Helper: resolve supabaseClient dari options, instance, atau dynamic import (browser fallback).
   * @private
   */
  async _resolveSupabaseClient(options = {}) {
    if (options.supabaseClient) return options.supabaseClient;
    if (this.supabaseClient) return this.supabaseClient;

    // Fallback khusus lingkungan browser jika serviceManager tersedia
    if (typeof window !== 'undefined') {
      try {
        const { supabase } = await import('../../../supabase.js');
        return supabase;
      } catch (e) {
        console.warn('[KnowledgeService] Browser supabase import fallback failed:', e.message);
      }
    }
    return null;
  }

  /**
   * Melakukan kueri pencarian ke document_chunks.
   *
   * @param {string} query - Query teks pencarian
   * @param {Object} [options]
   * @param {Object} [options.supabaseClient] - Klien Supabase (wajib di Deno / Edge Function)
   * @param {string} [options.userId]         - Filter user_id (opsional)
   * @param {string} [options.spaceId]        - Filter space_id (opsional)
   * @param {number} [options.limit=10]       - Jumlah maksimal candidate chunks
   * @returns {Promise<Array<{ id: any, document_id: any, content: string, source_url: string|null, source_type: string, similarity: number }>>}
   */
  async queryKnowledge(query, options = {}) {
    const supabase = await this._resolveSupabaseClient(options);
    if (!supabase) {
      console.warn('[KnowledgeService] Supabase client tidak tersedia untuk queryKnowledge');
      return [];
    }

    const limit = options.limit || 10;
    const keywords = this._extractKeywords(query, 5);

    console.log(`[KnowledgeService] Querying document_chunks for: "${query}" (keywords: ${keywords.join(', ') || 'none'})`);

    let result = [];
    try {
      let dbQuery = supabase
        .from('document_chunks')
        .select('id, document_id, content, source_url, source_type');

      if (keywords.length > 0) {
        const filterStr = keywords.map(k => `content.ilike.%${k}%`).join(',');
        dbQuery = dbQuery.or(filterStr);
      } else {
        const sanitizedQuery = (query || '').replace(/[%_"'(),\\]/g, ' ').replace(/\s+/g, ' ').trim();
        if (sanitizedQuery.length > 0) {
          dbQuery = dbQuery.ilike('content', `%${sanitizedQuery}%`);
        } else {
          return [];
        }
      }

      const { data, error } = await dbQuery.limit(limit);

      if (error) {
        console.warn('[KnowledgeService] Query document_chunks error:', error.message);
        result = [];
      } else if (data && data.length > 0) {
        // Normalisasi ke format kontrak standar Array<ChunkObject>
        result = data.map((chunk, idx) => ({
          id: chunk.id,
          document_id: chunk.document_id || 'unknown',
          content: chunk.content || '',
          source_url: chunk.source_url || null,
          source_type: chunk.source_type || 'local',
          similarity: typeof chunk.similarity === 'number'
            ? chunk.similarity
            : Math.max(0.3, 0.7 - (idx * 0.05)) // keyword rank approximation
        }));
      }
    } catch (err) {
      console.error('[KnowledgeService] Error querying document_chunks:', err.message);
      result = [];
    }

    if (this.eventBus?.emit) {
      this.eventBus.emit('Knowledge:QueryResult', { query, resultCount: result.length });
    }

    return result;
  }

  /**
   * Mengindeks dokumen baru ke tabel documents.
   * @param {Object} doc - { title, content, user_id, space_id, source_url, source_type }
   * @param {Object} [options]
   * @param {Object} [options.supabaseClient]
   * @returns {Promise<{ success: boolean, docId: string|null }>}
   */
  async indexDocument(doc, options = {}) {
    const supabase = await this._resolveSupabaseClient(options);
    if (!supabase) {
      console.warn('[KnowledgeService] Supabase client tidak tersedia untuk indexDocument');
      return { success: false, docId: null };
    }

    console.log(`[KnowledgeService] Indexing document: ${doc.title || 'Untitled'}`);
    let success = false;
    let newDocId = doc.id || null;

    try {
      let userId = doc.user_id;
      if (!userId && typeof supabase.auth?.getSession === 'function') {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id;
      }

      const payload = {
        title: doc.title || 'Untitled',
        user_id: userId || null,
        space_id: doc.space_id || null,
        source_url: doc.source_url || null,
        source_type: doc.source_type || 'manual_entry'
      };

      const { data, error } = await supabase
        .from('documents')
        .insert([payload])
        .select('id')
        .single();

      if (error) throw error;
      if (data?.id) newDocId = data.id;
      success = true;
    } catch (err) {
      console.error('[KnowledgeService] Error indexing document:', err.message);
    }

    if (this.eventBus?.emit) {
      this.eventBus.emit('Knowledge:Indexed', { docId: newDocId, success });
    }
    return { success, docId: newDocId };
  }
}

export default KnowledgeService;
