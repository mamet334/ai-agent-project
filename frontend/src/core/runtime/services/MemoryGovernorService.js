import { supabase } from '../../../supabase.js';

/**
 * MemoryGovernorService — Anti-Bias & Memory Maintenance (Fase 1)
 *
 * Tujuan:
 * - Mencegah AI menjadi bias akibat "ringkasan dari ringkasan".
 * - Golden Source: Data mentah (raw content) disimpan di tabel terpisah
 *   (`raw_memory_content`). Ringkasan hanya pointer/metadata ke raw content.
 * - Verifikasi Otomatis: Saat sesi Engineering berakhir, membandingkan ringkasan
 *   lama dengan raw content. Jika file/konteks asli berubah, panggil AI murah
 *   untuk membuat ulang ringkasan.
 * - Metadata Wajib: Setiap memori/ringkasan memiliki tag:
 *   `source_reference`, `timestamp`, `version_code`, `chat_id`.
 *
 * Backward Compatibility:
 * - Semua kolom baru di `user_memories` nullable → data lama tanpa metadata
 *   tetap berfungsi dan tidak crash.
 * - `raw_content_id` null ditangani dengan fallback regenerasi langsung.
 */
export class MemoryGovernorService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.eventBus.emit('MemoryGovernor:Ready', { status: 'READY', timestamp: Date.now() });
    console.log('[MemoryGovernorService] Initialized and Ready');
  }

  /**
   * Menghasilkan hash sederhana dari sebuah string (deterministik).
   * Digunakan untuk membandingkan apakah raw content berubah.
   * @param {string} content
   * @returns {string} hash 32-hex
   */
  _computeHash(content) {
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    // Return hex (deterministic)
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Mendapatkan BrainService untuk memanggil AI murah (regenerasi ringkasan).
   * @returns {Object|null} BrainService instance
   */
  _getBrainService() {
    try {
      return this.serviceManager.has('BrainService')
        ? this.serviceManager.get('BrainService')
        : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Menyimpan Golden Memory: raw content ke `raw_memory_content` + ringkasan
   * ke `user_memories` (dengan metadata golden source).
   *
   * @param {Object} params
   * @param {string} params.user_id
   * @param {string} params.content     - Raw content (golden source)
   * @param {string} [params.summary]   - Ringkasan (opsional, default dari content)
   * @param {string} [params.source_type] - 'fact' | 'preference' | 'location' | 'engineer_session'
   * @param {string} [params.source_reference] - Reference ke file/sumber asli
   * @param {string} [params.chat_id]   - Chat ID terkait
   * @param {string} [params.version_code] - Kode versi
   * @returns {Promise<Object|null>} inserted memory row atau null
   */
  async storeGoldenMemory({ user_id, content, summary, source_type = 'fact', source_reference, chat_id, version_code }) {
    if (!this.isInitialized) throw new Error('MemoryGovernorService not initialized');
    if (!user_id) throw new Error('MemoryGovernorService: user_id required');
    if (!content) throw new Error('MemoryGovernorService: content required');

    const contentHash = this._computeHash(content);
    const resolvedSummary = summary || (typeof content === 'string' ? content.substring(0, 500) : JSON.stringify(content));

    try {
      // 1. INSERT raw content ke tabel golden source
      const { data: rawRow, error: rawError } = await supabase
        .from('raw_memory_content')
        .insert([{
          user_id,
          content: typeof content === 'object' ? JSON.stringify(content) : content,
          content_hash: contentHash,
          source_type,
          source_reference: source_reference || null,
          chat_id: chat_id || null,
          version_code: version_code || null
        }])
        .select('id')
        .single();

      if (rawError) {
        console.error('[MemoryGovernorService] Gagal menyimpan raw content:', rawError.message);
        return null;
      }

      // 2. INSERT / UPDATE summary di user_memories dengan metadata
      const { data: memRow, error: memError } = await supabase
        .from('user_memories')
        .insert([{
          user_id,
          summary: resolvedSummary,
          memory_type: source_type,
          confidence: 1.0,
          source: 'MemoryGovernorService',
          raw_content_id: rawRow.id,
          source_reference: source_reference || null,
          version_code: version_code || null,
          chat_id: chat_id || null,
          last_verified_at: new Date().toISOString()
        }])
        .select('id')
        .single();

      if (memError) {
        console.error('[MemoryGovernorService] Gagal menyimpan summary:', memError.message);
        return null;
      }

      this.eventBus.emit('MemoryGovernor:Stored', {
        memoryId: memRow.id,
        rawContentId: rawRow.id,
        source_reference,
        timestamp: new Date().toISOString()
      });

      console.log('[MemoryGovernorService] Golden memory stored:', memRow.id, 'raw:', rawRow.id);
      return memRow;
    } catch (err) {
      console.error('[MemoryGovernorService] storeGoldenMemory error:', err);
      return null;
    }
  }

  /**
   * Memverifikasi sebuah ringkasan terhadap raw content-nya.
   * Jika raw content berubah (hash berbeda), panggil AI murah untuk regenerasi.
   *
   * @param {string} memoryId - ID memori di user_memories
   * @returns {Promise<Object>} { status: 'UNCHANGED'|'REGENERATED'|'NO_RAW'|'ERROR', memoryId }
   */
  async verifyMemorySummary(memoryId) {
    if (!this.isInitialized) throw new Error('MemoryGovernorService not initialized');

    try {
      // Ambil ringkasan + raw_content_id
      const { data: mem, error: memErr } = await supabase
        .from('user_memories')
        .select('id, summary, raw_content_id, source_reference, version_code, chat_id')
        .eq('id', memoryId)
        .single();

      if (memErr || !mem) {
        console.error('[MemoryGovernorService] verifyMemorySummary: memori tidak ditemukan', memErr?.message);
        return { status: 'ERROR', memoryId, message: 'memory_not_found' };
      }

      // Data lama tanpa raw_content_id → tidak punya golden source
      if (!mem.raw_content_id) {
        return { status: 'NO_RAW', memoryId, message: 'no_raw_content_reference' };
      }

      // Ambil raw content
      const { data: raw, error: rawErr } = await supabase
        .from('raw_memory_content')
        .select('id, content, content_hash')
        .eq('id', mem.raw_content_id)
        .single();

      if (rawErr || !raw) {
        console.error('[MemoryGovernorService] verifyMemorySummary: raw content tidak ditemukan', rawErr?.message);
        return { status: 'ERROR', memoryId, message: 'raw_content_not_found' };
      }

      // Hitung ulang hash dari raw content saat ini
      const currentHash = this._computeHash(raw.content);
      if (currentHash === raw.content_hash) {
        // Tidak berubah → aman
        return { status: 'UNCHANGED', memoryId, message: 'content_unchanged' };
      }

      // Berubah → regenerasi ringkasan dengan AI murah
      const newSummary = await this._regenerateSummary(raw.content, mem.source_reference);
      if (!newSummary) {
        return { status: 'ERROR', memoryId, message: 'regeneration_failed' };
      }

      // Update ringkasan + hash baru + timestamp
      const { error: updErr } = await supabase
        .from('user_memories')
        .update({
          summary: newSummary,
          last_verified_at: new Date().toISOString()
        })
        .eq('id', memoryId);

      if (updErr) {
        console.error('[MemoryGovernorService] verifyMemorySummary: update gagal', updErr.message);
        return { status: 'ERROR', memoryId, message: 'update_failed' };
      }

      // Update hash raw sebagai sinkronisasi (menandai sudah diverifikasi)
      await supabase
        .from('raw_memory_content')
        .update({ content_hash: currentHash })
        .eq('id', raw.id);

      this.eventBus.emit('MemoryGovernor:SummaryRegenerated', {
        memoryId,
        source_reference: mem.source_reference,
        timestamp: new Date().toISOString()
      });

      console.log('[MemoryGovernorService] Summary regenerated untuk memory:', memoryId);
      return { status: 'REGENERATED', memoryId, message: 'summary_regenerated' };
    } catch (err) {
      console.error('[MemoryGovernorService] verifyMemorySummary error:', err);
      return { status: 'ERROR', memoryId, message: err.message };
    }
  }

  /**
   * Memverifikasi sesi Engineering: mengiterasi file yang dimodifikasi di
   * SessionArtifact dan memastikan ringkasan memori tetap sinkron dengan
   * versi file yang berubah.
   *
   * @param {Object} sessionArtifact - Instance SessionArtifact dari Engineer
   * @returns {Promise<Object>} hasil verifikasi
   */
  async verifyEngineeringSession(sessionArtifact) {
    if (!this.isInitialized) throw new Error('MemoryGovernorService not initialized');
    if (!sessionArtifact) {
      return { status: 'NO_SESSION', verified: 0, regenerated: 0 };
    }

    const modifiedFiles = sessionArtifact.modifiedFiles || [];
    const results = [];

    // Untuk setiap file yang dimodifikasi, cari memori yang mereferensikannya
    for (const filePath of modifiedFiles) {
      try {
        const { data: memories, error } = await supabase
          .from('user_memories')
          .select('id, summary, source_reference, raw_content_id')
          .eq('source_reference', filePath);

        if (error) {
          // source_reference mungkin belum ada di DB (data lama) → skip
          continue;
        }

        for (const mem of memories || []) {
          const result = await this.verifyMemorySummary(mem.id);
          results.push(result);
        }
      } catch (e) {
        console.warn('[MemoryGovernorService] verifyEngineeringSession file error:', filePath, e.message);
      }
    }

    const regenerated = results.filter(r => r.status === 'REGENERATED').length;
    const unchanged = results.filter(r => r.status === 'UNCHANGED').length;

    this.eventBus.emit('MemoryGovernor:SessionVerified', {
      verified: results.length,
      regenerated,
      unchanged,
      timestamp: new Date().toISOString()
    });

    console.log(`[MemoryGovernorService] Sesi diverifikasi: ${results.length} memori, ${regenerated} regenerated`);
    return { status: 'DONE', verified: results.length, regenerated, unchanged };
  }

  /**
   * Memanggil AI murah untuk membuat ulang ringkasan dari raw content.
   * Jika BrainService tidak tersedia, fallback ke ringkasan deterministik.
   *
   * @param {string} rawContent
   * @param {string|null} sourceReference
   * @returns {Promise<string|null>} ringkasan baru atau null
   */
  async _regenerateSummary(rawContent, sourceReference) {
    const brainService = this._getBrainService();

    if (brainService && typeof brainService.executeLLM === 'function') {
      try {
        const prompt = `Buat ringkasan singkat (maks 200 kata) dari konten berikut yang berasal dari "${sourceReference || 'sumber'}", fokus pada fakta penting tanpa mengubah makna:\n\n${rawContent}`;
        const result = await brainService.executeLLM(prompt, { model: 'cheap' });
        if (result && typeof result === 'string' && result.trim().length > 0) {
          return result.trim().substring(0, 500);
        }
      } catch (e) {
        console.warn('[MemoryGovernorService] AI murah gagal, fallback deterministik:', e.message);
      }
    }

    // Fallback deterministik
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    return content.substring(0, 200);
  }
}

export default MemoryGovernorService;
