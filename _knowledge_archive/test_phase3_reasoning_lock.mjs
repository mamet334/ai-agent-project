/**
 * Unit Test untuk Fase 3 — Reasoning Lock & Laporan
 * 
 * Cara menjalankan: node test_phase3_reasoning_lock.mjs
 * 
 * Method yang diuji:
 * - Engineer._emitReasoningReport(task, analysis, options)
 * - Engineer._waitForUserConfirmation(report)
 * - Engineer._handleUserConfirmation(response)
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
// MOCK class Engineer untuk test Fase 3
// =============================================
class MockEngineer {
  constructor(eventBus) {
    this.eventBus = eventBus || new MockEventBus();
    this.capability = 'IMPLEMENTER';
    this.pendingConfirmations = new Map(); // Untuk Reasoning Lock
    this.metrics = {
      tasksAnalyzed: 0,
      recommendationsMade: 0,
      patchesGenerated: 0,
      patchesApproved: 0
    };
  }

  // =============================================
  // DEPENDENSI: _extractFileNamesFromTask
  // =============================================
  _extractFileNamesFromTask(task) {
    const text = `${task.title || ''} ${task.description || ''}`;
    const fullPathRegex = /(frontend\/[a-zA-Z0-9_\-./]+\.(jsx?|tsx?|ts|json|md))/gi;
    const fullPathMatches = [...text.matchAll(fullPathRegex)];
    if (fullPathMatches.length > 0) {
      return [...new Set(fullPathMatches.map(m => m[0]))];
    }
    const nameRegex = /([a-zA-Z0-9_\-]+\.(jsx?|tsx?|ts|json|md))/gi;
    const nameMatches = [...text.matchAll(nameRegex)];
    return [...new Set(nameMatches.map(m => m[1]))];
  }

  // =============================================
  // DEPENDENSI: _calculateConfidence
  // =============================================
  _calculateConfidence(result) {
    return { coverage: 80, evidence: 85, level: 'HIGH' };
  }

  // =============================================
  // DEPENDENSI: _emitRecommendation
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
  // FASE 3: REASONING LOCK & LAPORAN
  // (Copy dari engineer.js yang sudah diupdate)
  // =============================================

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

    // Emit event ke UI untuk ditampilkan sebagai Reasoning Block
    this.eventBus.emit('Engineer:ReasoningReport', {
      ...report,
      from: 'Engineer',
      capability: this.capability,
      requiresApproval: false,
    });

    return report;
  }

  _waitForUserConfirmation(report) {
    return new Promise((resolve) => {
      const confirmationId = report.taskId || `CONFIRM-${Date.now()}`;

      // Simpan resolver di Map untuk direspon dari event listener
      this.pendingConfirmations.set(confirmationId, { report, resolver: resolve });

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
        timestamp: new Date().toISOString()
      });
    });
  }

  _handleUserConfirmation(response) {
    const { confirmationId, confirmed } = response;
    const pending = this.pendingConfirmations.get(confirmationId);

    if (pending) {
      pending.resolver(confirmed === true);
      this.pendingConfirmations.delete(confirmationId);
      return true;
    }
    return false;
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
  console.log('  UNIT TEST: Fase 3 — Reasoning Lock');
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
// === FASE 3: REASONING LOCK TESTS ===
// =============================================

test('3.1: _emitReasoningReport menghasilkan report dengan struktur yang benar', (eng, bus) => {
  const task = { id: 'TASK-001', title: 'Test', description: 'Tambah method baru' };
  const analysis = {
    summary: 'Analisis selesai: 2 file, 50 baris, 0 pelanggaran',
    findings: ['✅ Tidak ada pelanggaran MAEF'],
    metrics: { adrReferenced: '/constitution/07_ENGINEERING_SYSTEM.md' },
    rawContext: { 'file1.jsx': 'content', 'file2.js': 'content' },
    compliance: { violations: [], warnings: [] },
    recommendation: 'Kode aman, lanjutkan'
  };

  const report = eng._emitReasoningReport(task, analysis, { intent: 'MODIFY_CODE', modelName: 'gpt-4o-mini' });

  // Struktur report
  if (!report.taskId) throw new Error('Missing taskId');
  if (!report.summary) throw new Error('Missing summary');
  if (!report.findings) throw new Error('Missing findings');
  if (!report.confidence) throw new Error('Missing confidence');
  if (!report.timestamp) throw new Error('Missing timestamp');

  // Value check
  if (report.intent !== 'MODIFY_CODE') throw new Error(`Expected MODIFY_CODE, got ${report.intent}`);
  if (report.modelName !== 'gpt-4o-mini') throw new Error(`Expected gpt-4o-mini, got ${report.modelName}`);
  if (report.filesAnalyzed.length !== 2) throw new Error(`Expected 2 files, got ${report.filesAnalyzed.length}`);
});

test('3.2: _emitReasoningReport mengemit event Engineer:ReasoningReport', (eng, bus) => {
  const task = { id: 'TASK-002', title: 'Test', description: 'Refactor komponen' };
  const analysis = {
    summary: 'Analisis selesai',
    findings: [],
    rawContext: {},
    compliance: { violations: [], warnings: [] },
    recommendation: 'Lanjutkan'
  };

  eng._emitReasoningReport(task, analysis, { modelName: 'gpt-4' });

  const emitted = bus.emittedEvents.find(e => e.event === 'Engineer:ReasoningReport');
  if (!emitted) throw new Error('Event Engineer:ReasoningReport tidak diemisi');
  if (!emitted.payload.taskId) throw new Error('Payload missing taskId');
  if (!emitted.payload.summary) throw new Error('Payload missing summary');
});

test('3.3: _emitReasoningReport menyertakan semua field opsional', (eng, bus) => {
  const task = { id: 'TASK-003', title: 'Integrasi Service Baru', description: 'Lakukan integrasi service baru untuk payment gateway. Dibutuhkan penambahan pipeline baru di backend.' };
  const analysis = {
    summary: 'Analisis: butuh ADR',
    findings: ['🔴 1 pelanggaran MAEF'],
    metrics: { adrReferenced: '/constitution/02_MAEF_KERNEL.md' },
    rawContext: { 'backend/server.js': 'content' },
    compliance: { violations: [{ severity: 'HIGH', message: 'Direct vendor call' }], warnings: [] },
    recommendation: 'Perlu ADR sebelum implementasi'
  };
  const capCheck = { pass: false, reason: 'ADR diperlukan', checks: [{ pass: false, reason: 'test' }] };

  const report = eng._emitReasoningReport(task, analysis, {
    intent: 'MODIFY_CODE',
    capabilityCheck: capCheck,
    modelName: 'gpt-4o'
  });

  if (report.adrReferenced !== '/constitution/02_MAEF_KERNEL.md') throw new Error(`Expected ADR path`);
  if (report.compliance.violations.length !== 1) throw new Error(`Expected 1 violation, got ${report.compliance.violations.length}`);
  if (report.capabilityCheck.pass !== false) throw new Error('Expected capabilityCheck.pass=false');
  if (!report.recommendation.includes('ADR')) throw new Error(`Expected ADR in recommendation`);
});

test('3.4: _emitReasoningReport dengan fallback untuk data kosong', (eng, bus) => {
  const task = { id: 'TASK-004' };
  const analysis = {};

  const report = eng._emitReasoningReport(task, analysis);

  if (!report.summary) throw new Error('Summary should have fallback');
  if (report.findings.length !== 0) throw new Error('Findings should be empty');
  if (report.filesAnalyzed.length !== 0) throw new Error('filesAnalyzed should be empty');
  if (!report.recommendation) throw new Error('Recommendation should have fallback');
});

test('3.5: _waitForUserConfirmation mengembalikan Promise dan mengemit event', async (eng, bus) => {
  const report = { taskId: 'TASK-005', summary: 'Test confirmation' };

  // Mulai wait
  const confirmPromise = eng._waitForUserConfirmation(report);

  // Verifikasi event teremisi
  const emitted = bus.emittedEvents.find(e => e.event === 'Engineer:RequestConfirmation');
  if (!emitted) throw new Error('Event Engineer:RequestConfirmation tidak diemisi');
  if (!emitted.payload.confirmationId) throw new Error('Payload missing confirmationId');
  if (!emitted.payload.summary) throw new Error('Payload missing summary');

  // Verifikasi pendingConfirmations terisi
  const confirmationId = emitted.payload.confirmationId;
  if (!eng.pendingConfirmations.has(confirmationId)) throw new Error('pendingConfirmations tidak terisi');

  // Simulasikan user mengkonfirmasi
  eng._handleUserConfirmation({ confirmationId, confirmed: true });

  const result = await confirmPromise;
  if (result !== true) throw new Error(`Expected true, got ${result}`);

  // Verifikasi pendingConfirmations sudah dibersihkan
  if (eng.pendingConfirmations.has(confirmationId)) throw new Error('pendingConfirmations harus dibersihkan setelah konfirmasi');
});

test('3.6: _waitForUserConfirmation — user membatalkan (confirmed: false)', async (eng, bus) => {
  const report = { taskId: 'TASK-006', summary: 'Test cancellation' };
  const confirmPromise = eng._waitForUserConfirmation(report);

  const emitted = bus.emittedEvents.find(e => e.event === 'Engineer:RequestConfirmation');
  const confirmationId = emitted.payload.confirmationId;

  // Simulasikan user membatalkan
  eng._handleUserConfirmation({ confirmationId, confirmed: false });

  const result = await confirmPromise;
  if (result !== false) throw new Error(`Expected false, got ${result}`);
});

test('3.7: _handleUserConfirmation — confirmationId tidak dikenal (invalid/expired)', (eng, bus) => {
  const result = eng._handleUserConfirmation({
    confirmationId: 'INVALID-ID',
    confirmed: true
  });

  if (result !== false) throw new Error('Expected false untuk confirmationId yang tidak dikenal');
});

test('3.8: _waitForUserConfirmation — multiple concurrent confirmations', async (eng, bus) => {
  const report1 = { taskId: 'TASK-007', summary: 'First' };
  const report2 = { taskId: 'TASK-008', summary: 'Second' };

  const promise1 = eng._waitForUserConfirmation(report1);
  const promise2 = eng._waitForUserConfirmation(report2);

  const emitted1 = bus.emittedEvents.find(e => e.event === 'Engineer:RequestConfirmation' && e.payload.confirmationId === 'TASK-007');
  const emitted2 = bus.emittedEvents.find(e => e.event === 'Engineer:RequestConfirmation' && e.payload.confirmationId === 'TASK-008');

  if (!emitted1 || !emitted2) throw new Error('Kedua confirmation harus diemisi');

  // Resolve in reverse order
  eng._handleUserConfirmation({ confirmationId: 'TASK-008', confirmed: true });
  eng._handleUserConfirmation({ confirmationId: 'TASK-007', confirmed: false });

  const result1 = await promise1;
  const result2 = await promise2;

  if (result1 !== false) throw new Error(`Expected false for TASK-007, got ${result1}`);
  if (result2 !== true) throw new Error(`Expected true for TASK-008, got ${result2}`);

  // Verifikasi cleanup
  if (eng.pendingConfirmations.has('TASK-007')) throw new Error('TASK-007 harus dibersihkan');
  if (eng.pendingConfirmations.has('TASK-008')) throw new Error('TASK-008 harus dibersihkan');
});

test('3.9: Reasoning Report + Confirmation — integration test alur lengkap', async (eng, bus) => {
  const task = {
    id: 'TASK-009',
    title: 'Tambah logging',
    description: 'Tambahkan console.log di method initialize() pada file engineer.js untuk debugging. Ini adalah instruksi yang panjang untuk memenuhi 20 kata agar capability check pass.'
  };

  const analysis = {
    summary: 'Analisis: 1 file, 100 baris, 0 pelanggaran',
    findings: ['✅ Tidak ada pelanggaran MAEF'],
    metrics: { adrReferenced: '/constitution/07_ENGINEERING_SYSTEM.md' },
    rawContext: { 'engineer.js': 'content...' },
    compliance: { violations: [], warnings: [] },
    recommendation: 'Kode aman, lanjutkan',
    filesAnalyzed: ['engineer.js']
  };

  // Step 1: Emit Reasoning Report
  const report = eng._emitReasoningReport(task, analysis, {
    intent: 'MODIFY_CODE',
    capabilityCheck: { pass: true, checks: [] },
    modelName: 'gpt-4o-mini'
  });

  // Verifikasi report
  if (!report.taskId) throw new Error('Report missing taskId');
  if (report.intent !== 'MODIFY_CODE') throw new Error(`Expected MODIFY_CODE, got ${report.intent}`);

  // Verifikasi event
  const reasoningEvent = bus.emittedEvents.find(e => e.event === 'Engineer:ReasoningReport');
  if (!reasoningEvent) throw new Error('ReasoningReport event not emitted');

  // Step 2: Wait for confirmation
  const confirmPromise = eng._waitForUserConfirmation(report);

  const confirmEvent = bus.emittedEvents.find(e => e.event === 'Engineer:RequestConfirmation');
  if (!confirmEvent) throw new Error('RequestConfirmation event not emitted');

  // Step 3: Simulasikan user confirm
  eng._handleUserConfirmation({
    confirmationId: report.taskId,
    confirmed: true
  });

  const result = await confirmPromise;
  if (result !== true) throw new Error(`Expected true, got ${result}`);

  console.log('     [INFO] Integration test passed: Reasoning -> Confirmation -> Proceed');
});

test('3.10: Reasoning Report — model name transparansi', (eng, bus) => {
  const task = { id: 'TASK-010', title: 'Test', description: 'Test transparansi model' };
  const analysis = {
    summary: 'Test',
    findings: [],
    rawContext: {},
    compliance: { violations: [], warnings: [] },
    recommendation: 'OK'
  };

  const report = eng._emitReasoningReport(task, analysis, { modelName: 'openai/gpt-4o-mini' });
  if (!report.modelName) throw new Error('modelName harus ada di report');
  if (report.modelName !== 'openai/gpt-4o-mini') throw new Error(`Expected openai/gpt-4o-mini, got ${report.modelName}`);

  // Verifikasi event payload juga mengandung modelName
  const emitted = bus.emittedEvents.find(e => e.event === 'Engineer:ReasoningReport');
  if (emitted.payload.modelName !== 'openai/gpt-4o-mini') throw new Error('modelName harus ada di event payload');
});

// =============================================
// JALANKAN SEMUA TEST
// =============================================
runTests();
