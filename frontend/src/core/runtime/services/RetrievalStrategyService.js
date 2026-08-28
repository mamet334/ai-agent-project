/**
 * RetrievalStrategyService.js — Adaptive Retrieval Strategy (PR#5)
 *
 * Layer retrieval cerdas sebelum context dikirim ke LLM.
 * Mendeteksi otomatis Kasus A (dokumen besar tunggal) vs Kasus B (multi-dokumen)
 * berdasarkan distribusi top-K similarity results.
 *
 * Kasus A (dokumen besar):
 *   1. Neighbor expansion — ikut ambil chunk tetangga (sebelum/sesudah)
 *   2. Fallback full-read — baca dokumen sumber utuh jika masih tidak cukup
 *
 * Kasus B (multi-dokumen):
 *   1. Max N chunk per dokumen — cegah satu sumber mendominasi
 *   2. Diversity-aware — prioritaskan keberagaman sumber
 *
 * Prasyarat: PR#4 (source_type / source_url) agar bisa identifikasi origin chunk.
 *
 * Integrasi: Kernel Phase 3 → AssistantService.processMessage()
 */

// Threshold: jika >60% top-K chunk berasal dari 1 dokumen → Kasus A
const CASE_A_DOMINANCE_THRESHOLD = 0.6;

// Max chunk per dokumen untuk Kasus B (diversity)
const MAX_CHUNKS_PER_DOC_CASE_B = 3;

