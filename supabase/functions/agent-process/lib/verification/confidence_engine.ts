/**
 * Confidence Engine — Mamet AI Knowledge OS Phase 2 (Priority 8 + 9)
 * ====================================================================
 * Menghitung confidence dari BACKEND — bukan dari LLM.
 * Ini jauh lebih objektif: deterministic, traceable, auditable.
 *
 * Priority 8: Backend Confidence Scoring
 *   evidence + conflict + version + verification → score 0-100
 *
 * Priority 9: Source Trace
 *   Setiap jawaban Engineer bisa ditelusuri ke evidence sumbernya.
 *   Seperti debugger — "Jawaban ini berdasarkan ADR-0006, TASK-042, dll."
 */

// ============================================================
// TYPES
// ============================================================

import { SourceTraceItem, ConfidenceReport, ConfidenceInput } from './types.ts';

// ============================================================
// FUNGSI UTAMA: HITUNG CONFIDENCE
// ============================================================

export function calculateConfidence(input: ConfidenceInput): ConfidenceReport {
  const {
    mode,
    brain1Ids,
    brain1Entries = [],
    brain2Tasks,
    brain2Gaps,
    brain2Verifications,
    ragDocs,
    memoryCount,
    activeConflicts = 0,
    hasVerification = false,
    allCurrent = true,
  } = input;

  const evidenceCount =
    brain1Ids.length +
    brain2Tasks.length +
    brain2Gaps.length +
    brain2Verifications.length +
    ragDocs.length +
    memoryCount;

  // === FORMULA DETERMINISTIC ===
  const baseScore = 50;

  // Evidence bonus: +8 per evidence, max +40
  const evidenceBonus = Math.min(40, evidenceCount * 8);

  // Conflict penalty: -15 per konflik aktif
  const conflictPenalty = -(activeConflicts * 15);

  // Version bonus/penalty
  const versionBonus = allCurrent ? 10 : -15;
  const versionStatus = allCurrent ? 'CURRENT' : 'OUTDATED';

  // Verification bonus
  const verificationBonus = hasVerification ? 10 : 0;

  // Engineer brain penalty: jika Engineer tapi brain kosong
  const isEngineer = mode === 'ENGINEER';
  const brainEmpty = brain1Ids.length === 0 && brain2Tasks.length === 0;
  const engineerBrainPenalty = (isEngineer && brainEmpty) ? -20 : 0;

  const rawScore = baseScore + evidenceBonus + conflictPenalty + versionBonus + verificationBonus + engineerBrainPenalty;
  const score = Math.max(0, Math.min(100, rawScore));

  // Grade
  const grade: ConfidenceReport['grade'] =
    score >= 90 ? 'A' :
    score >= 75 ? 'B' :
    score >= 60 ? 'C' :
    score >= 45 ? 'D' : 'F';

  // Label
  const label =
    score >= 90 ? 'Sangat Tinggi' :
    score >= 75 ? 'Tinggi' :
    score >= 60 ? 'Sedang' :
    score >= 45 ? 'Rendah' : 'Sangat Rendah';

  // Build source trace
  const sourceTrace = buildSourceTrace(input);

  // Build summary text untuk system prompt
  const summaryText = buildConfidenceSummary({
    score, grade, label, evidenceCount, activeConflicts, versionStatus, hasVerification, mode
  });

  return {
    score,
    grade,
    breakdown: {
      baseScore,
      evidenceBonus,
      conflictPenalty,
      versionBonus,
      verificationBonus,
      engineerBrainPenalty,
    },
    signals: {
      evidenceCount,
      activeConflicts,
      versionStatus,
      hasVerification,
      mode,
    },
    sourceTrace,
    summaryText,
    label,
  };
}

// ============================================================
// SOURCE TRACE BUILDER (Priority 9)
// ============================================================

