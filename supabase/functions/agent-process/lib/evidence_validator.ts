/**
 * Evidence Validator — Mamet AI Knowledge Operating System
 * =========================================================
 * Komponen ini adalah "hakim" yang memutuskan apakah pipeline
 * boleh memanggil LLM atau harus STOP.
 *
 * Filosofi (dari tujuan universal.txt):
 * - Jika evidence == 0 → STOP, RETURN "EVIDENCE NOT FOUND"
 * - LLM tidak boleh mengisi kekosongan dengan pengetahuan bebas
 * - Setiap jawaban harus bisa ditelusuri ke evidence yang digunakan
 */

export interface EvidenceReport {
  requestId: string;
  userId: string;
  mode: string;                  // LITE | AI | ENGINEER
  brain1Count: number;           // Static engineering knowledge (ADR, Lesson, dll)
  brain2Count: number;           // Dynamic context (Tasks, Gaps, Verifications)
  ragCount: number;              // RAG documents retrieved
  memoryCount: number;           // User memory nodes loaded
  totalEvidence: number;         // Total semua evidence
  isValid: boolean;              // Apakah boleh lanjut ke LLM?
  blockReason: string | null;    // Alasan STOP jika isValid = false
  verdict: 'PASSED' | 'BLOCKED' | 'WARNING'; // Verdict final
  gateVerdictText: string;       // Teks yang diinjeksikan ke system prompt
}

interface EvidenceInput {
  requestId?: string;
  userId: string;
  mode: string;
  brain1Ids: string[];
  brain2Tasks: string[];
  brain2Gaps: string[];
  brain2Verifications: string[];
  ragArray: any[];
  memoryArray: any[];
}

/**
 * Fungsi utama: validasi apakah evidence cukup untuk memanggil LLM.
 *
 * Rules:
 * 1. Mode ENGINEER + totalEvidence === 0 → BLOCKED (hard stop)
 * 2. Mode ENGINEER + totalEvidence > 0 + (brain1 === 0 && brain2 === 0) → WARNING
 * 3. Mode AI/LITE + ragCount === 0 + memoryCount === 0 → WARNING (LLM boleh menjawab tapi diberi tahu)
 * 4. Semua kasus lain → PASSED
 */
export function validateEvidence(input: EvidenceInput): EvidenceReport {
  const {
    requestId = `req_${Date.now()}`,
    userId,
    mode,
    brain1Ids,
    brain2Tasks,
    brain2Gaps,
    brain2Verifications,
    ragArray,
    memoryArray,
  } = input;

  const brain1Count = brain1Ids.length;
  const brain2Count = brain2Tasks.length + brain2Gaps.length + brain2Verifications.length;
  const ragCount = ragArray.length;
  const memoryCount = memoryArray.length;
  const totalEvidence = brain1Count + brain2Count + ragCount + memoryCount;

  const isEngineer = mode === 'ENGINEER';

  let verdict: 'PASSED' | 'BLOCKED' | 'WARNING' = 'PASSED';
  let blockReason: string | null = null;
  let isValid = true;

  // === RULE 1: Engineer + zero evidence → HARD BLOCK ===
  if (isEngineer && totalEvidence === 0) {
    verdict = 'BLOCKED';
    blockReason = 'EVIDENCE_EMPTY: Engineer mode membutuhkan minimal 1 evidence runtime. Brain 1, Brain 2, RAG, dan Memory semua kosong.';
    isValid = false;
  }

  // === RULE 2: Engineer + ada evidence tapi Brain kosong ===
  else if (isEngineer && brain1Count === 0 && brain2Count === 0 && (ragCount > 0 || memoryCount > 0)) {
    verdict = 'WARNING';
    blockReason = null; // Tidak diblok, tapi diberi warning
    isValid = true;
  }

  // === RULE 3: Non-Engineer + zero evidence (WARNING only) ===
  else if (!isEngineer && ragCount === 0 && memoryCount === 0) {
    verdict = 'WARNING';
    blockReason = null; // LLM boleh menjawab dari pengetahuan umum, tapi diberi tahu
    isValid = true;
  }

  // Bangun teks verdict untuk diinjeksikan ke system prompt
  const gateVerdictText = buildGateVerdictText({
    verdict,
    blockReason,
    mode,
    brain1Count,
    brain2Count,
    ragCount,
    memoryCount,
    totalEvidence,
    brain1Ids,
    brain2Tasks,
    brain2Gaps,
    brain2Verifications,
  });

  return {
    requestId,
    userId,
    mode,
    brain1Count,
    brain2Count,
    ragCount,
    memoryCount,
    totalEvidence,
    isValid,
    blockReason,
    verdict,
    gateVerdictText,
  };
}

