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
  // Kata hubung & partikel dasar
  'dan', 'yang', 'ini', 'itu', 'atau', 'ke', 'di', 'dari', 'untuk',
  'dengan', 'adalah', 'ada', 'apa', 'saya', 'aku', 'the', 'and', 'for', 'with',
  // Conversational prompt filler & kata tanya umum
  'berdasarkan', 'menurut', 'sesuai', 'dokumen', 'berkas', 'file', 'arsip',
  'upload', 'diupload', 'tolong', 'coba', 'mohon', 'bantu', 'jelaskan',
  'sebutkan', 'rincikan', 'uraikan', 'ceritakan', 'apakah', 'adakah',
  'bisakah', 'bolehkah', 'bagaimana', 'kenapa', 'mengapa', 'siapa',
  'mana', 'kapan', 'tentang', 'terkait', 'mengenai', 'dalam', 'atas',
  'pada', 'sudah', 'telah', 'akan', 'bisa', 'dapat', 'harus', 'wajib',
  'info', 'informasi', 'data', 'anda', 'kamu', 'kita', 'kami', 'punya', 'milik'
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
   * @param {number} [maxKeywords=8]
   * @returns {string[]}
   */
  _extractKeywords(query = '', maxKeywords = 8) {
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
    if (this.serviceManager?.has('SupabaseClient')) {
      return this.serviceManager.get('SupabaseClient');
    }
    return null;
  }

  /**
   * Melakukan kueri pencarian ke document_chunks dengan Smart Title-Aware Matching.
   *
   * @param {string} query - Query teks pencarian
   * @param {Object} [options]
   * @param {Object} [options.supabaseClient] - Klien Supabase (wajib di Deno / Edge Function)
   * @param {string} [options.userId]         - Filter user_id (opsional)
   * @param {string} [options.spaceId]        - Filter space_id (opsional)
   * @param {number} [options.limit=15]       - Jumlah maksimal candidate chunks
   * @returns {Promise<Array<{ id: any, document_id: any, content: string, source_url: string|null, source_type: string, similarity: number }>>}
   */
  async queryKnowledge(query, options = {}) {
    const supabase = await this._resolveSupabaseClient(options);
    if (!supabase) {
      console.warn('[KnowledgeService] Supabase client tidak tersedia untuk queryKnowledge');
      return [];
    }

    const limit = options.limit || 15;
    const keywords = this._extractKeywords(query, 8);

    console.log(`[KnowledgeService] Querying knowledge for: "${query}" (keywords: ${keywords.join(', ') || 'none'})`);

    let result = [];
    try {
      // 1. TAHAP TITLE-AWARE MATCHING: Cek apakah ada dokumen dengan judul yang cocok
      let targetedDocIds = [];
      if (keywords.length > 0) {
        const titleFilterStr = keywords.map(k => `title.ilike.%${k}%`).join(',');
        let docQuery = supabase
          .from('documents')
          .select('id, title')
          .or(titleFilterStr)
          .limit(10);

        if (options.userId) docQuery = docQuery.eq('user_id', options.userId);
        if (options.spaceId) docQuery = docQuery.eq('space_id', options.spaceId);

        const { data: matchedDocs, error: docErr } = await docQuery;
        if (!docErr && matchedDocs && matchedDocs.length > 0) {
          // Beri skor kecocokan berdasarkan jumlah kata kunci yang muncul di judul
          const scoredDocs = matchedDocs.map(d => {
            const titleLower = (d.title || '').toLowerCase();
            const matchCount = keywords.reduce((acc, k) => acc + (titleLower.includes(k) ? 1 : 0), 0);
            return { ...d, matchCount };
          });
          scoredDocs.sort((a, b) => b.matchCount - a.matchCount);

          const bestCount = scoredDocs[0].matchCount;
          const topDocs = scoredDocs.filter(d => d.matchCount >= Math.max(1, bestCount - 1)).slice(0, 3);
          targetedDocIds = topDocs.map(d => d.id);
          console.log(`[KnowledgeService] Title match prioritized: ${topDocs.map(d => `${d.title} (hits: ${d.matchCount})`).join(', ')}`);
        }
      }

      // 2. TAHAP TARGETED CHUNKS: Ambil chunks dari dokumen prioritas
      if (targetedDocIds.length > 0) {
        let docChunksQuery = supabase
          .from('document_chunks')
          .select('id, document_id, content, source_url, source_type')
          .in('document_id', targetedDocIds);

        if (options.userId) docChunksQuery = docChunksQuery.eq('user_id', options.userId);
        if (options.spaceId) docChunksQuery = docChunksQuery.eq('space_id', options.spaceId);

        const { data: docChunks, error: docChunksErr } = await docChunksQuery.limit(limit);
        if (!docChunksErr && docChunks && docChunks.length > 0) {
          result = docChunks.map((chunk, idx) => ({
            id: chunk.id,
            document_id: chunk.document_id || 'unknown',
            content: chunk.content || '',
            source_url: chunk.source_url || null,
            source_type: chunk.source_type || 'local',
            similarity: Math.max(0.75, 0.95 - (idx * 0.02)) // High confidence for targeted title match
          }));
        }
      }

      // 3. TAHAP CONTENT SEARCH FALLBACK/SUPPLEMENT: Isi sisa slot dengan pencarian konten
      if (result.length < limit) {
        const remainingLimit = limit - result.length;
        let contentQuery = supabase
          .from('document_chunks')
          .select('id, document_id, content, source_url, source_type');

        if (targetedDocIds.length > 0) {
          contentQuery = contentQuery.not('document_id', 'in', `(${targetedDocIds.join(',')})`);
        }
        if (options.userId) contentQuery = contentQuery.eq('user_id', options.userId);
        if (options.spaceId) contentQuery = contentQuery.eq('space_id', options.spaceId);

        if (keywords.length > 0) {
          const filterStr = keywords.map(k => `content.ilike.%${k}%`).join(',');
          contentQuery = contentQuery.or(filterStr);
        } else {
          const sanitizedQuery = (query || '').replace(/[%_"'(),\\]/g, ' ').replace(/\s+/g, ' ').trim();
          if (sanitizedQuery.length > 0) {
            contentQuery = contentQuery.ilike('content', `%${sanitizedQuery}%`);
          } else {
            contentQuery = null;
          }
        }

        if (contentQuery) {
          const { data: contentData, error: contentErr } = await contentQuery.limit(remainingLimit * 2);
          if (!contentErr && contentData && contentData.length > 0) {
            const scored = contentData.map(c => {
              const text = (c.content || '').toLowerCase();
              const score = keywords.reduce((acc, k) => acc + (text.includes(k) ? 1 : 0), 0);
              return { ...c, matchScore: score };
            });
            scored.sort((a, b) => b.matchScore - a.matchScore);

            const added = scored.slice(0, remainingLimit).map((chunk, idx) => ({
              id: chunk.id,
              document_id: chunk.document_id || 'unknown',
              content: chunk.content || '',
              source_url: chunk.source_url || null,
              source_type: chunk.source_type || 'local',
              similarity: typeof chunk.similarity === 'number'
                ? chunk.similarity
                : Math.max(0.4, 0.7 - (idx * 0.03)) // Content ranking
            }));
            result = result.concat(added);
          }
        }
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