export function buildSourceTrace(input: ConfidenceInput): SourceTraceItem[] {
  const trace: SourceTraceItem[] = [];

  // Brain 1: Static knowledge
  if (input.brain1Entries && input.brain1Entries.length > 0) {
    for (const entry of input.brain1Entries) {
      const version = entry.version_major !== undefined
        ? `${entry.version_major}.${entry.version_minor || 0}.${entry.version_patch || 0}`
        : undefined;

      const type = mapEntryTypeToTraceType(entry.entry_type);
      trace.push({
        type,
        id: entry.id,
        title: entry.title,
        govStatus: entry.governance_status || 'ACTIVE',
        version,
        isCurrent: entry.is_current !== false,
        relationship: 'primary',
      });
    }
  } else if (input.brain1Ids.length > 0) {
    // Fallback jika hanya punya title
    for (const title of input.brain1Ids) {
      trace.push({
        type: title.startsWith('ADR') ? 'ADR' : title.startsWith('Lesson') ? 'LESSON' : 'OTHER',
        id: title,
        title,
        relationship: 'primary',
      });
    }
  }

  // Brain 2: Dynamic context
  for (const task of input.brain2Tasks) {
    trace.push({ type: 'TASK', id: task, title: task, relationship: 'supporting' });
  }
  for (const gap of input.brain2Gaps) {
    trace.push({ type: 'GAP', id: gap, title: gap, relationship: 'supporting' });
  }
  for (const ver of input.brain2Verifications) {
    trace.push({ type: 'VERIFICATION', id: ver, title: ver, relationship: 'supporting' });
  }

  // RAG Documents
  for (let i = 0; i < input.ragDocs.length; i++) {
    const doc = input.ragDocs[i];
    const id = (typeof doc === 'object' && doc?.id) ? doc.id : (typeof doc === 'string' && doc.match(/^[A-Z]{2,3}-\d{4}/) ? doc : `DOC-${String(i + 1).padStart(4, '0')}`);
    const title = (typeof doc === 'object' && doc?.title) ? doc.title : (typeof doc === 'string' ? doc : `Dokumen ${i + 1}`);
    trace.push({ type: 'RAG', id, title, relationship: 'referenced' });
  }

  // Memory
  if (input.memoryCount > 0) {
    trace.push({
      type: 'MEMORY',
      id: 'user_memory',
      title: `${input.memoryCount} memory node(s) loaded`,
      relationship: 'supporting',
    });
  }

  return trace;
}

function mapEntryTypeToTraceType(entryType: string): SourceTraceItem['type'] {
  const map: Record<string, SourceTraceItem['type']> = {
    'ADRLink': 'ADR',
    'Lesson': 'LESSON',
    'Vision': 'VISION',
    'MAEF': 'MAEF',
    'Solution': 'SOLUTION',
    'RootCause': 'OTHER',
  };
  return map[entryType] || 'OTHER';
}

// ============================================================
// TEKS SUMMARY UNTUK SYSTEM PROMPT
// ============================================================

function buildConfidenceSummary(params: {
  score: number;
  grade: string;
  label: string;
  evidenceCount: number;
  activeConflicts: number;
  versionStatus: string;
  hasVerification: boolean;
  mode: string;
}): string {
  const { score, grade, label, evidenceCount, activeConflicts, versionStatus, hasVerification, mode } = params;

  let text = `\n\n[BACKEND_CONFIDENCE: ${score}% | Grade: ${grade} | ${label}]\n`;
  text += `Mode: ${mode} | Evidence: ${evidenceCount} | Konflik Aktif: ${activeConflicts}\n`;
  text += `Versi Knowledge: ${versionStatus} | Verifikasi: ${hasVerification ? 'PASS' : 'TIDAK ADA'}\n`;

  if (score >= 75) {
    text += `STATUS: Confidence TINGGI — jawaban dapat dipercaya berdasarkan evidence yang kuat.\n`;
  } else if (score >= 50) {
    text += `STATUS: Confidence SEDANG — jawab dengan hati-hati, sampaikan keterbatasan evidence.\n`;
  } else {
    text += `STATUS: Confidence RENDAH — sampaikan kepada user bahwa evidence terbatas.\n`;
    text += `INSTRUKSI: Gunakan frasa seperti "Berdasarkan data yang ada..." atau "Data terbatas, tapi..."\n`;
  }

  if (activeConflicts > 0) {
    text += `PERINGATAN: Terdapat ${activeConflicts} konflik knowledge aktif. Sampaikan jika ada inkonsistensi.\n`;
  }

  if (versionStatus === 'OUTDATED') {
    text += `PERINGATAN: Beberapa knowledge yang dimuat bukan versi terkini.\n`;
  }

  return text;
}

// ============================================================
// SOURCE TRACE TEXT (untuk response ke user)
// ============================================================

export function buildSourceTraceText(trace: SourceTraceItem[]): string {
  if (trace.length === 0) return '';

  let text = '\n\n[SOURCE_TRACE — Dasar Jawaban Ini]\n';
  text += '─'.repeat(40) + '\n';

  const primary = trace.filter(t => t.relationship === 'primary');
  const supporting = trace.filter(t => t.relationship === 'supporting');
  const referenced = trace.filter(t => t.relationship === 'referenced');

  if (primary.length > 0) {
    text += `📌 Knowledge Utama (${primary.length}):\n`;
    for (const item of primary) {
      const version = item.version ? ` v${item.version}` : '';
      const status = item.govStatus ? ` [${item.govStatus}]` : '';
      const current = item.isCurrent === false ? ' ⚠️ BUKAN VERSI TERKINI' : '';
      text += `  • [${item.type}] ${item.title}${version}${status}${current}\n`;
    }
  }

  if (supporting.length > 0) {
    text += `🔗 Konteks Pendukung (${supporting.length}):\n`;
    for (const item of supporting) {
      text += `  • [${item.type}] ${item.title}\n`;
    }
  }

  if (referenced.length > 0) {
    text += `📄 Referensi (${referenced.length}):\n`;
    for (const item of referenced) {
      text += `  • [${item.type}] ${item.title}\n`;
    }
  }

  text += '─'.repeat(40) + '\n';
  return text;
}