/**
 * Bangun teks yang diinjeksikan ke system prompt LLM.
 * Ini yang membuat LLM "tahu" status evidencenya sebelum menjawab.
 */
function buildGateVerdictText(params: {
  verdict: string;
  blockReason: string | null;
  mode: string;
  brain1Count: number;
  brain2Count: number;
  ragCount: number;
  memoryCount: number;
  totalEvidence: number;
  brain1Ids: string[];
  brain2Tasks: string[];
  brain2Gaps: string[];
  brain2Verifications: string[];
}): string {
  const {
    verdict,
    blockReason,
    mode,
    brain1Count,
    brain2Count,
    ragCount,
    memoryCount,
    totalEvidence,
    brain1Ids,
    brain2Tasks,
    brain2Gaps,
    brain2Verifications,
  } = params;

  let text = `\n\n[EVIDENCE_GATE_VERDICT: ${verdict}]\n`;
  text += `Mode: ${mode} | Total Evidence: ${totalEvidence}\n`;
  text += `Brain1(Static): ${brain1Count} | Brain2(Dynamic): ${brain2Count} | RAG: ${ragCount} | Memory: ${memoryCount}\n`;

  if (verdict === 'BLOCKED') {
    text += `STATUS: BLOCKED — ${blockReason}\n`;
    text += `INSTRUKSI WAJIB: Anda DILARANG KERAS menjawab dengan pengetahuan bebas. `;
    text += `Sampaikan kepada user bahwa tidak ada evidence yang tersedia di database runtime untuk menjawab pertanyaan ini.\n`;
    text += `Respons Anda harus berupa: "Saya tidak menemukan data yang relevan di Knowledge Base. [Berikan penjelasan singkat mengapa]\"\n`;
  } else if (verdict === 'WARNING') {
    text += `STATUS: WARNING — Evidence terbatas.\n`;
    if (mode === 'ENGINEER' && brain1Count === 0 && brain2Count === 0) {
      text += `CATATAN: Brain 1 (ADR/Rules) dan Brain 2 (Tasks/Gaps) kosong. Jawaban hanya berdasarkan RAG/Memory.\n`;
      text += `INSTRUKSI: Jangan sebut ADR, TASK, GAP, atau MAEF yang tidak ada di evidence di atas.\n`;
    } else {
      text += `CATATAN: RAG dan Memory kosong. Jawab dari pengetahuan umum dan sampaikan bahwa tidak ada data spesifik project ditemukan.\n`;
    }
  } else {
    // PASSED
    text += `STATUS: PASSED — Evidence valid.\n`;
    if (brain1Ids.length > 0) text += `Brain1 Loaded: ${brain1Ids.slice(0, 3).join(', ')}${brain1Ids.length > 3 ? ` (+${brain1Ids.length - 3} more)` : ''}\n`;
    if (brain2Tasks.length > 0) text += `Brain2 Tasks: ${brain2Tasks.join(', ')}\n`;
    if (brain2Gaps.length > 0) text += `Brain2 Gaps: ${brain2Gaps.join(', ')}\n`;
    if (brain2Verifications.length > 0) text += `Brain2 Verifications: ${brain2Verifications.join(', ')}\n`;
    text += `INSTRUKSI: Anda HANYA BOLEH menggunakan evidence yang terdaftar di atas. Jangan sebut data engineering yang tidak ada di sini.\n`;
  }

  return text;
}

/**
 * Buat respons terstruktur untuk BLOCKED request (tidak perlu kirim ke LLM).
 */
export function buildBlockedResponse(report: EvidenceReport, userMessage: string): string {
  return `[MAMET EVIDENCE GATE — BLOCKED]

Saya tidak dapat menjawab pertanyaan ini karena tidak ada data runtime yang tersedia di Knowledge Base.

**Detail:**
- Mode: ${report.mode}
- Total Evidence Ditemukan: ${report.totalEvidence}
- Alasan: ${report.blockReason}

**Pertanyaan Anda:** "${userMessage.substring(0, 200)}${userMessage.length > 200 ? '...' : ''}"

Untuk saya bisa menjawab, pastikan ada dokumen relevan yang sudah diupload ke Knowledge Base, atau ada task/gap yang aktif di Project Memory (untuk Engineer mode).`;
}