export class RetrievalStrategyService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this._initialized = false;
  }

  async initialize() {
    this._initialized = true;
    console.log('[RetrievalStrategyService] Initialized');
  }

  // =============================================
  // CORE: Deteksi kasus dan apply strategi
  // =============================================

  /**
   * Entry point utama — panggil setelah similarity search awal.
   *
   * @param {Array} topKChunks - hasil similarity search (array of chunk objects)
   *   Setiap chunk: { id, document_id, content, source_url, source_type, similarity }
   * @param {Object} supabaseClient - Supabase client untuk fallback full-read
   * @returns {Promise<{ chunks: Array, strategy: string, caseType: 'A'|'B'|'NONE' }>}
   */
  async apply(topKChunks, supabaseClient) {
    if (!topKChunks || topKChunks.length === 0) {
      return { chunks: [], strategy: 'empty', caseType: 'NONE' };
    }

    const caseType = this._detectCase(topKChunks);
    console.log(`[RetrievalStrategy] Detected case: ${caseType} (${topKChunks.length} chunks)`);

    if (caseType === 'A') {
      const result = await this._handleCaseA(topKChunks, supabaseClient);
      return { ...result, caseType: 'A' };
    }

    if (caseType === 'B') {
      const result = this._handleCaseB(topKChunks);
      return { ...result, caseType: 'B' };
    }

    return { chunks: topKChunks, strategy: 'passthrough', caseType: 'NONE' };
  }

  // =============================================
  // DETEKSI KASUS
  // =============================================

  /**
   * Deteksi Kasus A vs B berdasarkan distribusi document_id.
   * @param {Array} chunks
   * @returns {'A'|'B'|'NONE'}
   */
  _detectCase(chunks) {
    if (chunks.length <= 1) return 'NONE';

    // Hitung frekuensi tiap document_id
    const docFreq = {};
    for (const chunk of chunks) {
      const docId = chunk.document_id || 'unknown';
      docFreq[docId] = (docFreq[docId] || 0) + 1;
    }

    const docIds = Object.keys(docFreq);

    // Hanya 1 dokumen → Kasus A (trivial)
    if (docIds.length === 1) return 'A';

    // Cek apakah ada satu dokumen yang mendominasi
    const maxFreq = Math.max(...Object.values(docFreq));
    const dominanceRatio = maxFreq / chunks.length;

    if (dominanceRatio >= CASE_A_DOMINANCE_THRESHOLD) return 'A';
    return 'B';
  }

  // =============================================
  // KASUS A — Dokumen Besar
  // =============================================

  /**
   * Handle Kasus A: neighbor expansion + fallback full-read.
   * @param {Array} chunks
   * @param {*} supabaseClient
   * @returns {Promise<{ chunks: Array, strategy: string }>}
   */
  async _handleCaseA(chunks, supabaseClient) {
    // Ambil document_id yang dominan
    const docFreq = {};
    for (const chunk of chunks) {
      const docId = chunk.document_id || 'unknown';
      docFreq[docId] = (docFreq[docId] || 0) + 1;
    }
    const dominantDocId = Object.entries(docFreq).sort((a, b) => b[1] - a[1])[0][0];

    // Step 1: Neighbor expansion — ambil semua chunk dari dokumen yang sama
    let expandedChunks = chunks;
    if (supabaseClient && dominantDocId !== 'unknown') {
      try {
        const { data: allChunks, error } = await supabaseClient
          .from('document_chunks')
          .select('id, document_id, content, source_url, source_type')
          .eq('document_id', dominantDocId)
          .order('id', { ascending: true }); // Asumsikan id berurutan

        if (!error && allChunks && allChunks.length > 0) {
          console.log(`[RetrievalStrategy] Case A: neighbor expansion → ${allChunks.length} chunks dari doc ${dominantDocId}`);
          expandedChunks = allChunks;

          // Jika masih <3 chunk (dokumen kecil) → tidak perlu full-read
          if (allChunks.length >= 3) {
            return { chunks: expandedChunks, strategy: 'case_a_neighbor_expansion' };
          }
        }
      } catch (err) {
        console.warn('[RetrievalStrategy] Neighbor expansion gagal:', err.message);
      }
    }

    // Step 2: Fallback full-read — baca content dokumen sumber utuh
    if (supabaseClient && dominantDocId !== 'unknown') {
      try {
        const { data: doc, error } = await supabaseClient
          .from('documents')
          .select('id, title, content, source_url, source_type')
          .eq('id', dominantDocId)
          .single();

        if (!error && doc?.content) {
          console.log(`[RetrievalStrategy] Case A: fallback full-read → doc "${doc.title}"`);
          // Bungkus full content sebagai satu chunk virtual
          return {
            chunks: [{
              id: `fullread_${doc.id}`,
              document_id: doc.id,
              content: doc.content,
              source_url: doc.source_url,
              source_type: doc.source_type,
              _isFullRead: true
            }],
            strategy: 'case_a_full_read'
          };
        }
      } catch (err) {
        console.warn('[RetrievalStrategy] Full-read fallback gagal:', err.message);
      }
    }

    return { chunks: expandedChunks, strategy: 'case_a_passthrough' };
  }

  // =============================================
  // KASUS B — Multi-dokumen
  // =============================================

  /**
   * Handle Kasus B: max N chunk per dokumen + diversity-aware ordering.
   * @param {Array} chunks
   * @returns {{ chunks: Array, strategy: string }}
   */
  _handleCaseB(chunks) {
    const perDocCount = {};
    const diverse = [];

    // Sort by similarity DESC dulu (jaga kualitas)
    const sorted = [...chunks].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    for (const chunk of sorted) {
      const docId = chunk.document_id || 'unknown';
      const count = perDocCount[docId] || 0;

      if (count < MAX_CHUNKS_PER_DOC_CASE_B) {
        diverse.push(chunk);
        perDocCount[docId] = count + 1;
      }
      // Lewati chunk dari dokumen yang sudah mencapai batas
    }

    console.log(`[RetrievalStrategy] Case B: diversity → ${diverse.length}/${chunks.length} chunks (max ${MAX_CHUNKS_PER_DOC_CASE_B}/doc)`);
    return { chunks: diverse, strategy: 'case_b_diversity' };
  }

  // =============================================
  // HELPER: Format chunks menjadi context string
  // =============================================

  /**
   * Format array chunks menjadi string context siap dikirim ke LLM.
   * Menyertakan source_url jika ada (transparansi sumber).
   *
   * @param {Array} chunks
   * @returns {string}
   */
  formatAsContext(chunks) {
    if (!chunks || chunks.length === 0) return '';

    return chunks.map((chunk, i) => {
      const sourceInfo = chunk.source_url ? `[Sumber: ${chunk.source_url}]` : '';
      const fullReadNote = chunk._isFullRead ? '[Full document read]' : '';
      return `--- Konteks ${i + 1} ${sourceInfo}${fullReadNote} ---\n${chunk.content}`;
    }).join('\n\n');
  }
}
