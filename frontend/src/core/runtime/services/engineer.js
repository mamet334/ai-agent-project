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
 * Status: IMPLEMENTER — siap menghasilkan dan menerapkan patch
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
      static: null,
      dynamic: null
    };

    this.capability = 'IMPLEMENTER';
    this.pendingPatches = new Map(); // Patch yang menunggu persetujuan

    this.metrics = {
      tasksAnalyzed: 0,
      recommendationsMade: 0,
      patchesGenerated: 0,
      patchesApproved: 0,
      patchesRejected: 0
    };
  }

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
      const constitutionPaths = [
        '/constitution/MAEF_v3.0.md',
        '/constitution/Mamet_AI_Constitution_v2.0.md',
        '/constitution/vision.md',
        '/constitution/master-architecture.md',
        '/docs/adr/ADR-001.md',
        '/docs/adr/ADR-002.md',
        '/docs/adr/ADR-003.md'
      ];

      const staticData = {};
      for (const path of constitutionPaths) {
        try {
          const content = await this.storageManager.read(path);
          if (content) {
            staticData[path] = content;
          }
        } catch (e) {
          // File mungkin belum ada
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
    this.eventBus.on('Engineer:AnalyzeTask', this._handleAnalysisTask.bind(this));
    this.eventBus.on('Engineer:ReviewChanges', this._handleReviewTask.bind(this));
    this.eventBus.on('Engineer:GeneratePatch', this._handlePatchTask.bind(this));
    this.eventBus.on('Engineer:ApprovalResponse', this._handleApprovalResponse.bind(this));
  }

  // =============================================
  // DYNAMIC CONTEXT (Brain 2) & TASK HANDLING
  // =============================================
  async _buildDynamicContext(task) {
    return {
      task: task,
      timestamp: new Date().toISOString()
    };
  }

  async _handleAnalysisTask(task) {
    this.metrics.tasksAnalyzed++;
    console.log(`[Engineer] Analyzing task: ${task.title || task.id}`);

    this.brain.dynamic = await this._buildDynamicContext(task);
    const analysis = await this._analyze(task);

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

    // JANGAN langsung tulis file. Minta persetujuan dulu.
    if (patch.ready) {
      const approved = await this._requestApproval(patch);
      
      if (approved) {
        await this._executePatchApplication(patch);
        this.metrics.patchesApproved++;
        this._emitRecommendation({
          type: 'PATCH_APPLIED',
          taskId: task.id,
          patch,
          message: 'Patch telah diterapkan dengan persetujuan User.',
          confidence: this._calculateConfidence(patch)
        });
      } else {
        this.metrics.patchesRejected++;
        this._emitRecommendation({
          type: 'PATCH_REJECTED',
          taskId: task.id,
          patch,
          message: 'Patch ditolak oleh User.',
          confidence: this._calculateConfidence(patch)
        });
      }
    } else {
      this._emitRecommendation({
        type: 'PATCH_FAILED',
        taskId: task.id,
        patch,
        confidence: this._calculateConfidence(patch)
      });
    }
  }

  /**
   * Handler untuk respons persetujuan dari UI
   * @private
   */
  _handleApprovalResponse(response) {
    const { patchId, approved } = response;
    const pending = this.pendingPatches.get(patchId);
    
    if (pending) {
      // Panggil resolver yang sudah disimpan
      pending.resolver(approved);
      this.pendingPatches.delete(patchId);
    }
  }

  // =============================================
  // PERSETUJUAN (APPROVAL)
  // =============================================
  /**
   * Minta persetujuan User sebelum menerapkan patch
   * @private
   * @param {Object} patch - Patch yang akan diterapkan
   * @returns {Promise<boolean>} - true jika disetujui, false jika ditolak
   */
  async _requestApproval(patch) {
    return new Promise((resolve) => {
      // Simpan resolver untuk dipanggil nanti
      this.pendingPatches.set(patch.id, { patch, resolver: resolve });

      // Emit event ke UI
      this.eventBus.emit('Engineer:RequestApproval', {
        patchId: patch.id,
        summary: patch.description || 'Patch generated',
        files: patch.files.map(f => ({
          path: f.path,
          status: f.status,
          size: f.size || 0
        })),
        diff: patch.diff || '',
        timestamp: new Date().toISOString()
      });
    });
  }

  // =============================================
  // CORE METHODS
  // =============================================
  async _analyze(task) {
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
    return {
      verdict: 'NEUTRAL',
      issues: [],
      notes: 'Engineer versi dasar belum bisa melakukan review mendalam.'
    };
  }

  async _generatePatch(task) {
    try {
      console.log(`[Engineer] Generating patch for task: ${task.title || task.id}`);
      
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
      
      // JANGAN tulis file dulu. Simpan di memori, minta persetujuan nanti.
      const patchFiles = [];
      for (const [filePath, newContent] of Object.entries(generatedCode)) {
        patchFiles.push({
          path: filePath,
          newContent: newContent,
          originalContent: fileContents[filePath] || '',
          status: 'PENDING_APPROVAL',
          size: newContent.length
        });
      }
      
      const patch = {
        id: `PATCH-${Date.now()}`,
        taskId: task.id,
        files: patchFiles,
        description: task.description || 'Auto-generated patch',
        generatedAt: new Date().toISOString(),
        ready: patchFiles.length > 0
      };
      
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

  _extractCodeFromResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {};
    } catch (e) {
      console.warn('[Engineer] Failed to extract code from response:', e);
      return {};
    }
  }

  _generateFallbackPatch(task, fileContents) {
    const result = {};
    for (const filePath of Object.keys(fileContents)) {
      result[filePath] = fileContents[filePath] + '\n// TODO: Implement changes for task: ' + (task.title || task.id);
    }
    return result;
  }

  /**
   * Terapkan patch setelah User menyetujui
   * @private
   * @param {Object} patch - Patch yang akan diterapkan
   */
  async _executePatchApplication(patch) {
    try {
      console.log(`[Engineer] Executing patch application: ${patch.id}`);
      
      // Tulis setiap file
      for (const file of patch.files) {
        try {
          await this.storageManager.write(file.path, file.newContent);
          file.status = 'APPLIED';
          console.log(`[Engineer] File written: ${file.path}`);
        } catch (e) {
          file.status = 'FAILED';
          file.error = e.message;
          console.error(`[Engineer] Failed to write file ${file.path}:`, e);
        }
      }
      
      // Simpan ke Project Memory
      const memoryService = this.serviceManager.get('MemoryService');
      if (memoryService) {
        await memoryService.storeMemory(
          `Patch ${patch.id} applied`,
          `Patch ${patch.id} was applied to ${patch.files.length} file(s).`
        );
      }
      
      this.eventBus.emit('Engineer:PatchApplied', { patchId: patch.id, files: patch.files });
      
      return { success: true };
    } catch (error) {
      console.error('[Engineer] Patch execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  // =============================================
  // CONFIDENCE CALCULATION
  // =============================================
  _calculateConfidence(result) {
    return {
      coverage: 30,
      evidence: 20,
      level: 'LOW'
    };
  }

  // =============================================
  // OUTPUT: REKOMENDASI KE USER
  // =============================================
  _emitRecommendation(recommendation) {
    this.eventBus.emit('Engineer:Recommendation', {
      ...recommendation,
      from: 'Engineer',
      capability: this.capability,
      requiresApproval: true,
      timestamp: new Date().toISOString()
    });
  }

  // =============================================
  // CAPABILITY UPGRADE
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