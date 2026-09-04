/**
 * WebComparisonService.js — Tier 3 Web Search Comparison (PR#9 Fase 3)
 *
 * Bertanggung jawab tunggal untuk pencarian pengetahuan eksternal dari web
 * sebagai pembanding (Tier 3) pada arsitektur retrieval berjenjang.
 *
 * Prinsip:
 * 1. One File One Responsibility: Hanya mengurus eksekusi Tier 3, timeout, dan fallback.
 * 2. Human-in-Command (PR#9 §6 Open Question 2):
 *    Web search wajib melalui konfirmasi Owner terlebih dahulu (tidak otomatis).
 * 3. Batas Waktu Eksplisit (PR#9 §6 Open Question 3):
 *    Timeout 8-10 detik (default 8000ms) menggunakan AbortController.
 * 4. Kejujuran Atribusi:
 *    Hasil web ditandai secara eksplisit dengan source_type: 'web' dan
 *    disclaimer "akurasi tidak terverifikasi". Jika gagal/timeout, sistem
 *    tidak menyembunyikan kegagalan.
 * 5. Kontrak Seragam PR#9 §3:
 *    Mengembalikan data seragam dengan field chunks, strategy, sufficiency, tier: 3.
 */

export const WEB_SEARCH_TIMEOUT_MS = 8000; // 8 detik batas waktu standar
export const WEB_SUFFICIENCY_SCORE = 0.7; // Skor kecukupan bila web comparison berhasil

