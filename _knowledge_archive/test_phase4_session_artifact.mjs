/**
 * Unit Test untuk Fase 4 — Session Artifact
 * 
 * Cara menjalankan: node test_phase4_session_artifact.mjs
 * 
 * Method yang diuji:
 * - SessionArtifact class (constructor, addDecision, addAnalyzedFile, addModifiedFile, dll)
 * - Engineer._initializeSessionArtifact()
 * - Engineer._updateArtifact(action, data)
 * - Engineer._injectArtifactIntoPrompt()
 */

// =============================================
// MOCK EventBus
// =============================================
class MockEventBus {
  constructor() {
    this.listeners = {};
    this.emittedEvents = [];
  }

  on(event, handler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h !== handler);
  }

  emit(event, payload) {
    this.emittedEvents.push({ event, payload });
    const handlers = this.listeners[event];
    if (handlers) {
      handlers.forEach(handler => handler(payload));
    }
  }

  clear() {
    this.emittedEvents = [];
    this.listeners = {};
  }
}

// =============================================
// COPY SessionArtifact class dari engineer.js
// =============================================
class SessionArtifact {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.decisions = [];
    this.analyzedFiles = [];
    this.modifiedFiles = [];
    this.maefViolations = [];
    this.reasoningReports = [];
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

// =============================================
// MOCK class Engineer untuk test Fase 4
// =============================================
class MockEngineer {
  constructor(eventBus) {
    this.eventBus = eventBus || new MockEventBus();
    this.capability = 'IMPLEMENTER';
    this.sessionArtifact = null;
  }

