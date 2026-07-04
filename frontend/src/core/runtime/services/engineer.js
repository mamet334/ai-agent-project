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
    this.pendingPatches = new Map();

    this.metrics = {
      tasksAnalyzed: 0,
      recommendationsMade: 0,
      patchesGenerated: 0,
      patchesApproved: 0,
      patchesRejected: 0,
      patchesFailedVerification: 0
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
        '/AGENTS.md',
        '/constitution/MAEF_v3.0.md',
        '/constitution/Mamet_AI_Constitution_v2.0.md',
        '/constitution/vision.md',
        '/constitution/master-architecture.md',
        '/docs/adr/ADR-001.md',
        '/docs/adr/ADR-002.md',
        '/docs/adr/ADR-003.md',
        '/docs/adr/ADR-004.md',
        '/docs/adr/ADR-005.md',
        '/docs/adr/ADR-006.md',
        '/docs/adr/ADR-007.md',
        '/docs/adr/ADR-008.md',
        '/docs/adr/ADR-009.md',
        '/docs/adr/ADR-010.md',
        '/docs/adr/ADR-011.md'
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
        message: 'Engineer belum memiliki kapabilitas IMPLEMENTER.',
        requiresApproval: false
      });
      return;
    }

    this.metrics.patchesGenerated++;
    console.log(`[Engineer] Generating patch for: ${task.title || task.id}`);
    this.brain.dynamic = await this._buildDynamicContext(task);
    const patch = await this._generatePatch(task);

    // Verifikasi patch sebelum approval
    if (patch.ready) {
      const verificationEngine = this.serviceManager.get('VerificationEngine');
      if (verificationEngine && verificationEngine.verifyPatch) {
        const verificationResult = await verificationEngine.verifyPatch(patch, this.brain);
        patch.verification = verificationResult;

        if (!verificationResult.passed) {
          console.warn('[Engineer] Patch gagal verifikasi:', verificationResult.issues);
          this.metrics.patchesFailedVerification++;
          patch.ready = false;

          this._emitRecommendation({
            type: 'PATCH_VERIFICATION_FAILED',
            taskId: task.id,
            patch,
            verification: verificationResult,
            message: `Patch tidak lolos verifikasi: ${verificationResult.criticalCount} masalah kritis.`,
            confidence: this._calculateConfidence(patch)
          });
          return;
        }
      }
    }

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
      // Patch tidak siap (verifikasi gagal atau error lain)
      if (!patch.verification) {
        this._emitRecommendation({
          type: 'PATCH_FAILED',
          taskId: task.id,
          patch,
          confidence: this._calculateConfidence(patch)
        });
      }
    }
  }

  _handleApprovalResponse(response) {
    const { patchId, approved } = response;
    const pending = this.pendingPatches.get(patchId);

    if (pending) {
      pending.resolver(approved);
      this.pendingPatches.delete(patchId);
    }
  }

  // =============================================
  // FILE OPERATIONS
  // =============================================

  /**
   * Membaca file dari repository
   * @param {string} filePath - Path relatif ke file
   * @returns {Promise<string|null>} - Konten file atau null jika gagal
   */
  async readFile(filePath) {
    try {
      const content = await this.storageManager.read(filePath);
      if (content === null) {
        console.warn(`[Engineer] File tidak ditemukan: ${filePath}`);
        return null;
      }
      console.log(`[Engineer] File dibaca: ${filePath} (${content.length} karakter)`);
      return content;
    } catch (error) {
      console.error(`[Engineer] Gagal membaca file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Mencari file di repository berdasarkan pola
   * @param {string} pattern - Pola pencarian (contoh: "*.js", "IntentParser*")
   * @param {string} dir - Direktori untuk mencari
   * @returns {Promise<string[]>} - Daftar path file yang cocok
   */
  async findFiles(pattern, dir = '/') {
    try {
      const allFiles = await this.storageManager.list(dir);
      if (pattern === '*') return allFiles;
      if (pattern.endsWith('*')) {
        const prefix = pattern.replace('*', '');
        return allFiles.filter(f => f.startsWith(dir + prefix) || f.includes(prefix));
      }
      if (pattern.startsWith('*.')) {
        const ext = pattern.replace('*', '');
        return allFiles.filter(f => f.endsWith(ext));
      }
      return allFiles.filter(f => f.includes(pattern));
    } catch (error) {
      console.error(`[Engineer] Gagal mencari file:`, error);
      return [];
    }
  }

  // =============================================
  // PERSETUJUAN (APPROVAL)
  // =============================================
  async _requestApproval(patch) {
    return new Promise((resolve) => {
      this.pendingPatches.set(patch.id, { patch, resolver: resolve });

      this.eventBus.emit('Engineer:RequestApproval', {
        patchId: patch.id,
        summary: patch.description || 'Patch generated',
        files: patch.files.map(f => ({
          path: f.path,
          status: f.status,
          size: f.size || 0
        })),
        diff: patch.diff || '',
        verification: patch.verification || null,
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
        const content = await this.readFile(filePath);
        if (content !== null) {
          fileContents[filePath] = content;
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
      return { files: [], description: `Patch generation failed: ${error.message}`, ready: false, error: error.message };
    }
  }

  _buildPatchPrompt(task, fileContents) {
    let prompt = `Anda adalah Mamet Engineer yang terikat AGENTS.md, MAEF v3.0, dan Mamet AI Constitution v2.0.\n\n`;
    prompt += `Tugas: ${task.title || task.id}\n`;
    prompt += `Deskripsi: ${task.description || 'Tidak ada deskripsi'}\n\n`;

    if (Object.keys(fileContents).length > 0) {
      prompt += `File yang akan diubah:\n`;
      for (const [path, content] of Object.entries(fileContents)) {
        prompt += `\n--- ${path} ---\n${content}\n`;
      }
    }

    prompt += `\n\nHasilkan kode baru untuk setiap file. Return dalam format JSON:\n`;
    prompt += `{\n  "path/ke/file1": "konten baru lengkap",\n  "path/ke/file2": "konten baru lengkap"\n}\n\n`;
    prompt += `Aturan:\n`;
    prompt += `- Jangan ubah file yang tidak perlu diubah\n`;
    prompt += `- Pertahankan komentar dan dokumentasi yang ada\n`;
    prompt += `- Ikuti standar ESModules\n`;
    prompt += `- Jangan gunakan eval() atau new Function()\n`;
    prompt += `- Nama event EventBus harus pakai format Kategori:Nama (contoh: Engineer:Ready)\n`;

    return prompt;
  }

  _extractCodeFromResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
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

  async _executePatchApplication(patch) {
    try {
      console.log(`[Engineer] 🔧 Menerapkan patch: ${patch.id}`);
      console.log(`[Engineer] 📋 Jumlah file yang akan diubah: ${patch.files.length}`);

      let successCount = 0;
      let failCount = 0;

      for (const file of patch.files) {
        try {
          console.log(`[Engineer] ✍️ Menulis file: ${file.path} (${file.newContent.length} karakter)`);
          const writeResult = await this.storageManager.write(file.path, file.newContent);

          if (writeResult) {
            file.status = 'APPLIED';
            successCount++;
            console.log(`[Engineer] ✅ File berhasil ditulis: ${file.path}`);
          } else {
            file.status = 'FAILED';
            file.error = 'StorageManager.write() mengembalikan false';
            failCount++;
            console.error(`[Engineer] ❌ Gagal menulis file: ${file.path}`);
          }
        } catch (e) {
          file.status = 'FAILED';
          file.error = e.message;
          failCount++;
          console.error(`[Engineer] ❌ Error menulis file ${file.path}:`, e);
        }
      }

      // Simpan ke Project Memory
      try {
        const memoryService = this.serviceManager.get('MemoryService');
        if (memoryService) {
          await memoryService.storeMemory(
            `Patch ${patch.id} applied`,
            `Patch ${patch.id} berhasil diterapkan: ${successCount} file berhasil, ${failCount} file gagal.`
          );
        }
      } catch (e) {
        console.warn('[Engineer] Gagal menyimpan ke Project Memory:', e);
      }

      const result = {
        success: failCount === 0,
        patchId: patch.id,
        successCount,
        failCount,
        files: patch.files
      };

      this.eventBus.emit('Engineer:PatchApplied', result);
      console.log(`[Engineer] 🎯 Patch selesai: ${successCount} berhasil, ${failCount} gagal`);

      return result;
    } catch (error) {
      console.error('[Engineer] ❌ Patch execution gagal total:', error);
      return { success: false, error: error.message };
    }
  }

  // =============================================
  // CONFIDENCE CALCULATION
  // =============================================
  _calculateConfidence(result) {
    return { coverage: 30, evidence: 20, level: 'LOW' };
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