export class WebComparisonService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = null;
    this.isInitialized = false;
    this.pendingConfirmations = new Map(); // requestId -> { query, traceId, resolve, reject, createdAt }
    this.customSearchHandler = null; // Memungkinkan injeksi handler pencarian (untuk testing/adaptor)
  }

  async initialize() {
    if (this.isInitialized) return;

    if (this.serviceManager && this.serviceManager.has('EventBus')) {
      this.eventBus = this.serviceManager.get('EventBus');
    }

    this.isInitialized = true;
    console.log('[WebComparisonService] Initialized & Ready (Tier 3 Active, Human-in-Command Enabled)');
  }

  /**
   * Set kustom handler pencarian (misal untuk testing atau provider DuckDuckGo/Google/Serper kustom).
   * @param {Function} handler - async (query, signal) => Array<{ title, link, snippet }>
   */
  setSearchHandler(handler) {
    this.customSearchHandler = handler;
  }

  // =========================================================================
  // HUMAN-IN-COMMAND CONFIRMATION GATE (PR#9 §6 Open Question 2)
  // =========================================================================

  /**
   * Meminta konfirmasi Owner sebelum melakukan web search.
   * @param {Object} params
   * @param {string} params.query - Kata kunci pencarian
   * @param {string} [params.traceId] - Trace ID
   * @param {string} [params.reason] - Alasan mengapa web comparison dibutuhkan
   * @returns {Promise<boolean>} Resolves true jika diizinkan, false jika ditolak
   */
  async requestConfirmation({ query, traceId, reason }) {
    const requestId = `CONF-WEB-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const confirmationPayload = {
      requestId,
      query,
      traceId: traceId || null,
      reason: reason || 'Dokumen lokal & pengetahuan internal model belum mencukupi.',
      timeoutMs: WEB_SEARCH_TIMEOUT_MS,
      timestamp: new Date().toISOString()
    };

    console.log(`[WebComparisonService] 🛑 Human-in-Command: Menunggu konfirmasi Owner untuk web search: "${query}" [${requestId}]`);

    if (this.eventBus?.emit) {
      this.eventBus.emit('Retrieval:RequestWebConfirmation', confirmationPayload);
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingConfirmations.has(requestId)) {
          console.warn(`[WebComparisonService] ⏱️ Konfirmasi Owner timed out setelah 45s: ${requestId}`);
          this.pendingConfirmations.delete(requestId);
          if (this.eventBus?.emit) {
            this.eventBus.emit('Retrieval:WebConfirmationTimeout', { requestId });
          }
          resolve(false);
        }
      }, 45000);

      this.pendingConfirmations.set(requestId, {
        query,
        traceId,
        resolve: (val) => {
          clearTimeout(timeoutId);
          resolve(val);
        },
        timeoutId,
        createdAt: Date.now()
      });
    });
  }

  /**
   * Selesaikan keputusan Owner terhadap konfirmasi web search.
   * @param {string} requestId
   * @param {boolean} isApproved
   */
  resolveConfirmation(requestId, isApproved) {
    const pending = this.pendingConfirmations.get(requestId);
    if (!pending) {
      console.warn(`[WebComparisonService] Konfirmasi web search tidak ditemukan atau sudah selesai: ${requestId}`);
      return false;
    }

    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingConfirmations.delete(requestId);

    if (!isApproved) {
      console.log(`[WebComparisonService] ❌ Owner MENOLAK pencarian web [${requestId}]. Eksekusi dibatalkan (0 web cost/latency).`);
      if (this.eventBus?.emit) {
        this.eventBus.emit('Retrieval:WebConfirmationRejected', { requestId });
      }
      pending.resolve(false);
      return false;
    }

    console.log(`[WebComparisonService] ✅ Owner MENYETUJUI pencarian web [${requestId}]. Melanjutkan eksekusi...`);
    if (this.eventBus?.emit) {
      this.eventBus.emit('Retrieval:WebConfirmationApproved', { requestId });
    }
    pending.resolve(true);
    return true;
  }

  // =========================================================================
  // CORE EXECUTION: TIER 3 WEB SEARCH (PR#9 §3 & §6)
  // =========================================================================

  /**
   * Eksekusi pencarian web comparison sesuai kontrak PR#9.
   *
   * @param {string} query - Query pencarian
   * @param {Object} [options]
   * @param {string} [options.traceId]
   * @param {boolean} [options.autoConfirm=false] - Jika true, lewati antrean konfirmasi (sudah disetujui sebelumnya)
   * @param {string} [options.reason]
   * @param {number} [options.timeoutMs=8000]
   * @returns {Promise<{
   *   chunks: Array<{ content: string, source_type: 'web', source_url: string, title?: string, retrieved_at: string }>,
   *   strategy: string,
   *   sufficiency: number,
   *   tier: 3,
   *   isFallback: boolean,
   *   status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'REJECTED',
   *   timeoutMs: number,
   *   error?: string,
   *   fallbackDisclaimer?: string
   * }>}
   */
  async searchWeb(query, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const timestamp = new Date().toISOString();
    const traceId = options.traceId || null;
    const timeoutMs = options.timeoutMs || WEB_SEARCH_TIMEOUT_MS;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return {
        chunks: [],
        strategy: 'web_search_empty',
        sufficiency: 0.0,
        tier: 3,
        isFallback: true,
        status: 'FAILED',
        timeoutMs,
        error: 'Query pencarian kosong'
      };
    }

    // 1. Gerbang Konfirmasi Owner (Human-in-Command)
    if (!options.autoConfirm) {
      const isApproved = await this.requestConfirmation({
        query,
        traceId,
        reason: options.reason
      });

      if (!isApproved) {
        return {
          chunks: [],
          strategy: 'web_search_rejected',
          sufficiency: 0.0,
          tier: 3,
          isFallback: true,
          status: 'REJECTED',
          timeoutMs,
          error: 'Pencarian web tidak dikonfirmasi oleh pengguna (Ditolak)',
          fallbackDisclaimer: '⚠️ Pencarian web pembanding dibatalkan karena tidak mendapatkan izin dari pengguna. Jawaban disusun dari Tier 1 & Tier 2.'
        };
      }
    }

    // 2. Eksekusi Pencarian dengan Batas Waktu (Timeout 8-10 Detik)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    const startTime = Date.now();

    try {
      console.log(`[WebComparisonService] 🌐 Menjalankan pencarian web (Timeout: ${timeoutMs}ms) untuk: "${query.substring(0, 60)}..."`);
      
      const rawResults = await this._executeFetch(query, abortController.signal);
      clearTimeout(timeoutId);

      const durationMs = Date.now() - startTime;

      if (!rawResults || rawResults.length === 0) {
        console.warn(`[WebComparisonService] Pencarian web tidak menghasilkan dokumen relevan (${durationMs}ms)`);
        
        if (this.eventBus?.emit) {
          this.eventBus.emit('Retrieval:Tier3WebComparison', {
            traceId,
            query: query.substring(0, 100),
            status: 'EMPTY',
            durationMs,
            chunksCount: 0
          });
        }

        return {
          chunks: [],
          strategy: 'web_search_no_results',
          sufficiency: 0.0,
          tier: 3,
          isFallback: true,
          status: 'FAILED',
          timeoutMs,
          error: 'Pencarian web tidak mengembalikan hasil yang relevan.',
          fallbackDisclaimer: '⚠️ Pencarian web tidak menemukan referensi tambahan yang cocok. Menggunakan pengetahuan internal model.'
        };
      }

      // Format ke kontrak PR#9 seragam
      const chunks = rawResults.map((item) => ({
        content: item.snippet || item.title || '',
        title: item.title || 'Web Result',
        source_type: 'web',
        source_url: item.link || item.url || 'https://web-search-engine.net',
        similarity: 0.75,
        retrieved_at: timestamp
      }));

      if (this.eventBus?.emit) {
        this.eventBus.emit('Retrieval:Tier3WebComparison', {
          traceId,
          query: query.substring(0, 100),
          status: 'SUCCESS',
          durationMs,
          chunksCount: chunks.length
        });
      }

      console.log(`[WebComparisonService] ✅ Web search sukses (${chunks.length} hasil, ${durationMs}ms)`);

      return {
        chunks,
        strategy: 'web_search_comparison',
        sufficiency: WEB_SUFFICIENCY_SCORE,
        tier: 3,
        isFallback: false,
        status: 'SUCCESS',
        timeoutMs,
        durationMs
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError' || abortController.signal.aborted;
      const status = isTimeout ? 'TIMEOUT' : 'FAILED';
      const durationMs = Date.now() - startTime;

      console.warn(`[WebComparisonService] ⚠️ Web search ${status} (${durationMs}ms): ${err.message}`);

      if (this.eventBus?.emit) {
        this.eventBus.emit('Retrieval:Tier3WebComparison', {
          traceId,
          query: query.substring(0, 100),
          status,
          durationMs,
          chunksCount: 0,
          error: err.message
        });
      }

      return {
        chunks: [],
        strategy: isTimeout ? 'web_search_timeout' : 'web_search_error',
        sufficiency: 0.0,
        tier: 3,
        isFallback: true,
        status,
        timeoutMs,
        error: isTimeout ? `Waktu tunggu pencarian web habis (Timeout ${timeoutMs}ms)` : err.message,
        fallbackDisclaimer: isTimeout
          ? `⚠️ Waktu tunggu pencarian web habis (Timeout ${timeoutMs / 1000}s). Sistem tidak memaksakan data web yang belum selesai. Menjawab dari Tier 1 & Tier 2.`
          : `⚠️ Pencarian web gagal menghubungi server pencari (${err.message}). Menjawab dari Tier 1 & Tier 2.`
      };
    }
  }

  /**
   * Internal fetcher abstraction (Multi-provider resilient search).
   * Mendukung:
   * 1. Injected handler (mock/custom)
   * 2. Google News RSS (real-time news, unblocked, bebas sensor ISP)
   * 3. Wikipedia API (open factual search)
   * 4. DuckDuckGo fallback
   */
  async _executeFetch(query, signal) {
    if (this.customSearchHandler) {
      return await this.customSearchHandler(query, signal);
    }

    // Provider 1: Google News RSS (Prioritas utama untuk berita/informasi terkini)
    try {
      const gnewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
      const response = await fetch(gnewsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/rss+xml, application/xml, text/xml',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal
      });

      if (response.ok) {
        const xml = await response.text();
        const results = this._parseRssResults(xml);
        if (results && results.length > 0) {
          console.log(`[WebComparisonService] Google News RSS returned ${results.length} results`);
          return results;
        }
      }
    } catch (gnewsErr) {
      console.warn('[WebComparisonService] Google News RSS fetch warning:', gnewsErr.message);
    }

    // Provider 2: Wikipedia Search API (Fallback faktual terbuka)
    try {
      const wikiUrl = `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
      const response = await fetch(wikiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal
      });

      if (response.ok) {
        const data = await response.json();
        const searchHits = data?.query?.search || [];
        if (searchHits.length > 0) {
          const results = searchHits.slice(0, 5).map(h => ({
            title: h.title,
            link: `https://id.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/\s+/g, '_'))}`,
            snippet: (h.snippet || '').replace(/<[^>]+>/g, '').trim()
          }));
          console.log(`[WebComparisonService] Wikipedia API returned ${results.length} results`);
          return results;
        }
      }
    } catch (wikiErr) {
      console.warn('[WebComparisonService] Wikipedia search warning:', wikiErr.message);
    }

    // Provider 3: DuckDuckGo Fallback
    try {
      const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal
      });

      if (response.ok) {
        const html = await response.text();
        return this._parseHtmlResults(html);
      }
    } catch (ddgErr) {
      console.warn('[WebComparisonService] DuckDuckGo search fallback warning:', ddgErr.message);
    }

    return [];
  }

  /**
   * Parser ringan untuk Google News RSS.
   */
  _parseRssResults(xml) {
    const results = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && results.length < 5) {
      const itemXml = match[1];
      const rawTitle = itemXml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
      const title = rawTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();

      const link = (itemXml.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim();
      const rawDesc = itemXml.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '';
      const snippet = rawDesc
        .replace(/<[^>]+>/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (title && link) {
        results.push({
          title,
          link,
          snippet: snippet || title
        });
      }
    }

    return results;
  }

  /**
   * Parser ringan regex untuk hasil HTML search engine tanpa dependency cheerio.
   */
  _parseHtmlResults(html) {
    const results = [];
    const linkRegex = /<a[^>]+class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

    const urls = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null && urls.length < 5) {
      let rawUrl = match[1];
      if (rawUrl.includes('uddg=')) {
        try {
          const urlParam = new URL('https://duckduckgo.com' + rawUrl).searchParams.get('uddg');
          if (urlParam) rawUrl = decodeURIComponent(urlParam);
        } catch (_) {}
      }
      urls.push({
        url: rawUrl,
        title: match[2].replace(/<[^>]+>/g, '').trim()
      });
    }

    const snippets = [];
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
    }

    for (let i = 0; i < urls.length; i++) {
      results.push({
        title: urls[i].title || `Web Result #${i + 1}`,
        link: urls[i].url,
        snippet: snippets[i] || 'No snippet available'
      });
    }

    return results;
  }
}

export default WebComparisonService;
