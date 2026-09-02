/**
 * InternalKnowledgeFallbackService.js — Tier 2 Internal LLM Fallback (PR#9 Fase 2)
 *
 * Bertanggung jawab tunggal untuk menyediakan fallback pengetahuan internal LLM
 * ketika retrieval Tier 1 (Lokal) menghasilkan sufficiency < 0.4 atau 0 chunks.
 *
 * Prinsip:
 * - One File One Responsibility: Hanya mengurus Tier 2 payload, directive, dan event.
 * - Kejujuran Atribusi: Menginjeksi direktif eksplisit agar LLM mengakui bahwa
 *   jawabannya berasal dari pengetahuan umum model, bukan data lokal repositori.
 * - Kontrak Seragam: Mengembalikan struktur data seragam sesuai §3 PR#9.
 */

export const TIER2_FALLBACK_TIMEOUT_MS = 20000; // 20 detik timeout standar inferensi

export class InternalKnowledgeFallbackService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    if (this.serviceManager && this.serviceManager.has('EventBus')) {
      this.eventBus = this.serviceManager.get('EventBus');
    }

    this.isInitialized = true;
    console.log('[InternalKnowledgeFallbackService] Initialized & Ready (Tier 2 Active)');
  }

  /**
   * Membentuk payload konteks fallback Tier 2 untuk diteruskan ke LLM.
   *
   * @param {Object} params
   * @param {string} params.query - Pertanyaan asli pengguna
   * @param {Object} params.tier1Result - Hasil evaluasi dari Tier 1 (Lokal)
   * @param {string} [params.traceId] - Trace ID untuk observability tracking
   * @param {Object} [params.options]
   * @returns {Promise<{
   *   chunks: Array<Object>,
   *   strategy: string,
   *   sufficiency: number,
   *   tier: 2,
   *   isFallback: true,
   *   timeoutMs: number,
   *   fallbackDisclaimer: string
   * }>}
   */
  async buildFallbackContext({ query, tier1Result, traceId, options = {} }) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const sufficiency = tier1Result?.sufficiency ?? 0.0;
    const timestamp = new Date().toISOString();

    // Pancarkan event telemetri Tier 2 dengan traceId valid
    if (this.eventBus?.emit) {
      this.eventBus.emit('Retrieval:Tier2Fallback', {
        traceId: traceId || null,
        query: query ? query.substring(0, 100) : '',
        tier1Sufficiency: sufficiency,
        tier1Strategy: tier1Result?.strategy || 'unknown',
        timestamp
      });
    }

    console.log(`[InternalKnowledgeFallbackService] Tier 2 fallback triggered (Tier 1 sufficiency: ${sufficiency}, traceId: ${traceId || 'none'})`);

    const fallbackDirective = `[PANDUAN SISTEM TIER 2 — INTERNAL KNOWLEDGE FALLBACK]:
Tidak ditemukan dokumen atau arsip lokal yang relevan di Knowledge Base (Skor kecukupan Tier 1: ${sufficiency}).
Jawab pertanyaan pengguna menggunakan pengetahuan umum / pengetahuan internal bawaan model Anda.
WAJIB: Sebutkan atau jelaskan secara jujur dan eksplisit bahwa jawaban ini bersumber dari "pengetahuan umum" / "pengetahuan internal model", bukan dari data lokal repositori yang terverifikasi.`;

    const fallbackChunk = {
      content: fallbackDirective,
      source_type: 'llm_internal',
      source_url: null,
      similarity: null,
      retrieved_at: timestamp
    };

    return {
      chunks: [fallbackChunk],
      strategy: 'llm_internal_fallback',
      sufficiency: 0.35, // Representasi skor di bawah threshold 0.4
      tier: 2,
      isFallback: true,
      timeoutMs: TIER2_FALLBACK_TIMEOUT_MS,
      fallbackDisclaimer: '⚠️ Waktu tunggu inferensi habis (Timeout 20s). Sistem tidak dapat memberikan respons dari pengetahuan internal saat ini. Silakan coba kembali atau berikan dokumen referensi ke Knowledge Base.'
    };
  }
}

export default InternalKnowledgeFallbackService;
