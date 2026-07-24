/**
 * Universal Evidence Contract — Mamet AI Knowledge OS Phase 2 (Priority 5 + 7)
 * ==============================================================================
 * Format payload standar untuk SEMUA LLM provider.
 * Tidak peduli GPT, Claude, Gemini, DeepSeek, Qwen, atau Llama —
 * formatnya SAMA. Identitas Mamet tetap dari backend.
 *
 * 6 Blok Kontrak:
 *   1. IDENTITY     — Siapa Mamet, mode apa, kapabilitas apa
 *   2. MEMORY       — Konteks memori user
 *   3. KNOWLEDGE    — Brain 1 + Brain 2 + RAG
 *   4. RUNTIME      — Task aktif, verifikasi, evidence gate
 *   5. CONSTRAINT   — Apa yang boleh dan tidak boleh dilakukan
 *   6. OUTPUT_CONTRACT — Format output yang diharapkan
 */

import { buildSourceTraceText } from './confidence_engine.ts';

// ============================================================
// TYPES
// ============================================================

import {
  EvidenceReport,
  ConfidenceReport,
  IdentityBlock,
  MemoryBlock,
  KnowledgeBlock,
  RuntimeBlock,
  ConstraintBlock,
  OutputContractBlock,
  UniversalEvidenceContract,
  ContractBuilderInput,
} from './types.ts';

// ============================================================
// BUILDER FUNCTION
// ============================================================

export function buildUniversalContract(params: ContractBuilderInput): UniversalEvidenceContract {
  const {
    mode, appSource, evidenceReport, confidenceReport,
    brain1Entries, brain2Tasks, brain2Gaps, brain2Verifications,
    ragArray, memoryArray, memoryContextText, brain1ContextText,
    brain2ContextText, ragContextText, policyConstraints, policyForbidden,
    systemBasePrompt, activeConflicts = 0,
  } = params;

  // ── IDENTITY BLOCK ──
  const capabilities: string[] = [];
  const restrictions: string[] = [];

  if (mode === 'ENGINEER') {
    capabilities.push('Membaca Brain 1 (ADR, Solution, Lesson)', 'Membaca Brain 2 (Task, Gap, Verification)', 'Analisis teknikal mendalam');
    restrictions.push('Tidak boleh menulis memory otomatis', 'Tidak boleh menggunakan web search', 'Tidak boleh menjalankan perintah OS', 'WAJIB memiliki evidence sebelum menjawab');
  } else if (mode === 'LITE') {
    capabilities.push('Menjawab pertanyaan umum', 'RAG retrieval dari Knowledge Base');
    restrictions.push('Tidak boleh membaca/menulis User Memory', 'Tidak boleh menggunakan tool otomasi');
  } else {
    capabilities.push('RAG retrieval', 'Membaca User Memory', 'Web search', 'Menjalankan Sub-Agent');
    restrictions.push('Tidak boleh menjawab tanpa menginformasikan keterbatasan evidence');
  }

  const identity: IdentityBlock = {
    name: 'Mamet AI',
    version: '2.1.0',
    mode,
    appSource,
    capabilities,
    restrictions,
  };

  // ── MEMORY BLOCK ──
  const memory: MemoryBlock = {
    hasMemory: memoryArray.length > 0,
    memoryCount: memoryArray.length,
    memoryContext: memoryContextText,
  };

  // ── KNOWLEDGE BLOCK ──
  const knowledge: KnowledgeBlock = {
    hasBrain1: brain1Entries.length > 0,
    brain1Count: brain1Entries.length,
    brain1Summary: brain1ContextText,
    hasBrain2: (brain2Tasks.length + brain2Gaps.length + brain2Verifications.length) > 0,
    brain2Count: brain2Tasks.length + brain2Gaps.length + brain2Verifications.length,
    brain2Summary: brain2ContextText,
    hasRAG: ragArray.length > 0,
    ragCount: ragArray.length,
    ragSummary: ragContextText,
  };

  // ── RUNTIME BLOCK ──
  const runtime: RuntimeBlock = {
    evidenceGateVerdict: evidenceReport.verdict,
    totalEvidence: evidenceReport.totalEvidence,
    confidenceScore: confidenceReport.score,
    confidenceGrade: confidenceReport.grade,
    activeConflicts,
    versionStatus: confidenceReport.signals.versionStatus,
    requestId: evidenceReport.requestId,
    timestamp: new Date().toISOString(),
  };

  // ── CONSTRAINT BLOCK ──
  const constraint: ConstraintBlock = {
    canCallLLM: evidenceReport.isValid,
    canWriteMemory: mode === 'AI',
    canReadMemory: mode !== 'LITE',
    canUseWebSearch: mode !== 'ENGINEER',
    canUseAutomation: mode === 'AI',
    canUseDesktopTools: false,
    canWriteKnowledge: false,
    activeConstraints: policyConstraints,
    forbidden: [
      'Menggunakan pengetahuan di luar evidence yang terdaftar (untuk Engineer mode)',
      'Menyebut ADR, Task, atau knowledge yang tidak ada di bagian KNOWLEDGE di atas',
      'Memberikan informasi yang tidak dapat ditelusuri ke evidence',
      ...policyForbidden,
    ],
  };

  // ── OUTPUT CONTRACT BLOCK ──
  const outputContract: OutputContractBlock = {
    language: 'id', // Bahasa Indonesia default
    expectedFormat: mode === 'ENGINEER' ? 'structured_technical' : 'conversational',
    requireSourceTrace: mode === 'ENGINEER',
    requireConfidenceStatement: mode === 'ENGINEER' && confidenceReport.score < 70,
    forbiddenPatterns: [
      'Mengarang data teknikal yang tidak ada di evidence',
      'Menyebut "berdasarkan pengetahuan umum saya" di Engineer mode',
    ],
  };

  // ── RETURN CONTRACT + RENDERER ──
  const contract: UniversalEvidenceContract = {
    identity,
    memory,
    knowledge,
    runtime,
    constraint,
    outputContract,
    systemBasePrompt,
    asSystemPromptText: () => renderContractAsText(contract, confidenceReport),
  };

  return contract;
}

