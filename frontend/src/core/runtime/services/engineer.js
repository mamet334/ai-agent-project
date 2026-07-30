import { FileIndexService } from './FileIndexService.js';

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
 * Upgrade: Real Analysis Engine (MAEF 4.5) + Core Protection Layer + Granular Approval
 *
 * Fixes Applied:
 * - ✅ Granular Approval support (approvedFiles flow)
 * - ✅ Confidence & Compliance injection ke UI
 * - ✅ Correct VerificationEngine method name (verifyPatchEngineering)
 * - ✅ [FIX #1] requiresApproval tidak lagi di-override oleh _emitRecommendation()
 * - ✅ [FIX #2] Timeout 10 menit di _waitForUserConfirmation() dan _requestApproval()
 * - ✅ [FIX #3] Session Artifact di-inject ke prompt LLM via _buildPatchPrompt()
 * - ✅ [FIX #4] Slice limit diselaraskan: max 10 file di _generatePatch() sesuai capability check
 * - ✅ [FIX #5] _buildDynamicContext() diperkaya dengan file list dan metadata task
 */

// =============================================
// CONSTANTS
// =============================================

const CONFIRMATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;      // 10 menit
const MAX_FILES_PER_PATCH = 10;                   // Harus sama dengan Capability Guard

/**
 * SessionArtifact — Melacak konteks sesi Engineer untuk handoff antar model AI.
 * Diinisialisasi sekali saat Engineer.initialize() dan diperbarui per task.
 */
class SessionArtifact {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.decisions = [];          // Riwayat keputusan
    this.analyzedFiles = [];      // File yang dianalisis
    this.modifiedFiles = [];      // File yang diubah
    this.maefViolations = [];     // Pelanggaran MAEF yang ditemukan
    this.reasoningReports = [];   // Riwayat reasoning report
    this.startedAt = new Date().toISOString();
    this.lastActivity = new Date().toISOString();
    this.taskCount = 0;
  }

  addDecision(decision) {
    this.decisions.push({ ...decision, timestamp: new Date().toISOString() });
    this.lastActivity = new Date().toISOString();
  }

  addAnalyzedFile(filePath) {
    if (!this.analyzedFiles.includes(filePath)) {
      this.analyzedFiles.push(filePath);
    }
    this.lastActivity = new Date().toISOString();
  }

  addModifiedFile(filePath) {
    if (!this.modifiedFiles.includes(filePath)) {
      this.modifiedFiles.push(filePath);
    }
    this.lastActivity = new Date().toISOString();
  }

  addReasoningReport(report) {
    this.reasoningReports.push({
      taskId: report.taskId,
      summary: report.summary,
      confidence: report.confidence,
      timestamp: new Date().toISOString()
    });
    this.lastActivity = new Date().toISOString();
  }

  addMaefViolation(violation) {
    this.maefViolations.push({ ...violation, recordedAt: new Date().toISOString() });
    this.lastActivity = new Date().toISOString();
  }

  incrementTaskCount() {
    this.taskCount++;
    this.lastActivity = new Date().toISOString();
  }

  getSummary() {
    const durationMs = Date.now() - new Date(this.startedAt).getTime();
    const durationSeconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;

    return {
      sessionId: this.sessionId,
      taskCount: this.taskCount,
      decisionsCount: this.decisions.length,
      analyzedFilesCount: this.analyzedFiles.length,
      modifiedFilesCount: this.modifiedFiles.length,
      violationsFound: this.maefViolations.length,
      reasoningReportsCount: this.reasoningReports.length,
      duration: `${minutes}m ${seconds}s`,
      startedAt: this.startedAt,
      lastActivity: this.lastActivity
    };
  }

  /**
   * Menghasilkan string konteks untuk di-inject ke prompt LLM.
   * Berguna untuk handoff antar model AI.
   */
  toPromptContext() {
    const summary = this.getSummary();
    let context = `=== SESSION ARTIFACT ===\n`;
    context += `Session ID: ${summary.sessionId}\n`;
    context += `Durasi Sesi: ${summary.duration}\n`;
    context += `Task Diproses: ${summary.taskCount}\n`;
    context += `File Dianalisis: ${summary.analyzedFilesCount} (${this.analyzedFiles.join(', ') || 'tidak ada'})\n`;
    context += `File Dimodifikasi: ${summary.modifiedFilesCount} (${this.modifiedFiles.join(', ') || 'tidak ada'})\n`;
    context += `Keputusan Diambil: ${summary.decisionsCount}\n`;
    context += `Pelanggaran MAEF: ${summary.violationsFound}\n`;

    if (this.reasoningReports.length > 0) {
      context += `\n=== REASONING REPORTS ===\n`;
      this.reasoningReports.forEach((r, i) => {
        context += `[${i + 1}] Task: ${r.taskId} | Confidence: ${r.confidence?.level || 'N/A'} | ${r.summary}\n`;
      });
    }

    if (this.decisions.length > 0) {
      context += `\n=== KEPUTUSAN TERAKHIR ===\n`;
      const lastDecisions = this.decisions.slice(-3);
      lastDecisions.forEach(d => {
        context += `- ${d.type || 'Decision'}: ${d.detail || d.summary || 'N/A'}\n`;
      });
    }

    context += `\n=== END SESSION ARTIFACT ===\n`;
    return context;
  }
}

class Engineer {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.storageManager = serviceManager.get('StorageManager');
    this.process = serviceManager.get('ProcessManager');
    this.moduleLoader = serviceManager.get('ModuleLoader');
    this.fileIndexService = null; // Akan diinisialisasi setelah StorageManager siap

    // Two-Brain Model
    this.brain = {
      static: null,
      dynamic: null
    };

    this.capability = 'IMPLEMENTER';
    this.pendingPatches = new Map();
    this.suspiciousAttempts = 0; // Circuit breaker counter
    this.intentState = 'READY'; // READY | ANALYZING | ASK_CLARIFICATION | PROCEEDING
    this.pendingConfirmations = new Map(); // Untuk Reasoning Lock
    this.sessionArtifact = null; // FASE 4: Session Artifact — diinisialisasi di initialize()

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

    // ✅ Inisialisasi FileIndexService menggunakan static import di atas, dan tunggu selesai
    this.fileIndexService = new FileIndexService(this.storageManager);
    console.log('[Engineer] 🔨 Membangun FileIndexService...');
    await this.fileIndexService.buildIndex();
    console.log('[Engineer] ✅ FileIndexService siap digunakan');

    // ✅ FASE 4: Inisialisasi Session Artifact (sekali, bukan per task)
    this._initializeSessionArtifact();

    this._registerListeners(); // Pastikan terjadi SETELAH indeks siap!
    console.log(`[Engineer] Initialized as ${this.capability}`);
    this.eventBus.emit('Engineer:Ready', { capability: this.capability });
  }

  // =============================================
  // FASE 4: SESSION ARTIFACT
  // =============================================

  /**
   * Menginisialisasi Session Artifact untuk melacak konteks sesi Engineer.
   * Dipanggil sekali saat initialize(), bukan per task.
   */
  _initializeSessionArtifact() {
    const sessionId = `ENG-SESSION-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.sessionArtifact = new SessionArtifact(sessionId);
    console.log(`[Engineer] 📦 Session Artifact initialized: ${sessionId}`);
  }

  /**
   * Memperbarui Session Artifact berdasarkan action yang terjadi.
   * @param {string} action - Tipe action
   * @param {Object} data - Data terkait action
   */
  _updateArtifact(action, data = {}) {
    if (!this.sessionArtifact) {
      console.warn('[Engineer] ⚠️ Session Artifact belum diinisialisasi');
      return;
    }

    switch (action) {
      case 'ANALYSIS':
        this.sessionArtifact.incrementTaskCount();
        if (data.files) {
          data.files.forEach(f => this.sessionArtifact.addAnalyzedFile(f));
        }
        if (data.violations) {
          data.violations.forEach(v => this.sessionArtifact.addMaefViolation(v));
        }
        this.sessionArtifact.addDecision({
          type: 'ANALYSIS',
          detail: data.summary || 'Analisis selesai',
          taskId: data.taskId
        });
        break;

      case 'REASONING':
        if (data.report) {
          this.sessionArtifact.addReasoningReport(data.report);
        }
        this.sessionArtifact.addDecision({
          type: 'REASONING',
          detail: data.summary || 'Reasoning report dikeluarkan',
          taskId: data.taskId
        });
        break;

      case 'PATCH_GENERATED':
        if (data.files) {
          data.files.forEach(f => this.sessionArtifact.addModifiedFile(f));
        }
        this.sessionArtifact.addDecision({
          type: 'PATCH_GENERATED',
          detail: `Patch generated: ${data.files?.length || 0} files`,
          taskId: data.taskId
        });
        break;

      case 'VERIFICATION':
        this.sessionArtifact.addDecision({
          type: 'VERIFICATION',
          detail: data.passed ? 'Verifikasi lulus' : `Verifikasi gagal: ${data.issues || ''}`,
          taskId: data.taskId
        });
        break;

      case 'APPROVED':
        this.sessionArtifact.addDecision({
          type: 'APPROVED',
          detail: `Patch disetujui: ${data.files?.length || 0} files`,
          taskId: data.taskId
        });
        break;

      case 'REJECTED':
        this.sessionArtifact.addDecision({
          type: 'REJECTED',
          detail: data.reason || 'Patch ditolak',
          taskId: data.taskId
        });
        break;

      case 'CAPABILITY_BLOCKED':
        this.sessionArtifact.addDecision({
          type: 'CAPABILITY_BLOCKED',
          detail: data.reason || 'Capability check gagal',
          taskId: data.taskId
        });
        break;

      default:
        console.warn(`[Engineer] Unknown artifact action: ${action}`);
    }
  }

  /**
   * [FIX #3] Menghasilkan string konteks Session Artifact untuk di-inject ke prompt LLM.
   * @returns {string} Konteks terformat, atau string kosong jika artifact belum ada
   */
  _injectArtifactIntoPrompt() {
    if (!this.sessionArtifact) {
      return '';
    }
    // Hanya inject jika ada aktivitas sebelumnya yang relevan
    const summary = this.sessionArtifact.getSummary();
    if (summary.taskCount === 0 && summary.decisionsCount === 0) {
      return '';
    }
    return this.sessionArtifact.toPromptContext();
  }

  // =============================================
  // FASE 2: CAPABILITY GUARD
  // =============================================

  /**
   * Memeriksa apakah task memenuhi syarat untuk diproses Engineer.
   * @param {Object} task - Task yang akan diperiksa
   * @param {Object} options - Opsi tambahan (analysis, modelName)
   * @returns {{ pass: boolean, reason?: string, suggestBatch?: boolean }}
   */
  _checkCapabilityAndDeclare(task, options = {}) {
    const { analysis, modelName } = options;
    const text = `${task.title || ''} ${task.description || ''}`;
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const targetFiles = task.files || this._extractFileNamesFromTask(task);

    const checks = [];

    // 1. Prompt Clarity Check — minimal 20 kata
    if (wordCount < 20) {
      checks.push({
        pass: false,
        reason: `Prompt terlalu pendek (${wordCount} kata). Minimal 20 kata untuk menghasilkan patch yang akurat. Silakan berikan instruksi yang lebih detail.`
      });
    }

    // 2. File Limit Check — maksimal MAX_FILES_PER_PATCH file
    // [FIX #4] Menggunakan konstanta MAX_FILES_PER_PATCH agar konsisten dengan _generatePatch()
    if (targetFiles.length > MAX_FILES_PER_PATCH) {
      checks.push({
        pass: false,
        reason: `Terlalu banyak file (${targetFiles.length} file). Maksimal ${MAX_FILES_PER_PATCH} file per patch. Sarankan memecah tugas menjadi beberapa batch.`,
        suggestBatch: true
      });
    }

    // 3. ADR Wajib Check — untuk perubahan struktur/core
    const relevantADR = this._findRelevantADR(task);
    if (!relevantADR) {
      const adrRequiredPhrases = [
        'perubahan arsitektur', 'arsitektur baru', 'service baru', 'module baru',
        'new architecture', 'new service', 'new module', 'restruktur', 'restrukturisasi',
        'mengubah flow', 'merubah flow', 'mengubah alur', 'merubah alur',
        'pipeline baru', 'integration baru', 'integrasi baru',
        'architectural change', 'structural change'
      ];
      const needsADR = adrRequiredPhrases.some(phrase => text.toLowerCase().includes(phrase));
      if (needsADR) {
        checks.push({
          pass: false,
          reason: `Perubahan ini menyentuh area arsitektur yang membutuhkan ADR (Architecture Decision Record). Silakan buat ADR terlebih dahulu atau arahkan saya ke ADR yang relevan.`
        });
      }
    }

    // 4. Confidence Threshold Check — jika analysis tersedia
    if (analysis) {
      const confidence = this._calculateConfidence(analysis);
      if (confidence.level === 'LOW' || confidence.evidence < 70) {
        checks.push({
          pass: false,
          reason: `Confidence terlalu rendah (${confidence.level}, evidence: ${confidence.evidence}/100) untuk auto-patch. Saya sarankan analisis manual terlebih dahulu.`,
          confidenceDetails: confidence
        });
      }
    }

    // Jika ada pelanggaran, return detail pelanggaran pertama
    if (checks.length > 0) {
      const failedCheck = checks.find(c => c.pass === false);
      console.log(`[Engineer] 🚫 Capability check failed: ${failedCheck?.reason}`);
      return {
        pass: false,
        checks: checks,
        reason: failedCheck?.reason || 'Capability check gagal',
        suggestBatch: checks.some(c => c.suggestBatch),
        modelName: modelName || 'unknown'
      };
    }

    console.log(`[Engineer] ✅ Capability check passed`);
    return {
      pass: true,
      checks: [],
      modelName: modelName || 'unknown'
    };
  }

  // =============================================
  // CORE PROTECTION LAYER (MAEF 4.2 Compliant)
  // =============================================

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
        'init.md',
        'agent.md',
        'AGENTS.md',
        'constitution/MAEF_v3.0.md',
        'constitution/Mamet_AI_Constitution_v2.0.md',
        'constitution/vision.md',
        'constitution/master-architecture.md',
        'constitution/00_CONSTITUTION.md',
        'constitution/01_VISION.md',
        'constitution/02_MAEF_KERNEL.md',
        'constitution/03_CAPABILITY_PORT.md',
        'constitution/04_OWNER_SOVEREIGNTY.md',
        'constitution/05_KNOWLEDGE_SYSTEM.md',
        'constitution/06_MEMORY_SYSTEM.md',
        'constitution/07_ENGINEERING_SYSTEM.md',
        'constitution/08_ROADMAP.md',
        'constitution/09_DNA.md',
        'constitution/10_ADR_SYSTEM.md',
        'constitution/11_MAEF_EVENT_SYSTEM.md',
        'constitution/12_CAPABILITY_ADAPTER_SPEC.md',
        'constitution/13_VERIFICATION_ENGINE_SPEC.md',
        'constitution/14_MAEF_ORCHESTRATOR_SPEC.md',
        'constitution/15_LOGGING_OBSERVABILITY_SYSTEM.md',
        'constitution/16_ENGINEERING_METRICS_SYSTEM.md',
        'constitution/17_MAEF_BOOTSTRAP_SYSTEM.md',
        'constitution/18_DEPLOYMENT_ARCHITECTURE.md',
        'constitution/19_REFERENCE_IMPLEMENTATION.md',
        'constitution/20_ENGINEERING POLICY.md',
        'constitution/21 Engineer Capability.md',
        'constitution/22_MUS_UI_SPECIFICATION.md',
        'constitution/23_HOME_DASHBOARD_SPEC.md',
        'constitution/ENGINEERING_CONTRACT.md',
        'constitution/README.md'
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
    this.eventBus.on('Engineer:AnalyzeTask', (wrappedPayload) => {
      const task = wrappedPayload?.data || wrappedPayload;
      this._handleAnalysisTask(task);
    });

    this.eventBus.on('Engineer:ReviewChanges', (wrappedPayload) => {
      const task = wrappedPayload?.data || wrappedPayload;
      this._handleReviewTask(task);
    });

    this.eventBus.on('Engineer:GeneratePatch', (wrappedPayload) => {
      const task = wrappedPayload?.data || wrappedPayload;
      console.log('[Engineer] 📨 Received GeneratePatch event:', task);
      console.log('[Engineer] Task title:', task?.title);
      console.log('[Engineer] Task description:', task?.description?.substring(0, 100));
      this._handlePatchTask(task);
    });

    this.eventBus.on('Engineer:ApprovalResponse', (wrappedPayload) => {
      const response = wrappedPayload?.data || wrappedPayload;
      this._handleApprovalResponse(response);
    });

    // FASE 3: Reasoning Lock listener
    this.eventBus.on('Engineer:UserConfirmation', (wrappedPayload) => {
      const response = wrappedPayload?.data || wrappedPayload;
      this._handleUserConfirmation(response);
    });
  }

  // =============================================
  // FASE 3: REASONING LOCK & LAPORAN
  // =============================================

  /**
   * Menghasilkan laporan reasoning komprehensif sebelum eksekusi patch.
   * Prinsip: Tidak ada kode yang dihasilkan tanpa analisis yang ditunjukkan.
   * @param {Object} task - Task yang sedang diproses
   * @param {Object} analysis - Hasil analisis dari _analyze()
   * @param {Object} options - Opsi tambahan (intent, capabilityCheck, modelName)
   * @returns {Object} Reasoning report object
   */
  _emitReasoningReport(task, analysis, options = {}) {
    const { intent = 'MODIFY_CODE', capabilityCheck = null, modelName = 'unknown' } = options;
    const targetFiles = task.files || this._extractFileNamesFromTask(task);

    const report = {
      taskId: task.id,
      summary: analysis.summary || `Analisis selesai untuk task: ${task.title || task.id}`,
      findings: analysis.findings || [],
      adrReferenced: analysis.metrics?.adrReferenced || 'None',
      filesAnalyzed: Object.keys(analysis.rawContext || {}),
      recommendedFiles: targetFiles,
      compliance: analysis.compliance || { violations: [], warnings: [] },
      confidence: this._calculateConfidence(analysis),
      intent: intent,
      capabilityCheck: capabilityCheck || { pass: true, checks: [] },
      recommendation: analysis.recommendation || 'Lanjutkan dengan implementasi fitur',
      modelName: modelName,
      timestamp: new Date().toISOString()
    };

    console.log(`[Engineer] 🧠 Emitting Reasoning Report for task: ${task.id}`);
    console.log(`[Engineer] 📋 Report summary: ${report.summary}`);
    console.log(`[Engineer] 🎯 Intent: ${intent}, Model: ${modelName}`);

    this.eventBus.emit('Engineer:ReasoningReport', {
      ...report,
      from: 'Engineer',
      capability: this.capability,
      requiresApproval: false, // Reasoning report hanya perlu konfirmasi, bukan approval
    });

    return report;
  }

  /**
   * [FIX #2] Menunggu konfirmasi eksplisit dari user sebelum melanjutkan ke generasi patch.
   * Sekarang memiliki timeout otomatis 10 menit untuk mencegah memory leak.
   * @param {Object} report - Reasoning report yang akan dikonfirmasi
   * @returns {Promise<boolean>} true jika user mengkonfirmasi, false jika dibatalkan atau timeout
   */
  _waitForUserConfirmation(report) {
    return new Promise((resolve) => {
      const confirmationId = report.taskId || `CONFIRM-${Date.now()}`;

      // [FIX #2] Timeout otomatis untuk mencegah memory leak
      const timeout = setTimeout(() => {
        if (this.pendingConfirmations.has(confirmationId)) {
          console.warn(`[Engineer] ⏰ Confirmation timeout for ID: ${confirmationId}. Auto-cancelling.`);
          this.pendingConfirmations.delete(confirmationId);
          resolve(false);
        }
      }, CONFIRMATION_TIMEOUT_MS);

      // Simpan resolver + timeout di Map
      this.pendingConfirmations.set(confirmationId, {
        report,
        resolver: (result) => {
          clearTimeout(timeout); // Bersihkan timeout saat user merespons
          resolve(result);
        }
      });

      // Emit event ke UI untuk menampilkan tombol konfirmasi
      this.eventBus.emit('Engineer:RequestConfirmation', {
        confirmationId: confirmationId,
        report: report,
        summary: report.summary,
        findings: report.findings,
        confidence: report.confidence,
        intent: report.intent,
        modelName: report.modelName,
        filesAnalyzed: report.filesAnalyzed,
        recommendedFiles: report.recommendedFiles,
        timeoutMs: CONFIRMATION_TIMEOUT_MS,
        timestamp: new Date().toISOString()
      });

      console.log(`[Engineer] ⏳ Waiting for user confirmation (ID: ${confirmationId}, timeout: ${CONFIRMATION_TIMEOUT_MS / 1000}s)...`);
    });
  }

  /**
   * Handler untuk response konfirmasi dari user.
   * Dipanggil dari event listener Engineer:UserConfirmation.
   */
  _handleUserConfirmation(response) {
    const { confirmationId, confirmed } = response;
    const pending = this.pendingConfirmations.get(confirmationId);

    if (pending) {
      console.log(`[Engineer] ${confirmed ? '✅' : '❌'} User confirmation received for: ${confirmationId}`);
      pending.resolver(confirmed === true);
      this.pendingConfirmations.delete(confirmationId);
    } else {
      console.warn(`[Engineer] ⚠️ No pending confirmation found for ID: ${confirmationId} (mungkin sudah timeout)`);
    }
  }

  // =============================================
  // FASE 1: INTENT DETECTION & KLARIFIKASI
  // =============================================

  /**
   * Mendeteksi intent user berdasarkan keyword pada task title + description.
   * @param {Object} task - Task object dengan title & description
   * @returns {string} 'ANALYSIS' | 'MODIFY_CODE' | 'CLARIFICATION' | 'UNKNOWN'
   */
  _detectIntent(task) {
    const text = `${task.title || ''} ${task.description || ''}`.toLowerCase().trim();

    if (!text) {
      console.log('[Engineer] Task text kosong, return CLARIFICATION');
      return 'CLARIFICATION';
    }

    const analysisKeywords = [
      'analisis', 'review', 'telaah', 'evaluasi', 'cek', 'laporan',
      'analyze', 'analyse', 'check', 'examine', 'inspect',
      'audit', 'lihat', 'baca', 'pelajari', 'cari tahu',
      'what is', 'how does', 'explain', 'describe', 'tunjukkan',
      'diagnosa', 'diagnose'
    ];

    const modifyKeywords = [
      'ubah', 'tambah', 'hapus', 'perbaiki', 'refactor', 'implementasi',
      'change', 'add', 'remove', 'delete', 'fix', 'implement',
      'modify', 'update', 'create', 'buat', 'tulis', 'write',
      'patch', 'edit', 'ganti', 'masukkan', 'insert',
      'migrate', 'pindahkan', 'move'
    ];

    const isAnalysis = analysisKeywords.some(kw => text.includes(kw));
    const isModify = modifyKeywords.some(kw => text.includes(kw));

    // 1. Jika ambiguous (kedua kategori terdeteksi)
    if (isAnalysis && isModify) {
      console.log('[Engineer] Intent ambiguous: analysis + modify detected');
      return 'CLARIFICATION';
    }

    // 2. Jika tidak ada kategori yang terdeteksi
    if (!isAnalysis && !isModify) {
      console.log('[Engineer] Intent unknown: no keywords matched');
      return 'CLARIFICATION';
    }

    // 3. Analisis murni
    if (isAnalysis && !isModify) {
      console.log('[Engineer] Intent detected: ANALYSIS');
      return 'ANALYSIS';
    }

    // 4. Modifikasi kode murni
    console.log('[Engineer] Intent detected: MODIFY_CODE');
    return 'MODIFY_CODE';
  }

  // =============================================
  // DYNAMIC CONTEXT (Brain 2) & TASK HANDLING
  // =============================================

  /**
   * [FIX #5] _buildDynamicContext() diperkaya dengan metadata task dan file list.
   * Sebelumnya hampir kosong — sekarang menyediakan konteks yang berguna untuk analisis.
   * @param {Object} task - Task yang sedang diproses
   * @returns {Object} Dynamic context object
   */
  async _buildDynamicContext(task) {
    const targetFiles = task.files || this._extractFileNamesFromTask(task);
    let availableFiles = [];

    try {
      if (this.fileIndexService && this.fileIndexService.isReady) {
        availableFiles = this.fileIndexService.getAllFiles?.() || [];
      }
    } catch (e) {
      console.warn('[Engineer] Gagal mengambil file list dari FileIndexService:', e.message);
    }

    return {
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        files: targetFiles,
        requestedModel: task.requestedModel || null
      },
      projectContext: {
        totalIndexedFiles: availableFiles.length,
        targetFileCount: targetFiles.length,
        staticKnowledgeLoaded: this.brain.static?.loadedFiles?.length || 0
      },
      sessionContext: this.sessionArtifact ? this.sessionArtifact.getSummary() : null,
      timestamp: new Date().toISOString()
    };
  }

  async _handleAnalysisTask(task) {
    this.metrics.tasksAnalyzed++;
    console.log(`[Engineer] Analyzing task: ${task.title || task.id}`);
    this.brain.dynamic = await this._buildDynamicContext(task);
    const analysis = await this._analyze(task);

    // FASE 4: Update Session Artifact
    this._updateArtifact('ANALYSIS', {
      taskId: task.id,
      files: Object.keys(analysis.rawContext || {}),
      violations: analysis.compliance?.violations || [],
      summary: analysis.summary
    });

    this._emitRecommendation({
      type: 'ANALYSIS',
      taskId: task.id,
      analysis,
      confidence: this._calculateConfidence(analysis),
      requiresApproval: false
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
      confidence: this._calculateConfidence(review),
      requiresApproval: false
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

    // === FASE 1: INTENT DETECTION ===
    this.intentState = 'ANALYZING';
    const intent = this._detectIntent(task);
    console.log(`[Engineer] 🎯 Intent detected: ${intent} (task: ${task.title || task.id})`);

    if (intent === 'ANALYSIS') {
      this.intentState = 'READY';
      console.log(`[Engineer] 📋 Redirecting to ANALYSIS handler (bukan patch)`);
      await this._handleAnalysisTask(task);
      return;
    }

    if (intent === 'CLARIFICATION') {
      this.intentState = 'ASK_CLARIFICATION';
      const clarificationMsg = `Permintaan Anda membutuhkan klarifikasi. Apakah Anda ingin:\n1. 🔍 **Menganalisis** kode yang ada?\n2. ✏️ **Memodifikasi/menambahkan** kode?\n3. 📖 **Meninjau** perubahan yang sudah ada?\n\n_Mohon diperjelas agar Engineer dapat memberikan hasil yang tepat._`;

      console.log(`[Engineer] ❓ Asking clarification for task: ${task.title || task.id}`);
      this._emitRecommendation({
        type: 'ASK_CLARIFICATION',
        taskId: task.id,
        message: clarificationMsg,
        intent: intent,
        requiresApproval: false
      });
      return;
    }

    // Jika sampai sini, intent pasti MODIFY_CODE
    this.intentState = 'PROCEEDING';
    this.metrics.patchesGenerated++;
    console.log(`[Engineer] 🔨 Proceeding with patch generation for: ${task.title || task.id}`);
    this.brain.dynamic = await this._buildDynamicContext(task);

    // === FASE 2: CAPABILITY GUARD ===
    let modelName = 'unknown';
    try {
      const brainService = this.serviceManager.get('BrainService');
      if (brainService && typeof brainService.getActiveBrainContext === 'function') {
        const context = await brainService.getActiveBrainContext();
        modelName = context.model || modelName;
      }
    } catch (e) {
      console.warn('[Engineer] Gagal mendapatkan model name:', e.message);
    }

    const capabilityCheck = this._checkCapabilityAndDeclare(task, { modelName });

    if (!capabilityCheck.pass) {
      console.log(`[Engineer] 🚫 Capability check blocked task: ${task.title || task.id}`);
      this._updateArtifact('CAPABILITY_BLOCKED', {
        taskId: task.id,
        reason: capabilityCheck.reason
      });
      this._emitRecommendation({
        type: 'CAPABILITY_BLOCKED',
        taskId: task.id,
        message: `🧠 **Engineer (${modelName})** — Saya tidak dapat memproses permintaan ini.\n\n**Alasan:** ${capabilityCheck.reason}`,
        capabilityCheck,
        modelName,
        requiresApproval: false
      });
      return;
    }

    const analysis = await this._analyze(task);

    // === FASE 3: REASONING LOCK ===
    const reasoningReport = this._emitReasoningReport(task, analysis, {
      intent: 'MODIFY_CODE',
      capabilityCheck,
      modelName
    });

    // FASE 4: Update Session Artifact — Reasoning
    this._updateArtifact('REASONING', {
      taskId: task.id,
      report: reasoningReport,
      summary: reasoningReport.summary
    });

    // Tunggu konfirmasi user (Reasoning Lock)
    const userConfirmed = await this._waitForUserConfirmation(reasoningReport);

    if (!userConfirmed) {
      console.log(`[Engineer] 🚫 User membatalkan task: ${task.title || task.id}`);
      this._emitRecommendation({
        type: 'REASONING_REJECTED',
        taskId: task.id,
        message: `🧠 **Engineer (${modelName})** — Analisis telah dibatalkan.\n\n**Ringkasan Analisis:** ${reasoningReport.summary}\n\nAnda dapat mengirim ulang permintaan dengan instruksi yang lebih spesifik.`,
        reasoningReport,
        modelName,
        requiresApproval: false
      });
      return;
    }

    console.log(`[Engineer] ✅ User confirmed, proceeding to generate patch for: ${task.title || task.id}`);
    const patch = await this._generatePatch(task);

    // FASE 4: Update Session Artifact — Patch Generated
    this._updateArtifact('PATCH_GENERATED', {
      taskId: task.id,
      files: patch.files?.map(f => f.path) || []
    });

    if (patch.ready) {
      const verificationEngine = this.serviceManager.get('VerificationEngine');
      if (verificationEngine && typeof verificationEngine.verifyPatchEngineering === 'function') {
        try {
          const vContext = {
            responseText: JSON.stringify(patch.files.reduce((acc, f) => {
              acc[f.path] = f.newContent;
              return acc;
            }, {})),
            runtimeContext: { mode: 'ENGINEER' }
          };
          const verificationResult = verificationEngine.verifyPatchEngineering(vContext);
          patch.verification = {
            passed: verificationResult.decision === 'PASS',
            score: verificationResult.score,
            issues: verificationResult.failures,
            criticalCount: verificationResult.failures.filter(f => f.severity === 'CRITICAL').length
          };

          // FASE 4: Update Session Artifact — Verification
          this._updateArtifact('VERIFICATION', {
            taskId: task.id,
            passed: patch.verification.passed,
            issues: patch.verification.issues?.map(i => i.message).join(', ')
          });

          if (!patch.verification.passed) {
            console.warn('[Engineer] Patch gagal verifikasi:', patch.verification.issues);
            this.metrics.patchesFailedVerification++;
            patch.ready = false;

            this._emitRecommendation({
              type: 'PATCH_VERIFICATION_FAILED',
              taskId: task.id,
              patch,
              verification: patch.verification,
              message: `Patch tidak lolos verifikasi: ${patch.verification.criticalCount} masalah kritis.`,
              confidence: this._calculateConfidence(analysis),
              requiresApproval: false
            });
            return;
          }
        } catch (e) {
          console.warn('[Engineer] Frontend verification skipped:', e.message);
        }
      }
    }

    if (patch.ready) {
      const approvalResult = await this._requestApproval(patch, analysis);

      if (approvalResult.approved) {
        await this._executePatchApplication(patch, approvalResult.approvedFiles);
        this.metrics.patchesApproved++;

        // FASE 4: Update Session Artifact — Approved
        this._updateArtifact('APPROVED', {
          taskId: task.id,
          files: approvalResult.approvedFiles
        });

        this._emitRecommendation({
          type: 'PATCH_APPLIED',
          taskId: task.id,
          patch,
          message: `Patch diterapkan: ${approvalResult.approvedFiles.length} file dari ${patch.files.length}.`,
          confidence: this._calculateConfidence(analysis),
          requiresApproval: false
        });
      } else {
        this.metrics.patchesRejected++;

        // FASE 4: Update Session Artifact — Rejected
        this._updateArtifact('REJECTED', {
          taskId: task.id,
          reason: 'User menolak patch'
        });

        this._emitRecommendation({
          type: 'PATCH_REJECTED',
          taskId: task.id,
          patch,
          message: 'Patch ditolak oleh User.',
          confidence: this._calculateConfidence(analysis),
          requiresApproval: false
        });
      }
    } else {
      if (!patch.verification) {
        this._emitRecommendation({
          type: 'PATCH_FAILED',
          taskId: task.id,
          patch,
          confidence: this._calculateConfidence(analysis),
          requiresApproval: false
        });
      }
    }
  }

  _handleApprovalResponse(response) {
    const { patchId, approved, approvedFiles } = response;
    const pending = this.pendingPatches.get(patchId);

    if (pending) {
      pending.resolver({
        approved,
        approvedFiles: approvedFiles || []
      });
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

  async findFiles(pattern, dir = '.') {
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
    const text = `${task.title || ''} ${task.description || ''}`;
    console.log('[Engineer] Task text for extraction:', text);

    const fullPathRegex = /(frontend\/[a-zA-Z0-9_\-./]+\.(jsx?|tsx?|ts|json|md))/gi;
    const fullPathMatches = [...text.matchAll(fullPathRegex)];
    if (fullPathMatches.length > 0) {
      const extracted = [...new Set(fullPathMatches.map(m => m[0]))];
      console.log('[Engineer] Extracted full paths:', extracted);
      return extracted;
    }

    const srcPathRegex = /(src\/[a-zA-Z0-9_\-./]+\.(jsx?|tsx?|ts|json|md))/gi;
    const srcPathMatches = [...text.matchAll(srcPathRegex)];
    if (srcPathMatches.length > 0) {
      const extracted = [...new Set(srcPathMatches.map(m => m[0]))];
      console.log('[Engineer] Extracted src paths:', extracted);
      return extracted;
    }

    const nameRegex = /([a-zA-Z0-9_\-]+\.(jsx?|tsx?|ts|json|md))/gi;
    const nameMatches = [...text.matchAll(nameRegex)];
    const extracted = [...new Set(nameMatches.map(m => m[1]))];
    console.log('[Engineer] Extracted filenames (fallback):', extracted);
    return extracted;
  }

  _findRelevantADR(task) {
    const text = `${task.title || ''} ${task.description || ''}`.toLowerCase();

    const adrMapping = [
      { keywords: ['event', 'bus', 'emit', 'listener'], file: 'constitution/11_MAEF_EVENT_SYSTEM.md' },
      { keywords: ['kernel', 'boot', 'phase', 'service'], file: 'constitution/02_MAEF_KERNEL.md' },
      { keywords: ['adapter', 'vendor', 'openrouter', 'gemini'], file: 'constitution/12_CAPABILITY_ADAPTER_SPEC.md' },
      { keywords: ['verification', 'confidence', 'evidence'], file: 'constitution/13_VERIFICATION_ENGINE_SPEC.md' },
      { keywords: ['memory', 'user_memory', 'project_memory'], file: 'constitution/06_MEMORY_SYSTEM.md' },
      { keywords: ['rag', 'embedding', 'vector', 'chunk'], file: 'constitution/05_KNOWLEDGE_SYSTEM.md' },
      { keywords: ['engineer', 'patch', 'self-maintenance'], file: 'constitution/07_ENGINEERING_SYSTEM.md' },
      { keywords: ['logging', 'telemetry', 'observability'], file: 'constitution/15_LOGGING_OBSERVABILITY_SYSTEM.md' },
      { keywords: ['metric', 'health', 'shi'], file: 'constitution/16_ENGINEERING_METRICS_SYSTEM.md' }
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

  async _analyze(task) {
    console.log(`[Engineer] Memulai Real Analysis untuk: ${task.title || task.id}`);

    const targetFiles = this._extractFileNamesFromTask(task);
    console.log(`[Engineer] File terdeteksi: ${targetFiles.join(', ')}`);

    const fileContents = {};
    const readResults = [];

    for (const filePath of targetFiles.slice(0, MAX_FILES_PER_PATCH)) {
      const result = await this._tryReadFile(filePath);
      if (result) {
        fileContents[result.path] = result.content;
        readResults.push({ file: result.path, status: 'SUCCESS', size: result.content.length });
      } else {
        readResults.push({ file: filePath, status: 'NOT_FOUND' });
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
      console.log(`[Engineer] 🔨 Generating patch for task: ${task?.title || task?.id || 'unknown'}`);

      const relevantFiles = task?.files || [];
      const fileContents = {};

      const targetFiles = relevantFiles.length > 0
        ? relevantFiles
        : this._extractFileNamesFromTask(task);

      console.log(`[Engineer] 📂 Target files: ${targetFiles.join(', ')}`);

      // [FIX #4] Disamakan dengan MAX_FILES_PER_PATCH (10), sebelumnya hanya slice(0, 5)
      for (const filePath of targetFiles.slice(0, MAX_FILES_PER_PATCH)) {
        const result = await this._tryReadFile(filePath);
        if (result) {
          fileContents[result.path] = result.content;
          console.log(`[Engineer] ✅ Read: ${result.path} (${result.content.length} chars)`);
        } else {
          console.warn(`[Engineer] ⚠️ File not found: ${filePath}`);
        }
      }

      if (Object.keys(fileContents).length === 0) {
        console.warn('[Engineer] No files could be read for patch generation');
        return {
          files: [],
          description: 'No target files could be read.',
          ready: false,
          error: 'No readable files'
        };
      }

      let generatedCode = null;
      let rawLLMResponse = null;
      let modelUsed = 'fallback';

      console.log('[Engineer] 🔍 Checking BrainService availability...');

      let brainService = null;
      try {
        brainService = this.serviceManager.get('BrainService');
      } catch (e) {
        console.error('[Engineer] Error getting BrainService:', e.message);
      }

      if (brainService && typeof brainService.executeLLM === 'function') {
        console.log(`[Engineer] 🧠 BrainService available, calling LLM...`);
        const prompt = this._buildPatchPrompt(task, fileContents);

        try {
          rawLLMResponse = await brainService.executeLLM(prompt, {
            model: task?.requestedModel
          });
          modelUsed = task?.requestedModel || brainService.currentModel || 'unknown';

          console.log(`[Engineer] === LLM RAW RESPONSE DIAGNOSTIC ===`);
          console.log(`[Engineer] 🤖 Model: ${modelUsed}`);
          console.log(`[Engineer] Response length: ${rawLLMResponse?.length || 0} chars`);
          console.log(`[Engineer] First 300 chars: "${(rawLLMResponse || '').substring(0, 300).replace(/\n/g, '\\n')}"`);
          console.log(`[Engineer] === END DIAGNOSTIC ===`);

          generatedCode = this._extractCodeFromResponse(rawLLMResponse);
        } catch (llmError) {
          console.error('[Engineer] LLM call failed:', llmError.message);
          generatedCode = this._generateFallbackPatch(task, fileContents);
        }
      } else {
        console.warn('[Engineer] ⚠️ BrainService not available or missing executeLLM method');
        generatedCode = this._generateFallbackPatch(task, fileContents);
      }

      const patchFiles = [];
      for (const [filePath, newContent] of Object.entries(generatedCode || {})) {
        if (filePath === 'message' || filePath === 'reply' || filePath === 'content') continue;

        let finalContent = null;

        // === HANDLE FORMAT SEARCH-REPLACE ===
        if (newContent && typeof newContent === 'object' && newContent.__mode === 'search_replace') {
          const originalContent = fileContents[filePath] || '';
          let workingContent = originalContent;
          let changeCount = 0;

          if (Array.isArray(newContent.changes)) {
            for (const change of newContent.changes) {
              if (!change.search || typeof change.search !== 'string') continue;
              if (typeof change.replace !== 'string') continue;

              if (workingContent.includes(change.search)) {
                workingContent = workingContent.replace(change.search, change.replace);
                changeCount++;
                console.log(`[Engineer] ✅ Search-replace applied: "${change.search.substring(0, 50)}..."`);
              } else {
                const trimmedSearch = change.search.trim();
                if (workingContent.includes(trimmedSearch)) {
                  workingContent = workingContent.replace(trimmedSearch, change.replace);
                  changeCount++;
                  console.log(`[Engineer] ✅ Search-replace (trimmed) applied`);
                } else {
                  console.warn(`[Engineer] ⚠️ Search pattern not found: "${change.search.substring(0, 80)}"`);
                }
              }
            }
          }

          if (changeCount > 0) {
            finalContent = workingContent;
            console.log(`[Engineer] 🔄 Search-replace mode: ${changeCount} perubahan diterapkan ke ${filePath}`);
          } else {
            console.error(`[Engineer] ❌ Search-replace mode: tidak ada perubahan berhasil diterapkan ke ${filePath}`);
            continue;
          }
        }
        // === HANDLE FORMAT STRING BIASA ===
        else if (newContent !== null && newContent !== undefined && typeof newContent === 'string') {
          finalContent = newContent;
        }
        // === SKIP TIPE LAIN ===
        else {
          console.warn(`[Engineer] ⚠️ Skipping file "${filePath}": format tidak dikenal (${typeof newContent})`);
          continue;
        }

        patchFiles.push({
          path: filePath,
          newContent: finalContent,
          originalContent: fileContents[filePath] || '',
          status: 'PENDING_APPROVAL',
          size: finalContent.length
        });
      }

      const patch = {
        id: `PATCH-${Date.now()}`,
        taskId: task.id,
        files: patchFiles,
        description: task.description || 'Auto-generated patch',
        generatedAt: new Date().toISOString(),
        ready: patchFiles.length > 0,
        rawLLMResponse: rawLLMResponse,
        extractedCodeKeys: Object.keys(generatedCode || {}),
        modelUsed: modelUsed
      };

      this.eventBus.emit('Engineer:PatchGenerated', patch);
      return patch;
    } catch (error) {
      console.error('[Engineer] Patch generation failed:', error);
      return { files: [], description: `Patch generation failed: ${error.message}`, ready: false, error: error.message };
    }
  }

  /**
   * [FIX #3] _buildPatchPrompt() sekarang menyertakan Session Artifact context
   * untuk memungkinkan handoff antar model AI.
   */
  _buildPatchPrompt(task, fileContents) {
    let prompt = `### SYSTEM INSTRUCTION (WAJIB DIPATUHI) ###\n`;
    prompt += `Anda adalah Mamet Engineer. Tugas Anda adalah menghasilkan PATCH FILE dalam format JSON MURNI.\n\n`;

    // [FIX #3] Inject Session Artifact jika ada konteks sesi sebelumnya
    const artifactContext = this._injectArtifactIntoPrompt();
    if (artifactContext) {
      prompt += `### KONTEKS SESI SEBELUMNYA ###\n`;
      prompt += `(Gunakan ini sebagai referensi keputusan yang sudah diambil dalam sesi ini)\n`;
      prompt += artifactContext;
      prompt += `\n\n`;
    }

    prompt += `### ATURAN OUTPUT (CRITICAL - JANGAN DILANGGAR) ###\n`;
    prompt += `1. Karakter PERTAMA output Anda HARUS "{" (kurung kurawal buka)\n`;
    prompt += `2. Karakter TERAKHIR output Anda HARUS "}" (kurung kurawal tutup)\n`;
    prompt += `3. DILARANG KERAS menulis kalimat pembuka (contoh: "Baik", "Tentu", "Berikut", "Ini patch-nya")\n`;
    prompt += `4. DILARANG KERAS menulis kalimat penutup (contoh: "Semoga membantu", "Let me know")\n`;
    prompt += `5. DILARANG KERAS menggunakan markdown code block (\`\`\`json atau \`\`\`)\n`;
    prompt += `6. DILARANG KERAS menambah komentar di luar JSON\n`;
    prompt += `7. Output Anda akan di-PARSE oleh mesin. Jika ada teks di luar JSON, sistem akan ERROR.\n\n`;

    prompt += `### FORMAT JSON WAJIB ###\n`;
    prompt += `{\n`;
    prompt += `  "path/lengkap/ke/file1.jsx": "KONTEN LENGKAP FILE SETELAH PERUBAHAN (semua baris, dari import sampai penutup)",\n`;
    prompt += `  "path/lengkap/ke/file2.js": "KONTEN LENGKAP FILE SETELAH PERUBAHAN"\n`;
    prompt += `}\n\n`;

    prompt += `### CONTOH OUTPUT YANG BENAR ###\n`;
    prompt += `{\n`;
    prompt += `  "frontend/src/components/chat/ConversationEngine.jsx": "import React from 'react';\\n\\nexport default function ConversationEngine() {\\n  return <div>Test</div>;\\n}"\n`;
    prompt += `}\n\n`;

    prompt += `### CONTOH OUTPUT YANG SALAH (JANGAN DITIRU) ###\n`;
    prompt += `❌ "Tentu, berikut patch-nya:\\n\`\`\`json\\n{...}\\n\`\`\`\\nSemoga membantu!"\n`;
    prompt += `❌ "Saya akan menambahkan console.log. Ini kodenya: {...}"\n`;
    prompt += `❌ \`\`\`json\\n{...}\\n\`\`\`\n\n`;

    prompt += `### TUGAS ANDA ###\n`;
    prompt += `Task ID: ${task.title || task.id}\n`;
    prompt += `Deskripsi: ${task.description || 'Tidak ada deskripsi'}\n\n`;

    if (Object.keys(fileContents).length > 0) {
      const isLargeFile = Object.values(fileContents).some(c => c.length > 6000);

      if (isLargeFile) {
        prompt += `### STRATEGI MODIFIKASI: SEARCH-REPLACE ###\n`;
        prompt += `File yang diminta BESAR (>6000 chars). JANGAN kembalikan full file!\n`;
        prompt += `Gunakan format JSON SEARCH-REPLACE berikut:\n\n`;
        prompt += `{\n`;
        prompt += `  "path/ke/file.jsx": {\n`;
        prompt += `    "__mode": "search_replace",\n`;
        prompt += `    "changes": [\n`;
        prompt += `      {\n`;
        prompt += `        "search": "KODE ASLI YANG AKAN DIGANTI (EXACT, termasuk whitespace)",\n`;
        prompt += `        "replace": "KODE BARU PENGGANTINYA"\n`;
        prompt += `      }\n`;
        prompt += `    ]\n`;
        prompt += `  }\n`;
        prompt += `}\n\n`;

        prompt += `### FILE YANG DIMINTA UNTUK DIUBAH (REFERENSI) ###\n`;
        prompt += `(Hanya lihat konteks sekitar area yang perlu diubah. JANGAN kembalikan full file!)\n\n`;
        const MAX_FILE_CHARS = 8000;
        for (const [path, content] of Object.entries(fileContents)) {
          prompt += `--- FILE: ${path} (${content.length} chars total) ---\n`;
          if (content.length > MAX_FILE_CHARS) {
            const half = MAX_FILE_CHARS / 2;
            prompt += content.substring(0, half);
            prompt += `\n\n...[${content.length - MAX_FILE_CHARS} karakter dihilangkan, total file ${content.length} chars]...\n\n`;
            prompt += content.substring(content.length - half);
          } else {
            prompt += content;
          }
          prompt += `\n--- END FILE ---\n\n`;
        }
      } else {
        prompt += `### FILE YANG DIMINTA UNTUK DIUBAH ###\n`;
        prompt += `(Kembalikan KONTEN LENGKAP file setelah perubahan dalam JSON)\n\n`;
        for (const [path, content] of Object.entries(fileContents)) {
          prompt += `--- FILE: ${path} ---\n`;
          prompt += content;
          prompt += `\n--- END FILE ---\n\n`;
        }
      }
    }

    prompt += `### ATURAN KODE (WAJIB DIPATUHI) ###\n`;
    prompt += `- Kembalikan KONTEN LENGKAP file (jangan hanya diff/patch partial)\n`;
    prompt += `- Jangan ubah file yang tidak diminta\n`;
    prompt += `- Pertahankan komentar dan dokumentasi yang ada\n`;
    prompt += `- Ikuti standar ESModules\n`;
    prompt += `- JANGAN gunakan eval() atau new Function()\n`;
    prompt += `- Event EventBus HARUS pakai format Kategori:Nama (contoh: Engineer:Ready)\n`;
    prompt += `- Jangan panggil API vendor langsung (OpenAI, Gemini, dll)\n`;
    prompt += `- JANGAN modifikasi file core (Kernel.js, EventBus.js, ServiceManager.js, dll)\n\n`;

    prompt += `### MULAI OUTPUT JSON SEKARANG ###\n`;

    return prompt;
  }

  _extractCodeFromResponse(response) {
    try {
      if (!response || typeof response !== 'string') return {};

      try {
        const trimmed = response.trim();
        if (trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed);
          const keys = Object.keys(parsed);
          if (keys.length === 1 && (keys[0] === 'message' || keys[0] === 'reply' || keys[0] === 'content')) {
            const inner = parsed[keys[0]];
            if (typeof inner === 'string' && inner.trim().startsWith('{')) {
              try {
                const innerParsed = JSON.parse(inner);
                if (typeof innerParsed === 'object' && !Array.isArray(innerParsed)) {
                  console.log('[Engineer] ✅ Double-JSON unwrapped successfully');
                  return innerParsed;
                }
              } catch (_) {}
            }
          }
          return parsed;
        }
      } catch (_) {}

      const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
      const codeBlockMatches = [...response.matchAll(codeBlockRegex)];
      for (const match of codeBlockMatches) {
        const jsonCandidate = match[1].trim();
        try {
          const parsed = JSON.parse(jsonCandidate);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
          }
        } catch (_) {
          continue;
        }
      }

      const firstBrace = response.indexOf('{');
      const lastBrace = response.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonCandidate = response.substring(firstBrace, lastBrace + 1);
        const cleaned = jsonCandidate
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/\/\/[^\n]*/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '');
        try {
          const parsed = JSON.parse(cleaned);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed;
          }
        } catch (_) {}
      }

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

  async _executePatchApplication(patch, approvedFiles = []) {
    try {
      console.log(`[Engineer] 🔧 Menerapkan patch: ${patch.id}`);
      console.log(`[Engineer] 📋 Files to process: ${patch.files.length}, Approved: ${approvedFiles.length}`);

      for (const file of patch.files) {
        if (this._isImmutableFile(file.path)) {
          console.error(`[Engineer] 🚫 BLOCKED: Attempt to modify IMMUTABLE core file: ${file.path}`);
          this.metrics.coreModificationsBlocked++;
          this.suspiciousAttempts++;

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
            message: `🚫 BLOKIR: File "${file.path}" adalah CORE IMMUTABLE.`,
            severity: 'CRITICAL',
            requiresApproval: false
          });

          return { success: false, error: 'Core file modification blocked' };
        }
      }

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (const file of patch.files) {
        try {
          if (approvedFiles.length > 0 && !approvedFiles.includes(file.path)) {
            console.log(`[Engineer] ⏭️ Skipping (not approved): ${file.path}`);
            file.status = 'SKIPPED';
            skippedCount++;
            continue;
          }

          if (this._isProtectedFile(file.path)) {
            console.warn(`[Engineer] ⚠️ WARNING: Modifying PROTECTED file: ${file.path}`);
          }

          // Safety Check: Cegah LLM truncation overwrite file
          const originalSize = file.originalContent ? file.originalContent.length : 0;
          const newSize = file.newContent.length;
          if (originalSize > 500 && newSize < originalSize * 0.5) {
            console.error(`[Engineer] 🚫 DITOLAK: Konten baru (${newSize} chars) < 50% dari asli (${originalSize} chars). LLM kemungkinan truncate response!`);
            file.status = 'FAILED';
            file.error = `Konten terlalu kecil: ${newSize} vs ${originalSize} chars (${Math.round(newSize / originalSize * 100)}%). Kemungkinan LLM truncate response.`;
            failCount++;

            this.eventBus.emit('Engineer:Recommendation', {
              taskId: patch.taskId,
              message: `⚠️ **Patch Ditolak Otomatis**: File \`${file.path}\` tidak ditulis karena LLM mengembalikan konten yang terpotong (${newSize} dari ${originalSize} karakter). Coba lagi dengan instruksi yang lebih spesifik.`,
              type: 'SAFETY_REJECTION',
              requiresApproval: false
            });
            continue;
          }

          console.log(`[Engineer] ✍️ Menulis file: ${file.path} (${newSize} karakter, asli: ${originalSize} karakter)`);
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
            `Patch ${patch.id}: ${successCount} applied, ${skippedCount} skipped, ${failCount} failed.`
          );
        }
      } catch (e) {
        console.warn('[Engineer] Gagal menyimpan ke Project Memory:', e);
      }

      const result = {
        success: failCount === 0,
        patchId: patch.id,
        successCount,
        skippedCount,
        failCount,
        files: patch.files
      };

      this.eventBus.emit('Engineer:PatchApplied', result);
      console.log(`[Engineer] 🎯 Patch selesai: ${successCount} applied, ${skippedCount} skipped, ${failCount} failed`);

      return result;
    } catch (error) {
      console.error('[Engineer] ❌ Patch execution gagal total:', error);
      return { success: false, error: error.message };
    }
  }

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

  async _tryReadFile(basePath) {
    const normalizedBase = basePath.replace(/\\/g, '/');

    if (this.fileIndexService && !this.fileIndexService.isReady) {
      console.log('[Engineer] Menunggu FileIndexService selesai membangun indeks...');
      let attempts = 0;
      while (!this.fileIndexService.isReady && attempts < 100) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
    }

    let content = await this.storageManager.read(normalizedBase);
    if (content !== null && content !== undefined) {
      return { content, path: normalizedBase };
    }

    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.md'];
    const baseName = normalizedBase.replace(/\.[^.]+$/, '');

    for (const ext of extensions) {
      const candidate = baseName + ext;
      try {
        const content = await this.storageManager.read(candidate);
        if (content !== null && content !== undefined) {
          console.log(`[Engineer:_tryReadFile] ✅ BERHASIL membaca: "${candidate}"`);
          return { content, path: candidate };
        }
      } catch (_) {}
    }

    if (this.fileIndexService && this.fileIndexService.isReady) {
      const fileName = normalizedBase.split('/').pop();
      console.log(`[Engineer:_tryReadFile] 🔍 Mencari "${fileName}" via FileIndexService...`);
      const resolvedPath = this.fileIndexService.resolvePath(fileName);
      if (resolvedPath) {
        console.log(`[Engineer:_tryReadFile] 📍 FileIndexService meresolve ke: "${resolvedPath}"`);
        const content = await this.storageManager.read(resolvedPath);
        if (content !== null && content !== undefined) {
          return { content, path: resolvedPath };
        }
      }
    }

    console.log(`[Engineer:_tryReadFile] ❌ GAGAL: Semua metode gagal untuk "${normalizedBase}"`);
    return null;
  }

  /**
   * [FIX #2] _requestApproval() sekarang memiliki timeout otomatis 10 menit
   * untuk mencegah memory leak jika user menutup dialog tanpa merespons.
   */
  async _requestApproval(patch, analysis = null) {
    return new Promise((resolve) => {
      // [FIX #2] Timeout otomatis
      const timeout = setTimeout(() => {
        if (this.pendingPatches.has(patch.id)) {
          console.warn(`[Engineer] ⏰ Approval timeout for patch: ${patch.id}. Auto-rejecting.`);
          this.pendingPatches.delete(patch.id);
          resolve({ approved: false, approvedFiles: [] });
        }
      }, APPROVAL_TIMEOUT_MS);

      this.pendingPatches.set(patch.id, {
        patch,
        resolver: (result) => {
          clearTimeout(timeout);
          resolve(result);
        }
      });

      this.eventBus.emit('Engineer:RequestApproval', {
        patchId: patch.id,
        summary: patch.description || 'Patch generated',
        files: patch.files.map(f => ({
          path: f.path,
          status: f.status,
          size: f.size || 0,
          newContent: f.newContent,
          originalContent: f.originalContent,
          isImmutable: this._isImmutableFile(f.path),
          isProtected: this._isProtectedFile(f.path)
        })),
        diff: patch.diff || '',
        verification: patch.verification || null,
        confidence: analysis ? this._calculateConfidence(analysis) : { level: 'UNKNOWN', coverage: 0, evidence: 0 },
        compliance: analysis?.compliance || { violations: [], warnings: [] },
        timeoutMs: APPROVAL_TIMEOUT_MS,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * [FIX #1] _emitRecommendation() tidak lagi memaksa requiresApproval: true.
   * Menggunakan nullish coalescing (??) agar caller bisa set requiresApproval: false.
   */
  _emitRecommendation(recommendation) {
    this.eventBus.emit('Engineer:Recommendation', {
      ...recommendation,
      from: 'Engineer',
      capability: this.capability,
      // [FIX #1] Sebelumnya: requiresApproval: true (selalu override)
      // Sekarang: pakai nilai dari caller, default true hanya jika tidak di-set
      requiresApproval: recommendation.requiresApproval ?? true,
      timestamp: new Date().toISOString()
    });
  }

  upgradeCapability(newCapability) {
    const validCapabilities = [
      'OBSERVER', 'REVIEWER', 'ARCHITECT', 'PLANNER',
      'IMPLEMENTER', 'VERIFIER', 'SELF_MAINTENANCE'
    ];
    if (validCapabilities.includes(newCapability)) {
      this.capability = newCapability;
      this.suspiciousAttempts = 0;
      console.log(`[Engineer] Capability upgraded to ${newCapability}`);
      this.eventBus.emit('Engineer:CapabilityUpdated', { capability: this.capability });
    } else {
      console.warn(`[Engineer] Invalid capability: ${newCapability}`);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      capability: this.capability,
      suspiciousAttempts: this.suspiciousAttempts,
      sessionSummary: this.sessionArtifact ? this.sessionArtifact.getSummary() : null
    };
  }
}

export { Engineer };