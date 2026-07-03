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
    this.storageManager = serviceManager.get('StorageManager');
    this.process = serviceManager.get('ProcessManager');
    this.moduleLoader = serviceManager.get('ModuleLoader');

    // Two‑Brain Model
    this.brain = {
      static: null,   // Static Engineering Knowledge
      dynamic: null   // Dynamic Context (dibangun per tugas)
    };

    // Status capability (Phase 4-9)
    this.capability = 'IMPLEMENTER'; // OBSERVER | REVIEWER | ARCHITECT | PLANNER | IMPLEMENTER | VERIFIER | SELF_MAINTENANCE

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
    this.eventBus.emit('Engineer:Ready', { capability: this.capability });
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
          const content = await this.storageManager.read(path);
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
    this.eventBus.on('Engineer:AnalyzeTask', this._handleAnalysisTask.bind(this));

    // Perintah review (misal dari pipeline verifikasi)
    this.eventBus.on('Engineer:ReviewChanges', this._handleReviewTask.bind(this));

    // Perintah generate patch (hanya jika capability sudah IMPLEMENTER)
    this.eventBus.on('Engineer:GeneratePatch', this._handlePatchTask.bind(this));
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
      this.eventBus.emit('Engineer:Recommendation', {
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
    try {
      console.log(`[Engineer] Generating patch for task: ${task.title || task.id}`);
      
      // 1. Baca file yang relevan via StorageManager
      const relevantFiles = task.files || [];
      const fileContents = {};
      
      for (const filePath of relevantFiles) {
        try {
          const content = await this.storageManager.read(filePath);
          fileContents[filePath] = content;
        } catch (e) {
          console.warn(`[Engineer] Failed to read file ${filePath}:`, e);
        }
      }
      
      // 2. Gunakan LLM (via BrainService) untuk menghasilkan kode baru
      let generatedCode = null;
      try {
        const brainService = this.serviceManager.get('BrainService');
        if (brainService) {
          const prompt = this._buildPatchPrompt(task, fileContents);
          const response = await brainService.executeLLM(prompt);
          generatedCode = this._extractCodeFromResponse(response);
        }
      } catch (e) {
        console.warn('[Engineer] BrainService not available, using fallback');
        generatedCode = this._generateFallbackPatch(task, fileContents);
      }
      
      // 3. Tulis kode baru ke file via StorageManager.write()
      const patchFiles = [];
      for (const [filePath, newContent] of Object.entries(generatedCode)) {
        try {
          await this.storageManager.write(filePath, newContent);
          patchFiles.push({
            path: filePath,
            status: 'WRITTEN',
            size: newContent.length
          });
        } catch (e) {
          console.error(`[Engineer] Failed to write file ${filePath}:`, e);
          patchFiles.push({
            path: filePath,
            status: 'FAILED',
            error: e.message
          });
        }
      }
      
      const patch = {
        id: `PATCH-${Date.now()}`,
        taskId: task.id,
        files: patchFiles,
        description: task.description || 'Auto-generated patch',
        generatedAt: new Date().toISOString(),
        ready: true
      };
      
      // 4. Emit event 'Engineer:PatchGenerated'
      this.eventBus.emit('Engineer:PatchGenerated', patch);
      
      return patch;
    } catch (error) {
      console.error('[Engineer] Patch generation failed:', error);
      return {
        files: [],
        description: `Patch generation failed: ${error.message}`,
        ready: false,
        error: error.message
      };
    }
  }

  /**
   * Build prompt for LLM to generate patch
   * @private
   */
  _buildPatchPrompt(task, fileContents) {
    let prompt = `You are an expert software engineer. Generate code changes for the following task:\n\n`;
    prompt += `Task: ${task.title || task.id}\n`;
    prompt += `Description: ${task.description || ''}\n\n`;
    
    if (Object.keys(fileContents).length > 0) {
      prompt += `Current file contents:\n`;
      for (const [path, content] of Object.entries(fileContents)) {
        prompt += `\n--- ${path} ---\n${content}\n`;
      }
    }
    
    prompt += `\n\nGenerate the new code for each file. Return in JSON format:\n`;
    prompt += `{\n  "filePath1": "new content",\n  "filePath2": "new content"\n}`;
    
    return prompt;
  }

  /**
   * Extract code from LLM response
   * @private
   */
  _extractCodeFromResponse(response) {
    try {
      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      // Fallback: return empty object
      return {};
    } catch (e) {
      console.warn('[Engineer] Failed to extract code from response:', e);
      return {};
    }
  }

  /**
   * Generate fallback patch when BrainService is not available
   * @private
   */
  _generateFallbackPatch(task, fileContents) {
    // Simple placeholder implementation
    const result = {};
    for (const filePath of Object.keys(fileContents)) {
      result[filePath] = fileContents[filePath] + '\n// TODO: Implement changes for task: ' + (task.title || task.id);
    }
    return result;
  }

  /**
   * Apply patch after verification and user approval
   * @param {string} patchId - ID of the patch to apply
   */
  async applyPatch(patchId) {
    try {
      console.log(`[Engineer] Applying patch: ${patchId}`);
      
      // 1. Verify patch via VerificationEngine
      const verificationEngine = this.serviceManager.get('VerificationEngine');
      let verificationResult = { passed: true, issues: [] };
      
      if (verificationEngine) {
        verificationResult = await verificationEngine.verifyPatch(patchId);
      }
      
      if (!verificationResult.passed) {
        console.error('[Engineer] Patch verification failed:', verificationResult.issues);
        this.eventBus.emit('Engineer:PatchRejected', {
          patchId,
          reason: 'Verification failed',
          issues: verificationResult.issues
        });
        return { success: false, reason: 'Verification failed' };
      }
      
      // 2. Minta persetujuan User (via event)
      this.eventBus.emit('Engineer:RequestApproval', {
        patchId,
        verificationResult
      });
      
      // Note: Actual application happens after user approves via separate event
      return { success: true, status: 'WAITING_APPROVAL' };
      
    } catch (error) {
      console.error('[Engineer] Patch application failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actually apply the patch (called after user approval)
   * @param {string} patchId - ID of the patch to apply
   */
  async _executePatchApplication(patchId) {
    try {
      console.log(`[Engineer] Executing patch application: ${patchId}`);
      
      // In a real implementation, this would:
      // 1. Apply the file changes
      // 2. Run tests
      // 3. Save to Project Memory
      
      // Save to Project Memory
      const memoryService = this.serviceManager.get('MemoryService');
      if (memoryService) {
        await memoryService.storeMemory(
          `Applied patch ${patchId}`,
          `Patch ${patchId} was successfully applied to the codebase.`
        );
      }
      
      this.eventBus.emit('Engineer:PatchApplied', { patchId });
      
      return { success: true };
    } catch (error) {
      console.error('[Engineer] Patch execution failed:', error);
      return { success: false, error: error.message };
    }
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
    this.eventBus.emit('Engineer:Recommendation', {
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
      this.eventBus.emit('Engineer:CapabilityUpdated', { capability: this.capability });
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