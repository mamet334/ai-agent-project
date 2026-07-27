/**
 * Engineer.js — Engineering Brain Mamet AI (Real Analysis Engine + Core Protection)
 * 
 * Peran:
 * - Membaca static knowledge (constitution, ADR)
 * - Menerima tugas via event bus
 * - Menganalisis, memberi rekomendasi
 * - Tidak pernah mengeksekusi perubahan tanpa persetujuan User
 * - TIDAK BOLEH mengubah file core (Kernel, EventBus, dll)
 * 
 * Two-Brain Model:
 * - Brain 1: Static Engineering Knowledge (dimuat sekali)
 * - Brain 2: Dynamic Engineering Context (dibangun per tugas)
 * 
 * Status: IMPLEMENTER — siap menghasilkan dan menerapkan patch
 * Upgrade: Real Analysis Engine (MAEF 4.5) + Core Protection Layer
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
    this.suspiciousAttempts = 0; // Circuit breaker counter

    this.metrics = {
      tasksAnalyzed: 0,
      recommendationsMade: 0,
      patchesGenerated: 0,
      patchesApproved: 0,
      patchesRejected: 0,
      patchesFailedVerification: 0,
      coreModificationsBlocked: 0
    };
  }

  async initialize() {
    await this._loadStaticKnowledge();
    this._registerListeners();
    console.log(`[Engineer] Initialized as ${this.capability}`);
    this.eventBus.emit('Engineer:Ready', { capability: this.capability });
  }

  // =============================================
  // CORE PROTECTION LAYER (MAEF 4.2 Compliant)
  // =============================================

  /**
   * Cek apakah file termasuk IMMUTABLE (tidak boleh diubah oleh Engineer)
   */
  _isImmutableFile(filePath) {
    const IMMUTABLE_PATTERNS = [
      '/core/runtime/Kernel.js',
      '/core/runtime/EventBus.js',
      '/core/runtime/ServiceManager.js',
      '/core/runtime/ProcessManager.js',
      '/core/runtime/StorageManager.js',
      '/core/runtime/ModuleLoader.js',
      '/core/runtime/DiscoveryManager.js',
      '/electron/main.js',
      '/electron/preload.cjs',
      '/constitution/00_CONSTITUTION.md',
      '/constitution/01_VISION.md',
      '/constitution/09_DNA.md'
    ];
    return IMMUTABLE_PATTERNS.some(pattern => filePath.includes(pattern));
  }

  /**
   * Cek apakah file termasuk PROTECTED (butuh approval ketat)
   */
  _isProtectedFile(filePath) {
    const PROTECTED_PATTERNS = [
      '/core/runtime/services/',
      '/supabase/functions/agent-process/index.ts',
      '/supabase/functions/agent-process/lib/',
      '/frontend/src/core/runtime/services/engineer.js'
    ];
    return PROTECTED_PATTERNS.some(pattern => filePath.includes(pattern));
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
  // REAL ANALYSIS ENGINE (MAEF 4.5 Compliant)
  // =============================================

  _extractFileNamesFromTask(task) {
    const filePatterns = [];
    const text = `${task.title || ''} ${task.description || ''} ${task.errorLog || ''}`;
    
    const pathRegex = /([a-zA-Z0-9_\-\/]+\.(js|jsx|ts|tsx|md|json|cjs|mjs))/g;
    const pathMatches = text.match(pathRegex) || [];
    filePatterns.push(...pathMatches);
    
    const stackRegex = /at\s+([A-Za-z]+\.js)/g;
    const stackMatches = [...text.matchAll(stackRegex)].map(m => m[1]);
    filePatterns.push(...stackMatches);
    
    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    const importMatches = [...text.matchAll(importRegex)].map(m => m[1]);
    filePatterns.push(...importMatches);
    
    const unique = [...new Set(filePatterns)];
    return unique.filter(f => {
      return f.length > 3 && !f.includes('node_modules') && !f.startsWith('.');
    });
  }

  _findRelevantADR(task) {
    const text = `${task.title || ''} ${task.description || ''}`.toLowerCase();
    
    const adrMapping = [
      { keywords: ['event', 'bus', 'emit', 'listener'], file: '/constitution/11_MAEF_EVENT_SYSTEM.md' },
      { keywords: ['kernel', 'boot', 'phase', 'service'], file: '/constitution/02_MAEF_KERNEL.md' },
      { keywords: ['adapter', 'vendor', 'openrouter', 'gemini'], file: '/constitution/12_CAPABILITY_ADAPTER_SPEC.md' },
      { keywords: ['verification', 'confidence', 'evidence'], file: '/constitution/13_VERIFICATION_ENGINE_SPEC.md' },
      { keywords: ['memory', 'user_memory', 'project_memory'], file: '/constitution/06_MEMORY_SYSTEM.md' },
      { keywords: ['rag', 'embedding', 'vector', 'chunk'], file: '/constitution/05_KNOWLEDGE_SYSTEM.md' },
      { keywords: ['engineer', 'patch', 'self-maintenance'], file: '/constitution/07_ENGINEERING_SYSTEM.md' },
      { keywords: ['logging', 'telemetry', 'observability'], file: '/constitution/15_LOGGING_OBSERVABILITY_SYSTEM.md' },
      { keywords: ['metric', 'health', 'shi'], file: '/constitution/16_ENGINEERING_METRICS_SYSTEM.md' }
    ];
    
    for (const mapping of adrMapping) {
      if (mapping.keywords.some(kw => text.includes(kw))) {
        return { title: mapping.file, path: mapping.file };
      }
    }
    
    return null;
  }

  _checkCompliance(fileContents) {
    const violations = [];
    const warnings = [];
    
    for (const [filePath, content] of Object.entries(fileContents)) {
      const lines = content.split('\n');
      
      const eventEmitRegex = /eventBus\.emit\(['"]([^'"]+)['"]/g;
      const eventMatches = [...content.matchAll(eventEmitRegex)];
      for (const match of eventMatches) {
        const eventName = match[1];
        if (!eventName.includes(':')) {
          violations.push({
            file: filePath,
            line: content.substring(0, match.index).split('\n').length,
            rule: 'MAEF 4.6 (Event-Driven)',
            severity: 'HIGH',
            message: `Event "${eventName}" tidak menggunakan format namespace (Kategori:Nama)`
          });
        }
      }
      
      if (content.includes('eval(') || content.includes('new Function(')) {
        violations.push({
          file: filePath,
          line: null,
          rule: 'MAEF 4.1 (Security)',
          severity: 'CRITICAL',
          message: 'Terdeteksi penggunaan eval() atau new Function() yang dilarang'
        });
      }
      
      const directVendorCalls = [
        /fetch\(['"]https:\/\/api\.openai\.com/,
        /fetch\(['"]https:\/\/generativelanguage\.googleapis\.com/,
        /require\(['"]@anthropic-ai/
      ];
      for (const pattern of directVendorCalls) {
        if (pattern.test(content)) {
          violations.push({
            file: filePath,
            line: null,
            rule: 'MAEF 4.7 (Adapter Isolation)',
            severity: 'HIGH',
            message: 'Terdeteksi pemanggilan vendor API langsung tanpa Adapter Layer'
          });
        }
      }
      
      if (lines.length > 200) {
        const jsdocCount = (content.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
        if (jsdocCount < 3) {
          warnings.push({
            file: filePath,
            rule: 'MAEF 4.8 (Documentation)',
            severity: 'LOW',
            message: `File besar (${lines.length} baris) dengan dokumentasi minimal (${jsdocCount} JSDoc)`
          });
        }
      }
    }
    
    return { violations, warnings };
  }

  // =============================================
  // CORE METHODS (UPGRADED WITH REAL ANALYSIS)
  // =============================================
  async _analyze(task) {
    console.log(`[Engineer] Memulai Real Analysis untuk: ${task.title || task.id}`);
    
    const targetFiles = this._extractFileNamesFromTask(task);
    console.log(`[Engineer] File terdeteksi: ${targetFiles.join(', ')}`);
    
    const fileContents = {};
    const readResults = [];
    
    for (const filePath of targetFiles.slice(0, 10)) {
      try {
        const content = await this.readFile(filePath);
        if (content) {
          fileContents[filePath] = content;
          readResults.push({ file: filePath, status: 'SUCCESS', size: content.length });
        } else {
          readResults.push({ file: filePath, status: 'NOT_FOUND' });
        }
      } catch (e) {
        readResults.push({ file: filePath, status: 'ERROR', error: e.message });
      }
    }
    
    const relevantADR = this._findRelevantADR(task);
    let adrContent = null;
    if (relevantADR) {
      adrContent = await this.readFile(relevantADR.path);
    }
    
    const compliance = this._checkCompliance(fileContents);
    
    const findings = [];
    
    if (compliance.violations.length > 0) {
      findings.push(`🔴 Ditemukan ${compliance.violations.length} pelanggaran MAEF:`);
      compliance.violations.forEach(v => {
        findings.push(`   - [${v.severity}] ${v.file}:${v.line || '?'} - ${v.message} (${v.rule})`);
      });
    }
    
    if (compliance.warnings.length > 0) {
      findings.push(`🟡 Ditemukan ${compliance.warnings.length} peringatan:`);
      compliance.warnings.forEach(w => {
        findings.push(`   - [${w.severity}] ${w.file} - ${w.message}`);
      });
    }
    
    if (compliance.violations.length === 0 && compliance.warnings.length === 0) {
      findings.push('✅ Tidak ada pelanggaran MAEF yang terdeteksi pada file yang dianalisis.');
    }
    
    const metrics = {
      filesAnalyzed: Object.keys(fileContents).length,
      totalCodeLines: Object.values(fileContents).reduce((sum, c) => sum + c.split('\n').length, 0),
      violationsFound: compliance.violations.length,
      warningsFound: compliance.warnings.length,
      adrReferenced: relevantADR ? relevantADR.path : 'None'
    };
    
    return {
      summary: `Analisis selesai: ${metrics.filesAnalyzed} file, ${metrics.totalCodeLines} baris kode, ${metrics.violationsFound} pelanggaran`,
      findings: findings,
      rawContext: fileContents,
      compliance: compliance,
      metrics: metrics,
      recommendation: metrics.violationsFound > 0 
        ? 'Perlu perbaikan untuk mematuhi MAEF' 
        : 'Kode aman, lanjutkan dengan implementasi fitur'
    };
  }

  async _review(task) {
    const analysis = await this._analyze(task);
    return {
      verdict: analysis.compliance.violations.length > 0 ? 'REJECT' : 'APPROVE',
      issues: analysis.compliance.violations,
      notes: `Review selesai: ${analysis.metrics.filesAnalyzed} file diperiksa.`,
      analysis: analysis
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

      // =============================================
      // CORE PROTECTION: BLOCK IMMUTABLE FILES
      // =============================================
      for (const file of patch.files) {
        if (this._isImmutableFile(file.path)) {
          console.error(`[Engineer] 🚫 BLOCKED: Attempt to modify IMMUTABLE core file: ${file.path}`);
          this.metrics.coreModificationsBlocked++;
          this.suspiciousAttempts++;
          
          // Circuit breaker: jika 3x mencoba ubah core, turunkan capability
          if (this.suspiciousAttempts >= 3) {
            this.capability = 'OBSERVER';
            this.eventBus.emit('Engineer:EmergencyLockdown', {
              reason: 'Suspicious core modification attempts detected',
              attempts: this.suspiciousAttempts
            });
          }
          
          this._emitRecommendation({
            type: 'CORE_MODIFICATION_BLOCKED',
            taskId: patch.taskId,
            message: `🚫 BLOKIR: File "${file.path}" adalah bagian dari CORE IMMUTABLE dan TIDAK BOLEH diubah oleh Engineer. Silakan laporkan ke Owner untuk intervensi manual.`,
            severity: 'CRITICAL'
          });
          
          return { success: false, error: 'Core file modification blocked' };
        }
      }

      let successCount = 0;
      let failCount = 0;

      for (const file of patch.files) {
        try {
          // Warning untuk PROTECTED files
          if (this._isProtectedFile(file.path)) {
            console.warn(`[Engineer] ⚠️ WARNING: Modifying PROTECTED file: ${file.path}`);
          }
          
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
  // DYNAMIC CONFIDENCE CALCULATION (UPGRADED)
  // =============================================
  _calculateConfidence(result) {
    let coverage = 0;
    let evidence = 0;
    
    if (result.rawContext) {
      const filesAttempted = result.metrics?.filesAnalyzed || 0;
      const filesRead = Object.keys(result.rawContext).length;
      coverage = filesAttempted > 0 ? Math.round((filesRead / filesAttempted) * 100) : 0;
    }
    
    if (result.compliance) {
      const violations = result.compliance.violations?.length || 0;
      const warnings = result.compliance.warnings?.length || 0;
      
      if (violations === 0 && warnings === 0) {
        evidence = 90;
      } else if (violations === 0) {
        evidence = 70;
      } else if (violations <= 2) {
        evidence = 50;
      } else {
        evidence = 20;
      }
    }
    
    let level = 'LOW';
    if (coverage >= 80 && evidence >= 70) level = 'HIGH';
    else if (coverage >= 50 && evidence >= 50) level = 'MEDIUM';
    
    return { coverage, evidence, level };
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
          size: f.size || 0,
          isImmutable: this._isImmutableFile(f.path),
          isProtected: this._isProtectedFile(f.path)
        })),
        diff: patch.diff || '',
        verification: patch.verification || null,
        timestamp: new Date().toISOString()
      });
    });
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
      this.suspiciousAttempts = 0; // Reset circuit breaker
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
    return { 
      ...this.metrics, 
      capability: this.capability,
      suspiciousAttempts: this.suspiciousAttempts
    };
  }
}

export { Engineer };