  _initializeSessionArtifact() {
    const sessionId = `ENG-SESSION-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.sessionArtifact = new SessionArtifact(sessionId);
    return sessionId;
  }

  _updateArtifact(action, data = {}) {
    if (!this.sessionArtifact) {
      return false;
    }
    let success = true;

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
        return false;
    }
    return true;
  }

  _injectArtifactIntoPrompt() {
    if (!this.sessionArtifact) {
      return '';
    }
    return this.sessionArtifact.toPromptContext();
  }
}

// =============================================
// TEST RUNNER
// =============================================
let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function runTests() {
  console.log('\n===========================================');
  console.log('  UNIT TEST: Fase 4 — Session Artifact');
  console.log('===========================================\n');

  const eventBus = new MockEventBus();
  const engineer = new MockEngineer(eventBus);

  for (const { name, fn } of tests) {
    eventBus.clear();
    try {
      fn(engineer, eventBus);
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
      failed++;
      console.log(`  ❌ FAIL: ${name}`);
      console.log(`     ${err.message}`);
    }
  }

  const total = passed + failed;
  console.log('\n===========================================');
  console.log(`  HASIL: ${passed}/${total} passed, ${failed} failed`);
  console.log('===========================================\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

// =============================================
// === FASE 4: SESSION ARTIFACT TESTS ===
// =============================================

test('4.1: SessionArtifact constructor — proper initialization', (eng, bus) => {
  const artifact = new SessionArtifact('TEST-SESSION-001');
  
  if (!artifact.sessionId) throw new Error('Missing sessionId');
  if (artifact.sessionId !== 'TEST-SESSION-001') throw new Error(`Expected TEST-SESSION-001, got ${artifact.sessionId}`);
  if (!Array.isArray(artifact.decisions)) throw new Error('decisions should be array');
  if (!Array.isArray(artifact.analyzedFiles)) throw new Error('analyzedFiles should be array');
  if (!Array.isArray(artifact.modifiedFiles)) throw new Error('modifiedFiles should be array');
  if (!Array.isArray(artifact.maefViolations)) throw new Error('maefViolations should be array');
  if (!Array.isArray(artifact.reasoningReports)) throw new Error('reasoningReports should be array');
  if (artifact.taskCount !== 0) throw new Error(`Expected taskCount=0, got ${artifact.taskCount}`);
  if (!artifact.startedAt) throw new Error('Missing startedAt');
  if (!artifact.lastActivity) throw new Error('Missing lastActivity');
});

test('4.2: SessionArtifact.addDecision — menambahkan keputusan dengan timestamp', (eng, bus) => {
  const artifact = new SessionArtifact('TEST-002');
  
  artifact.addDecision({ type: 'ANALYSIS', detail: 'Test decision', taskId: 'TASK-001' });
  
  if (artifact.decisions.length !== 1) throw new Error(`Expected 1 decision, got ${artifact.decisions.length}`);
  if (artifact.decisions[0].type !== 'ANALYSIS') throw new Error(`Expected ANALYSIS, got ${artifact.decisions[0].type}`);
  if (!artifact.decisions[0].timestamp) throw new Error('Missing timestamp on decision');
});

test('4.3: SessionArtifact.addAnalyzedFile — tidak duplikat', (eng, bus) => {
  const artifact = new SessionArtifact('TEST-003');
  
  artifact.addAnalyzedFile('file1.jsx');
  artifact.addAnalyzedFile('file2.js');
  artifact.addAnalyzedFile('file1.jsx'); // Duplikat
  
  if (artifact.analyzedFiles.length !== 2) throw new Error(`Expected 2 unique files, got ${artifact.analyzedFiles.length}`);
});

test('4.4: SessionArtifact.addModifiedFile — tidak duplikat', (eng, bus) => {
  const artifact = new SessionArtifact('TEST-004');
  
  artifact.addModifiedFile('file1.jsx');
  artifact.addModifiedFile('file1.jsx'); // Duplikat
  
  if (artifact.modifiedFiles.length !== 1) throw new Error(`Expected 1 unique file, got ${artifact.modifiedFiles.length}`);
});

test('4.5: SessionArtifact.addReasoningReport — menyimpan report dengan benar', (eng, bus) => {
  const artifact = new SessionArtifact('TEST-005');
  
  artifact.addReasoningReport({
    taskId: 'TASK-001',
    summary: 'Analisis selesai',
    confidence: { level: 'HIGH', coverage: 80, evidence: 85 }
  });
  
  if (artifact.reasoningReports.length !== 1) throw new Error(`Expected 1 report, got ${artifact.reasoningReports.length}`);
  if (artifact.reasoningReports[0].taskId !== 'TASK-001') throw new Error(`Expected TASK-001`);
  if (artifact.reasoningReports[0].confidence.level !== 'HIGH') throw new Error(`Expected HIGH confidence`);
});

test('4.6: SessionArtifact.addMaefViolation — menyimpan violation', (eng, bus) => {
  const artifact = new SessionArtifact('TEST-006');
  
  artifact.addMaefViolation({ severity: 'HIGH', message: 'Direct vendor call', file: 'test.js' });
  
  if (artifact.maefViolations.length !== 1) throw new Error(`Expected 1 violation, got ${artifact.maefViolations.length}`);
  if (!artifact.maefViolations[0].recordedAt) throw new Error('Missing recordedAt timestamp');
});

test('4.7: SessionArtifact.incrementTaskCount — increment task counter', (eng, bus) => {
  const artifact = new SessionArtifact('TEST-007');
  
  artifact.incrementTaskCount();
  artifact.incrementTaskCount();
  artifact.incrementTaskCount();
  
  if (artifact.taskCount !== 3) throw new Error(`Expected 3, got ${artifact.taskCount}`);
});

test('4.8: SessionArtifact.getSummary — menghasilkan summary yang benar', (eng, bus) => {
  const artifact = new SessionArtifact('TEST-008');
  
  artifact.addAnalyzedFile('file1.jsx');
  artifact.addModifiedFile('file2.js');
  artifact.addDecision({ type: 'ANALYSIS', detail: 'Test', taskId: 'TASK-001' });
  artifact.incrementTaskCount();
  
  const summary = artifact.getSummary();
  
  if (summary.sessionId !== 'TEST-008') throw new Error(`Expected TEST-008`);
  if (summary.taskCount !== 1) throw new Error(`Expected 1 task`);
  if (summary.analyzedFilesCount !== 1) throw new Error(`Expected 1 analyzed file`);
  if (summary.modifiedFilesCount !== 1) throw new Error(`Expected 1 modified file`);
  if (summary.decisionsCount !== 1) throw new Error(`Expected 1 decision`);
  if (!summary.duration) throw new Error('Missing duration');
  if (!summary.startedAt) throw new Error('Missing startedAt');
  if (!summary.lastActivity) throw new Error('Missing lastActivity');
});

test('4.9: SessionArtifact.toPromptContext — menghasilkan konteks terformat', (eng, bus) => {
  const artifact = new SessionArtifact('TEST-009');
  
  artifact.addAnalyzedFile('ConversationEngine.jsx');
  artifact.addModifiedFile('engineer.js');
  artifact.addDecision({ type: 'ANALYSIS', detail: 'Analisis selesai', taskId: 'TASK-001' });
  artifact.addReasoningReport({
    taskId: 'TASK-001',
    summary: 'Analisis: 2 file, 0 pelanggaran',
    confidence: { level: 'HIGH', coverage: 80, evidence: 85 }
  });
  artifact.incrementTaskCount();
  
  const context = artifact.toPromptContext();
  
  if (!context.includes('SESSION ARTIFACT')) throw new Error('Missing SESSION ARTIFACT header');
  if (!context.includes('TEST-009')) throw new Error('Missing session ID');
  if (!context.includes('ConversationEngine.jsx')) throw new Error('Missing analyzed file');
  if (!context.includes('engineer.js')) throw new Error('Missing modified file');
  if (!context.includes('REASONING REPORTS')) throw new Error('Missing reasoning reports section');
  if (!context.includes('KEPUTUSAN TERAKHIR')) throw new Error('Missing decisions section');
  if (!context.includes('END SESSION ARTIFACT')) throw new Error('Missing END SESSION ARTIFACT footer');
});

test('4.10: Engineer._initializeSessionArtifact — membuat sessionId unik', (eng, bus) => {
  const eng1 = new MockEngineer();
  const eng2 = new MockEngineer();
  
  const id1 = eng1._initializeSessionArtifact();
  const id2 = eng2._initializeSessionArtifact();
  
  if (!id1) throw new Error('Session ID 1 should not be empty');
  if (!id2) throw new Error('Session ID 2 should not be empty');
  if (id1 === id2) throw new Error('Session IDs should be unique');
  if (!id1.startsWith('ENG-SESSION-')) throw new Error(`Expected ENG-SESSION- prefix, got ${id1}`);
});

test('4.11: Engineer._updateArtifact — ANALYSIS action', (eng, bus) => {
  eng._initializeSessionArtifact();
  
  const result = eng._updateArtifact('ANALYSIS', {
    taskId: 'TASK-001',
    files: ['file1.jsx', 'file2.js'],
    violations: [{ severity: 'HIGH', message: 'Test violation' }],
    summary: 'Analisis: 2 file'
  });
  
  if (result !== true) throw new Error('_updateArtifact should return true');
  if (eng.sessionArtifact.taskCount !== 1) throw new Error(`Expected 1 task`);
  if (eng.sessionArtifact.analyzedFiles.length !== 2) throw new Error(`Expected 2 analyzed files`);
  if (eng.sessionArtifact.maefViolations.length !== 1) throw new Error(`Expected 1 violation`);
  if (eng.sessionArtifact.decisions.length !== 1) throw new Error(`Expected 1 decision`);
});

test('4.12: Engineer._updateArtifact — REASONING action', (eng, bus) => {
  eng._initializeSessionArtifact();
  
  const result = eng._updateArtifact('REASONING', {
    taskId: 'TASK-002',
    report: {
      taskId: 'TASK-002',
      summary: 'Reasoning report',
      confidence: { level: 'MEDIUM', coverage: 60, evidence: 70 }
    },
    summary: 'Reasoning report dikeluarkan'
  });
  
  if (result !== true) throw new Error('_updateArtifact should return true');
  if (eng.sessionArtifact.reasoningReports.length !== 1) throw new Error(`Expected 1 reasoning report`);
  if (eng.sessionArtifact.decisions.length !== 1) throw new Error(`Expected 1 decision`);
});

test('4.13: Engineer._updateArtifact — PATCH_GENERATED action', (eng, bus) => {
  eng._initializeSessionArtifact();
  
  const result = eng._updateArtifact('PATCH_GENERATED', {
    taskId: 'TASK-003',
    files: ['modified1.jsx', 'modified2.js']
  });
  
  if (result !== true) throw new Error('_updateArtifact should return true');
  if (eng.sessionArtifact.modifiedFiles.length !== 2) throw new Error(`Expected 2 modified files`);
  if (eng.sessionArtifact.decisions.length !== 1) throw new Error(`Expected 1 decision`);
});

test('4.14: Engineer._updateArtifact — VERIFICATION action (passed)', (eng, bus) => {
  eng._initializeSessionArtifact();
  
  const result = eng._updateArtifact('VERIFICATION', {
    taskId: 'TASK-004',
    passed: true
  });
  
  if (result !== true) throw new Error('_updateArtifact should return true');
  if (eng.sessionArtifact.decisions.length !== 1) throw new Error(`Expected 1 decision`);
  if (!eng.sessionArtifact.decisions[0].detail.includes('lulus')) throw new Error('Expected verification passed message');
});

test('4.15: Engineer._updateArtifact — VERIFICATION action (failed)', (eng, bus) => {
  eng._initializeSessionArtifact();
  
  const result = eng._updateArtifact('VERIFICATION', {
    taskId: 'TASK-005',
    passed: false,
    issues: 'CRITICAL: eval() detected'
  });
  
  if (result !== true) throw new Error('_updateArtifact should return true');
  if (eng.sessionArtifact.decisions.length !== 1) throw new Error(`Expected 1 decision`);
  if (!eng.sessionArtifact.decisions[0].detail.includes('gagal')) throw new Error('Expected verification failed message');
});

test('4.16: Engineer._updateArtifact — APPROVED action', (eng, bus) => {
  eng._initializeSessionArtifact();
  
  const result = eng._updateArtifact('APPROVED', {
    taskId: 'TASK-006',
    files: ['approved1.jsx', 'approved2.js']
  });
  
  if (result !== true) throw new Error('_updateArtifact should return true');
  if (eng.sessionArtifact.decisions.length !== 1) throw new Error(`Expected 1 decision`);
  if (!eng.sessionArtifact.decisions[0].detail.includes('disetujui')) throw new Error('Expected approved message');
});

test('4.17: Engineer._updateArtifact — REJECTED action', (eng, bus) => {
  const localEng = new MockEngineer();
  localEng._initializeSessionArtifact();
  
  const result = localEng._updateArtifact('REJECTED', {
    taskId: 'TASK-007',
    reason: 'User menolak patch'
  });
  
  if (result !== true) throw new Error('_updateArtifact should return true');
  if (localEng.sessionArtifact.decisions.length !== 1) throw new Error(`Expected 1 decision`);
  if (!localEng.sessionArtifact.decisions[0].detail.includes('menolak')) throw new Error('Expected rejected message');
});

test('4.18: Engineer._updateArtifact — CAPABILITY_BLOCKED action', (eng, bus) => {
  const localEng = new MockEngineer();
  localEng._initializeSessionArtifact();
  
  const result = localEng._updateArtifact('CAPABILITY_BLOCKED', {
    taskId: 'TASK-008',
    reason: 'Prompt terlalu pendek'
  });
  
  if (result !== true) throw new Error('_updateArtifact should return true');
  if (localEng.sessionArtifact.decisions.length !== 1) throw new Error(`Expected 1 decision`);
  if (!localEng.sessionArtifact.decisions[0].detail.includes('pendek')) throw new Error('Expected capability blocked message');
});

test('4.19: Engineer._updateArtifact — tanpa inisialisasi (sessionArtifact null)', (eng, bus) => {
  const localEng = new MockEngineer();
  // Jangan panggil _initializeSessionArtifact()
  const result = localEng._updateArtifact('ANALYSIS', { taskId: 'TASK-009' });
  
  if (result !== false) throw new Error('Should return false when sessionArtifact is null');
});

test('4.20: Engineer._updateArtifact — action tidak dikenal', (eng, bus) => {
  eng._initializeSessionArtifact();
  
  const result = eng._updateArtifact('UNKNOWN_ACTION', { taskId: 'TASK-010' });
  
  if (result !== false) throw new Error('Should return false for unknown action');
});

test('4.21: Engineer._injectArtifactIntoPrompt — menghasilkan konteks', (eng, bus) => {
  eng._initializeSessionArtifact();
  
  eng._updateArtifact('ANALYSIS', {
    taskId: 'TASK-011',
    files: ['file1.jsx'],
    summary: 'Analisis selesai'
  });
  
  const context = eng._injectArtifactIntoPrompt();
  
  if (!context) throw new Error('Context should not be empty');
  if (!context.includes('SESSION ARTIFACT')) throw new Error('Missing SESSION ARTIFACT header');
  if (!context.includes('file1.jsx')) throw new Error('Missing analyzed file in context');
});

test('4.22: Engineer._injectArtifactIntoPrompt — tanpa inisialisasi', (eng, bus) => {
  const localEng = new MockEngineer();
  // Jangan panggil _initializeSessionArtifact()
  const context = localEng._injectArtifactIntoPrompt();
  
  if (context !== '') throw new Error('Should return empty string when sessionArtifact is null');
});

test('4.23: Integration — full flow dengan multiple actions', (eng, bus) => {
  eng._initializeSessionArtifact();
  
  // Simulasi flow lengkap
  eng._updateArtifact('ANALYSIS', {
    taskId: 'TASK-012',
    files: ['ConversationEngine.jsx', 'engineer.js'],
    violations: [{ severity: 'LOW', message: 'Warning: file besar' }],
    summary: 'Analisis: 2 file, 1 warning'
  });
  
  eng._updateArtifact('REASONING', {
    taskId: 'TASK-012',
    report: {
      taskId: 'TASK-012',
      summary: 'Analisis selesai, confidence HIGH',
      confidence: { level: 'HIGH', coverage: 80, evidence: 85 }
    }
  });
  
  eng._updateArtifact('PATCH_GENERATED', {
    taskId: 'TASK-012',
    files: ['ConversationEngine.jsx']
  });
  
  eng._updateArtifact('VERIFICATION', {
    taskId: 'TASK-012',
    passed: true
  });
  
  eng._updateArtifact('APPROVED', {
    taskId: 'TASK-012',
    files: ['ConversationEngine.jsx']
  });
  
  // Verifikasi state akhir
  const summary = eng.sessionArtifact.getSummary();
  
  if (summary.taskCount !== 1) throw new Error(`Expected 1 task, got ${summary.taskCount}`);
  if (summary.analyzedFilesCount !== 2) throw new Error(`Expected 2 analyzed files, got ${summary.analyzedFilesCount}`);
  if (summary.modifiedFilesCount !== 1) throw new Error(`Expected 1 modified file, got ${summary.modifiedFilesCount}`);
  if (summary.decisionsCount !== 5) throw new Error(`Expected 5 decisions, got ${summary.decisionsCount}`);
  if (summary.violationsFound !== 1) throw new Error(`Expected 1 violation, got ${summary.violationsFound}`);
  if (summary.reasoningReportsCount !== 1) throw new Error(`Expected 1 reasoning report, got ${summary.reasoningReportsCount}`);
  
  // Verifikasi toPromptContext
  const context = eng._injectArtifactIntoPrompt();
  if (!context.includes('ConversationEngine.jsx')) throw new Error('Missing ConversationEngine.jsx in context');
  if (!context.includes('engineer.js')) throw new Error('Missing engineer.js in context');
  if (!context.includes('REASONING REPORTS')) throw new Error('Missing reasoning reports in context');
  if (!context.includes('KEPUTUSAN TERAKHIR')) throw new Error('Missing decisions in context');
});

// =============================================
// JALANKAN SEMUA TEST
// =============================================
runTests();
