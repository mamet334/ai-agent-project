/**
 * Engineer.js — Engineering Brain Mamet AI
 * 
 * Peran:
 * - Membaca static knowledge (constitution, ADR)
 * - Menerima tugas via event bus
 * - Menganalisis, memberi rekomendasi
 * - Tidak pernah mengeksekusi perubahan tanpa persetujuan User
 * 
 * Two-Brain Model:
 * - Brain 1: Static Engineering Knowledge (dimuat sekali)
 * - Brain 2: Dynamic Engineering Context (dibangun per tugas)
 * 
 * Status: UNIVERSAL BASE — siap dikembangkan bertahap
 */

class Engineer {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.fs = serviceManager.get('FileSystem');
    this.process = serviceManager.get('ProcessManager');
    this.moduleLoader = serviceManager.get('ModuleLoader');

    // Two‑Brain Model
    this.brain = {
      static: null,   // Static Engineering Knowledge
      dynamic: null   // Dynamic Context (dibangun per tugas)
    };

    // Status capability (Phase 4-9)
    this.capability = 'OBSERVER'; // OBSERVER | REVIEWER | ARCHITECT | PLANNER | IMPLEMENTER | VERIFIER | SELF_MAINTENANCE

    // Metrics sederhana
    this.metrics = {
      tasksAnalyzed: 0,
      recommendationsMade: 0,
      patchesGenerated: 0
    };
  }

  /**
   * Inisialisasi Engineer: muat static knowledge, daftarkan listener
   */
  async initialize() {
    await this._loadStaticKnowledge();
    this._registerListeners();
    console.log(`[Engineer] Initialized as ${this.capability}`);
    this.eventBus.emit('ENGINEER_READY', { capability: this.capability });
  }

  // =============================================
  // STATIC KNOWLEDGE (Brain 1)
  // =============================================
  async _loadStaticKnowledge() {
    try {
      // Daftar file konstitusi dan ADR (disesuaikan dengan struktur aktual)
      const constitutionPaths = [
        '/constitution/MAEF_v3.0.md',
        '/constitution/Mamet_AI_Constitution_v2.0.md',
        '/constitution/vision.md',
        '/constitution/master-architecture.md',
        '/docs/adr/ADR-001.md',
        '/docs/adr/ADR-002.md',
        '/docs/adr/ADR-003.md',
        // tambahkan semua 11 ADR jika ada
      ];

      const staticData = {};
      for (const path of constitutionPaths) {
        try {
          const content = await this.fs.read(path);
          if (content) {
            staticData[path] = content;
          }
        } catch (e) {
          // File mungkin belum ada (tidak masalah)
        }
      }

      this.brain.static = {
        loadedFiles: Object.keys(staticData),
        raw: staticData,
        summary: 'Static knowledge loaded from constitution & ADRs',
        loadedAt: new Date().toISOString()
      };

      console.log(`[Engineer] Static knowledge loaded: ${this.brain.static.loadedFiles.length} files`);
    } catch (error) {
      console.error('[Engineer] Failed to load static knowledge', error);
      this.brain.static = { loadedFiles: [], error: error.message };
    }
  }

  // =============================================
  // EVENT LISTENERS
  // =============================================
  _registerListeners() {
    // Tugas analisis dari User (via UI atau service lain)
    this.eventBus.on('ENGINEER_ANALYZE_TASK', this._handleAnalysisTask.bind(this));

    // Perintah review (misal dari pipeline verifikasi)
    this.eventBus.on('ENGINEER_REVIEW_CHANGES', this._handleReviewTask.bind(this));

    // Perintah generate patch (hanya jika capability sudah IMPLEMENTER)
    this.eventBus.on('ENGINEER_GENERATE_PATCH', this._handlePatchTask.bind(this));
  }

  // =============================================
  // DYNAMIC CONTEXT (Brain 2) & TASK HANDLING
  // =============================================
  async _buildDynamicContext(task) {
    // Informasi runtime yang relevan dengan tugas
    return {
      task: task,
      timestamp: new Date().toISOString(),
      // Nanti bisa ditambah: git diff, affected files, error logs, dll.
    };
  }

  async _handleAnalysisTask(task) {
    this.metrics.tasksAnalyzed++;
    console.log(`[Engineer] Analyzing task: ${task.title || task.id}`);

    // Bangun dynamic context
    this.brain.dynamic = await this._buildDynamicContext(task);

    // Lakukan analisis (versi dasar: hanya pencocokan aturan sederhana)
    const analysis = await this._analyze(task);

    // Kirim rekomendasi ke User (tidak langsung mengeksekusi)
    this._emitRecommendation({
      type: 'ANALYSIS',
      taskId: task.id,
      analysis,
      confidence: this._calculateConfidence(analysis)
    });
  }

  async _handleReviewTask(task) {
    this.metrics.recommendationsMade++;
    console.log(`[Engineer] Reviewing changes for: ${task.title || task.id}`);

    this.brain.dynamic = await this._buildDynamicContext(task);
    const review = await this._review(task);

    this._emitRecommendation({
      type: 'REVIEW',
      taskId: task.id,
      review,
      confidence: this._calculateConfidence(review)
    });
  }

  async _handlePatchTask(task) {
    if (this.capability !== 'IMPLEMENTER' && this.capability !== 'SELF_MAINTENANCE') {
      this.eventBus.emit('ENGINEER_RECOMMENDATION', {
        type: 'ERROR',
        taskId: task.id,
        message: 'Engineer belum memiliki kapabilitas IMPLEMENTER. Butuh upgrade bertahap.',
        requiresApproval: false
      });
      return;
    }

    this.metrics.patchesGenerated++;
    console.log(`[Engineer] Generating patch for: ${task.title || task.id}`);

    this.brain.dynamic = await this._buildDynamicContext(task);
    const patch = await this._generatePatch(task);

    // Patch TIDAK di-apply otomatis. User harus menyetujui.
    this._emitRecommendation({
      type: 'PATCH',
      taskId: task.id,
      patch,
      confidence: this._calculateConfidence(patch)
    });
  }

  // =============================================
  // CORE ANALYSIS METHODS (versi dasar, akan diganti LLM nanti)
  // =============================================
  async _analyze(task) {
    // Versi universal: kembalikan template analisis
    return {
      summary: `Analisis untuk tugas: ${task.title || task.id}`,
      findings: [
        'Belum ada aturan yang dilanggar (static analysis belum mendalam)',
        'Dibutuhkan pembacaan repository lebih lanjut untuk analisis dampak'
      ],
      recommendation: 'Lanjutkan dengan hati-hati, pastikan tidak melanggar ADR.'
    };
  }

  async _review(task) {
    // Cek sederhana terhadap static knowledge
    return {
      verdict: 'NEUTRAL', // PASS | FAIL | NEUTRAL
      issues: [],
      notes: 'Engineer versi dasar belum bisa melakukan review mendalam. Upgrade diperlukan.'
    };
  }

  async _generatePatch(task) {
    // Hanya placeholder
    return {
      files: [],
      description: 'Patch generation belum tersedia di versi dasar.',
      ready: false
    };
  }

  // =============================================
  // CONFIDENCE CALCULATION (dasar)
  // =============================================
  _calculateConfidence(result) {
    // Versi dasar: confidence rendah karena belum ada evidence kuat
    return {
      coverage: 30,   // persentase sumber yang bisa diakses
      evidence: 20,   // kekuatan bukti
      level: 'LOW'    // LOW | MEDIUM | HIGH
    };
  }

  // =============================================
  // OUTPUT: REKOMENDASI KE USER
  // =============================================
  _emitRecommendation(recommendation) {
    // Prinsip: AI berpikir, User memutuskan.
    // Engineer hanya mengirim rekomendasi, tidak mengeksekusi.
    this.eventBus.emit('ENGINEER_RECOMMENDATION', {
      ...recommendation,
      from: 'Engineer',
      capability: this.capability,
      requiresApproval: true,  // User harus menyetujui sebelum action apa pun
      timestamp: new Date().toISOString()
    });
  }

  // =============================================
  // CAPABILITY UPGRADE (dipanggil setelah approval User)
  // =============================================
  upgradeCapability(newCapability) {
    const validCapabilities = [
      'OBSERVER', 'REVIEWER', 'ARCHITECT', 'PLANNER',
      'IMPLEMENTER', 'VERIFIER', 'SELF_MAINTENANCE'
    ];
    if (validCapabilities.includes(newCapability)) {
      this.capability = newCapability;
      console.log(`[Engineer] Capability upgraded to ${newCapability}`);
      this.eventBus.emit('ENGINEER_CAPABILITY_UPDATED', { capability: this.capability });
    } else {
      console.warn(`[Engineer] Invalid capability: ${newCapability}`);
    }
  }

  // =============================================
  // METRICS
  // =============================================
  getMetrics() {
    return { ...this.metrics, capability: this.capability };
  }
}

export { Engineer };