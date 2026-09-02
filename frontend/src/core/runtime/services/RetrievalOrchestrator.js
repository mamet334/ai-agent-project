/**
 * RetrievalOrchestrator.js — 3-Tier Knowledge Retrieval Orchestrator (PR#9)
 *
 * Mengatur orkestrasi pencarian pengetahuan berjenjang (3-Tier):
 * - Tier 1: Lokal (document_chunks / documents via RetrievalStrategyService / Edge Function)
 * - Tier 2: LLM Internal Fallback (Fase 2)
 * - Tier 3: Web Search Comparison (Fase 3, wajib konfirmasi Owner)
 *
 * Di Fase 1: Berperan sebagai kerangka bersih yang membungkus pemanggilan Tier 1
 * dan menyediakan interface seragam bagi AssistantService.js agar tidak terjadi
 * penumpukan logika (anti-God File).
 */

import { SUFFICIENCY_THRESHOLD, RetrievalStrategyService } from './RetrievalStrategyService.js';

export class RetrievalOrchestrator {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.knowledgeService = null;
    this.retrievalStrategyService = null;
    this.eventBus = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    if (this.serviceManager) {
      this.eventBus = this.serviceManager.has('EventBus') ? this.serviceManager.get('EventBus') : null;
      this.knowledgeService = this.serviceManager.has('KnowledgeService') ? this.serviceManager.get('KnowledgeService') : null;
      this.retrievalStrategyService = this.serviceManager.has('RetrievalStrategyService') ? this.serviceManager.get('RetrievalStrategyService') : null;
    }

    if (!this.retrievalStrategyService) {
      this.retrievalStrategyService = new RetrievalStrategyService(this.serviceManager);
      await this.retrievalStrategyService.initialize();
    }

    this.isInitialized = true;
    console.log('[RetrievalOrchestrator] Initialized (Fase 1: Tier 1 Active, Tier 2/3 Reserved)');
  }

  /**
   * Main Entry Point: Eksekusi retrieval pengetahuan multi-tier.
   *
   * @param {string} query - Pesan/pertanyaan yang membutuhkan konteks pengetahuan
   * @param {Object} [options]
   * @param {number} [options.limit=5]
   * @param {Object} [options.supabaseClient]
   * @returns {Promise<{
   *   chunks: Array<Object>,
   *   formattedContext: string,
   *   strategy: string,
   *   sufficiency: number,
   *   tier: 1|2|3,
   *   isFallback: boolean,
   *   error?: string
   * }>}
   */
  async retrieve(query, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return {
        chunks: [],
        formattedContext: '',
        strategy: 'empty',
        sufficiency: 0.0,
        tier: 1,
        isFallback: false
      };
    }

    console.log(`[RetrievalOrchestrator] Starting knowledge retrieval for: "${query.substring(0, 60)}..."`);

    // ========================================================
    // TIER 1: LOKAL (KnowledgeService + RetrievalStrategyService)
    // ========================================================
    try {
      const ks = this.knowledgeService || (this.serviceManager?.has('KnowledgeService') ? this.serviceManager.get('KnowledgeService') : null);
      const strat = this.retrievalStrategyService || (this.serviceManager?.has('RetrievalStrategyService') ? this.serviceManager.get('RetrievalStrategyService') : null);

      let rawChunks = [];
      if (ks) {
        rawChunks = await ks.queryKnowledge(query, {
          supabaseClient: options.supabaseClient,
          limit: options.limit || 10
        });
      }

      let tier1Result = { chunks: rawChunks, strategy: 'passthrough', sufficiency: 0.5, caseType: 'NONE', tier: 1 };
      if (strat && rawChunks.length > 0) {
        tier1Result = await strat.apply(rawChunks, options.supabaseClient);
      } else if (rawChunks.length === 0) {
        tier1Result = { chunks: [], strategy: 'empty', sufficiency: 0.0, caseType: 'NONE', tier: 1 };
      }

      const formattedContext = strat ? strat.formatAsContext(tier1Result.chunks) : '';

      if (this.eventBus?.emit) {
        this.eventBus.emit('Retrieval:Completed', {
          tier: 1,
          strategy: tier1Result.strategy,
          sufficiency: tier1Result.sufficiency,
          chunksCount: tier1Result.chunks.length
        });
      }

      return {
        chunks: tier1Result.chunks,
        formattedContext,
        strategy: tier1Result.strategy,
        caseType: tier1Result.caseType,
        sufficiency: tier1Result.sufficiency,
        tier: 1,
        isFallback: false
      };
    } catch (err) {
      console.warn('[RetrievalOrchestrator] Tier 1 retrieval failed, applying fallback:', err.message);

      if (this.eventBus?.emit) {
        this.eventBus.emit('Retrieval:Failed', { tier: 1, error: err.message });
      }

      // Explicit Fallback Result
      return {
        chunks: [],
        formattedContext: '',
        strategy: 'failed',
        sufficiency: 0.0,
        tier: 1,
        isFallback: true,
        error: err.message
      };
    }

    // ========================================================
    // TIER 2 & TIER 3 (Slot cadangan untuk Fase 2 & 3)
    // ========================================================
    // if (tier1Result.sufficiency < SUFFICIENCY_THRESHOLD) {
    //   // Tier 2: Internal LLM Fallback (Fase 2)
    //   // Tier 3: Web Comparison with Owner Confirmation (Fase 3)
    // }
  }

  /**
   * Helper: Format chunks ke string markdown prompt LLM.
   * @param {Array} chunks
   * @returns {string}
   */
  formatAsContext(chunks) {
    if (!chunks || chunks.length === 0) return '';
    if (this.retrievalStrategyService) {
      return this.retrievalStrategyService.formatAsContext(chunks);
    }
    return chunks.map((c, i) => `--- Konteks ${i + 1} [Sumber: ${c.source_url || 'Lokal'}] ---\n${c.content}`).join('\n\n');
  }
}

export default RetrievalOrchestrator;
