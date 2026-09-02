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
import { InternalKnowledgeFallbackService } from './InternalKnowledgeFallbackService.js';

export class RetrievalOrchestrator {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.knowledgeService = null;
    this.retrievalStrategyService = null;
    this.internalKnowledgeFallbackService = null;
    this.eventBus = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    if (this.serviceManager) {
      this.eventBus = this.serviceManager.has('EventBus') ? this.serviceManager.get('EventBus') : null;
      this.knowledgeService = this.serviceManager.has('KnowledgeService') ? this.serviceManager.get('KnowledgeService') : null;
      this.retrievalStrategyService = this.serviceManager.has('RetrievalStrategyService') ? this.serviceManager.get('RetrievalStrategyService') : null;
      this.internalKnowledgeFallbackService = this.serviceManager.has('InternalKnowledgeFallbackService') ? this.serviceManager.get('InternalKnowledgeFallbackService') : null;
    }

    if (!this.retrievalStrategyService) {
      this.retrievalStrategyService = new RetrievalStrategyService(this.serviceManager);
      await this.retrievalStrategyService.initialize();
    }

    if (!this.internalKnowledgeFallbackService) {
      this.internalKnowledgeFallbackService = new InternalKnowledgeFallbackService(this.serviceManager);
      await this.internalKnowledgeFallbackService.initialize();
    }

    this.isInitialized = true;
    console.log('[RetrievalOrchestrator] Initialized (PR#9: Tier 1 Active, Tier 2 Active, Tier 3 Reserved)');
  }

  /**
   * Main Entry Point: Eksekusi retrieval pengetahuan multi-tier.
   *
   * @param {string} query - Pesan/pertanyaan yang membutuhkan konteks pengetahuan
   * @param {Object} [options]
   * @param {number} [options.limit=5]
   * @param {string} [options.traceId]
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

    let tier1Result = null;

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

      tier1Result = { chunks: rawChunks, strategy: 'passthrough', sufficiency: 0.5, caseType: 'NONE', tier: 1, isFallback: false };
      if (strat && rawChunks.length > 0) {
        tier1Result = await strat.apply(rawChunks, options.supabaseClient);
        tier1Result.isFallback = false;
      } else if (rawChunks.length === 0) {
        tier1Result = { chunks: [], strategy: 'empty', sufficiency: 0.0, caseType: 'NONE', tier: 1, isFallback: false };
      }

      // Jika Tier 1 CUKUP (sufficiency >= 0.4 dan ada chunks), kembalikan langsung Tier 1
      if (tier1Result.sufficiency >= SUFFICIENCY_THRESHOLD && tier1Result.chunks && tier1Result.chunks.length > 0) {
        const formattedContext = this.formatAsContext(tier1Result.chunks);

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
      }
    } catch (err) {
      console.warn('[RetrievalOrchestrator] Tier 1 retrieval failed:', err.message);

      if (this.eventBus?.emit) {
        this.eventBus.emit('Retrieval:Failed', { tier: 1, error: err.message });
      }

      tier1Result = {
        chunks: [],
        strategy: 'failed',
        sufficiency: 0.0,
        tier: 1,
        isFallback: true,
        error: err.message
      };
    }

    // ========================================================
    // TIER 2: INTERNAL LLM FALLBACK (Fase 2)
    // Pemicu: sufficiency < 0.4 ATAU 0 chunks ATAU Tier 1 error
    // ========================================================
    console.log(`[RetrievalOrchestrator] Tier 1 insufficient (sufficiency: ${tier1Result?.sufficiency ?? 0.0}). Switching to Tier 2 (InternalKnowledgeFallbackService)...`);

    try {
      const fallbackService = this.internalKnowledgeFallbackService || (this.serviceManager?.has('InternalKnowledgeFallbackService') ? this.serviceManager.get('InternalKnowledgeFallbackService') : null);

      if (fallbackService && typeof fallbackService.buildFallbackContext === 'function') {
        const tier2Result = await fallbackService.buildFallbackContext({
          query,
          tier1Result,
          traceId: options.traceId,
          options
        });

        const formattedContext = this.formatAsContext(tier2Result.chunks);

        if (this.eventBus?.emit) {
          this.eventBus.emit('Retrieval:Completed', {
            tier: 2,
            strategy: tier2Result.strategy,
            sufficiency: tier2Result.sufficiency,
            chunksCount: tier2Result.chunks.length
          });
        }

        return {
          ...tier2Result,
          formattedContext
        };
      }
    } catch (tier2Err) {
      console.error('[RetrievalOrchestrator] Tier 2 fallback error:', tier2Err.message);
    }

    // Fallback Darurat jika Tier 2 gagal
    return {
      chunks: [],
      formattedContext: '',
      strategy: 'fallback_error',
      sufficiency: 0.0,
      tier: 2,
      isFallback: true,
      error: 'Tier 1 & Tier 2 fallback failed'
    };
  }

  /**
   * Helper: Format chunks ke string markdown prompt LLM sesuai PR#9 §3 (atribusi sumber transparan).
   * @param {Array} chunks
   * @returns {string}
   */
  formatAsContext(chunks) {
    if (!chunks || chunks.length === 0) return '';
    return chunks.map((c, i) => {
      const sourceType = c.source_type || 'local';
      let header = `--- Konteks ${i + 1} [Sumber: Lokal — ${c.source_url || 'Arsip Dokumen'}] ---`;

      if (sourceType === 'llm_internal') {
        header = `--- Konteks ${i + 1} [Sumber: Pengetahuan internal model] ---`;
      } else if (sourceType === 'web') {
        header = `--- Konteks ${i + 1} [Sumber: Web — ${c.source_url || 'Web Search'}, akurasi tidak terverifikasi] ---`;
      }

      return `${header}\n${c.content}`;
    }).join('\n\n');
  }
}

export default RetrievalOrchestrator;