// ============================================================
// RENDERER: Kontrak → System Prompt Text
// ============================================================

function renderContractAsText(
  contract: UniversalEvidenceContract,
  confidenceReport: ConfidenceReport
): string {
  const { identity, memory, knowledge, runtime, constraint, outputContract, systemBasePrompt } = contract;

  let text = systemBasePrompt + '\n';

  // ── IDENTITY ──
  text += `\n\n${'═'.repeat(60)}\n`;
  text += `[UNIVERSAL EVIDENCE CONTRACT v2.0]\n`;
  text += `${'═'.repeat(60)}\n`;
  text += `System: ${identity.name} | Mode: ${identity.mode} | v${identity.version}\n`;
  text += `Request ID: ${runtime.requestId} | ${runtime.timestamp}\n\n`;

  // ── IDENTITY BLOCK ──
  text += `[BLOK 1: IDENTITY]\n`;
  text += `Mode Aktif: ${identity.mode}\n`;
  text += `Kapabilitas: ${identity.capabilities.join(', ')}\n`;
  text += `Batasan: ${identity.restrictions.join(' | ')}\n\n`;

  // ── RUNTIME BLOCK (Evidence Gate + Confidence) ──
  text += `[BLOK 2: RUNTIME STATUS]\n`;
  text += `Evidence Gate: ${runtime.evidenceGateVerdict} | Total Evidence: ${runtime.totalEvidence}\n`;
  text += `Backend Confidence: ${runtime.confidenceScore}% (Grade: ${runtime.confidenceGrade})\n`;
  if (runtime.activeConflicts > 0) {
    text += `⚠️ Konflik Aktif: ${runtime.activeConflicts} — perlu kehati-hatian\n`;
  }
  if (runtime.versionStatus === 'OUTDATED') {
    text += `⚠️ Beberapa knowledge bukan versi terkini\n`;
  }
  text += '\n';

  // ── MEMORY BLOCK ──
  if (memory.hasMemory) {
    text += `[BLOK 3: USER MEMORY — ${memory.memoryCount} node]\n`;
    text += memory.memoryContext + '\n\n';
  }

  // ── KNOWLEDGE BLOCK ──
  text += `[BLOK 4: KNOWLEDGE]\n`;

  if (knowledge.hasBrain1) {
    text += `--- Brain 1 (Static Knowledge: ADR, Lesson, Vision) ---\n`;
    text += knowledge.brain1Summary + '\n';
  } else {
    text += `--- Brain 1: KOSONG (tidak ada static knowledge yang qualified) ---\n\n`;
  }

  if (knowledge.hasBrain2) {
    text += `--- Brain 2 (Dynamic Context: Task, Gap, Verification) ---\n`;
    text += knowledge.brain2Summary + '\n';
  } else {
    text += `--- Brain 2: KOSONG (tidak ada task/gap aktif) ---\n\n`;
  }

  if (knowledge.hasRAG) {
    text += `--- RAG Documents (${knowledge.ragCount} dokumen) ---\n`;
    text += knowledge.ragSummary + '\n';
  }

  // ── CONSTRAINT BLOCK ──
  text += `\n[BLOK 5: CONSTRAINT]\n`;
  text += `Dilarang keras:\n`;
  for (const f of constraint.forbidden) {
    text += `  ✗ ${f}\n`;
  }
  if (constraint.activeConstraints.length > 0) {
    text += `Batasan aktif:\n`;
    for (const c of constraint.activeConstraints) {
      text += `  ⚠ ${c}\n`;
    }
  }
  text += '\n';

    if (outputContract.requireSourceTrace) {
    text += `WAJIB: Sertakan SOURCE TRACE di bagian AKHIR jawaban Anda menggunakan format berikut PERSIS:\n`;
    text += `\n`;
    text += `SOURCE TRACE:\n`;
    text += `- [ID-XXXX] Nama atau deskripsi singkat evidence\n`;
    text += `\n`;
    text += `Contoh yang BENAR:\n`;
    text += `SOURCE TRACE:\n`;
    text += `- [ADR-0006] Decision record arsitektur two-brain context\n`;
    text += `- [GAP-0012] Gap analisis verifikasi engine\n`;
    text += `\n`;
    text += `PENTING: Gunakan ID yang PERSIS sama dengan evidence di BLOK 4 KNOWLEDGE di atas. Jangan mengarang ID.\n`;
    text += `\n`;
    text += `ATURAN TAMBAHAN:\n`;
    text += `- SOURCE TRACE HARUS menjadi baris terakhir dari jawaban Anda. Jangan tambahkan kalimat penutup, kesimpulan, atau teks apapun setelahnya.\n`;
    text += `- Jika tidak ada evidence yang relevan dari daftar KNOWLEDGE, tulis: "SOURCE TRACE: - [NONE]".\n`;
  }
  // Tambahkan Source Trace jika ada
  if (confidenceReport.sourceTrace.length > 0 && outputContract.requireSourceTrace) {
    text += buildSourceTraceText(confidenceReport.sourceTrace);
  }

  return text;
}
