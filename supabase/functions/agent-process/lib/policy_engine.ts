/**
 * Policy Engine — Mamet AI Knowledge OS Phase 2 (Priority 12)
 * =============================================================
 * Satu tempat untuk SEMUA aturan kebijakan.
 * Tidak ada lagi if-else tersebar di index.ts.
 *
 * Filosofi: "Semua aturan berada di satu tempat."
 * Engineer tidak boleh menjawab tanpa evidence.
 * Assistant boleh pakai web. Engineer tidak boleh.
 * Semua keputusan ini ada di sini.
 */

// ============================================================
// TYPES
// ============================================================

export type MametMode = 'LITE' | 'AI' | 'ENGINEER';
export type PolicyAction =
  | 'CALL_LLM'
  | 'WRITE_MEMORY'
  | 'READ_MEMORY'
  | 'USE_WEB_SEARCH'
  | 'USE_AUTOMATION'
  | 'USE_DESKTOP_TOOLS'
  | 'WRITE_KNOWLEDGE'
  | 'USE_WORKSPACE'
  | 'ANSWER_WITHOUT_EVIDENCE'
  | 'USE_SUB_AGENTS'
  | 'READ_DEPRECATED_KNOWLEDGE'
  | 'READ_DRAFT_KNOWLEDGE';

export interface PolicyContext {
  mode: MametMode;
  evidenceCount: number;
  riskScore: number;
  appSource: string;
  hasActiveConflicts?: boolean;
  govStatus?: string; // governance status of knowledge being accessed
}

export interface PolicyDecision {
  allow: boolean;
  reason: string;
  constraints: string[];  // Batasan tambahan jika allow=true
  auditNote: string;      // Dicatat ke audit log
  severity: 'INFO' | 'WARNING' | 'BLOCK';
}

interface PolicyRule {
  id: string;
  description: string;
  action: PolicyAction;
  evaluate: (ctx: PolicyContext) => PolicyDecision | null; // null = rule tidak berlaku
}

// ============================================================
// POLICY RULES REGISTRY
// Semua aturan didefinisikan di sini — satu per satu, jelas.
// ============================================================

const POLICY_RULES: PolicyRule[] = [

  // ── RULE P-001: Engineer WAJIB punya evidence sebelum LLM dipanggil ──
  {
    id: 'P-001',
    description: 'Engineer mode requires evidence before calling LLM',
    action: 'CALL_LLM',
    evaluate: (ctx) => {
      if (ctx.mode !== 'ENGINEER') return null;
      if (ctx.evidenceCount === 0) {
        return {
          allow: false,
          reason: 'P-001: Engineer mode membutuhkan minimal 1 evidence. Total evidence = 0.',
          constraints: [],
          auditNote: 'BLOCKED by P-001: ENGINEER + zero evidence',
          severity: 'BLOCK',
        };
      }
      return null;
    }
  },

  // ── RULE P-002: High risk request → block semua LLM calls ──
  {
    id: 'P-002',
    description: 'High risk score blocks LLM call',
    action: 'CALL_LLM',
    evaluate: (ctx) => {
      if (ctx.riskScore >= 4) {
        return {
          allow: false,
          reason: `P-002: Permintaan ditolak karena skor risiko tinggi (${ctx.riskScore}/4+).`,
          constraints: [],
          auditNote: `BLOCKED by P-002: riskScore=${ctx.riskScore}`,
          severity: 'BLOCK',
        };
      }
      return null;
    }
  },

  // ── RULE P-003: LITE tidak boleh write memory ──
  {
    id: 'P-003',
    description: 'LITE mode cannot write to memory',
    action: 'WRITE_MEMORY',
    evaluate: (ctx) => {
      if (ctx.mode === 'LITE') {
        return {
          allow: false,
          reason: 'P-003: MametLite tidak memiliki izin menulis ke User Memory.',
          constraints: [],
          auditNote: 'BLOCKED by P-003: LITE mode write memory attempt',
          severity: 'WARNING',
        };
      }
      return null;
    }
  },

  // ── RULE P-004: LITE tidak boleh read memory ──
  {
    id: 'P-004',
    description: 'LITE mode cannot read memory',
    action: 'READ_MEMORY',
    evaluate: (ctx) => {
      if (ctx.mode === 'LITE') {
        return {
          allow: false,
          reason: 'P-004: MametLite tidak memiliki akses ke User Memory.',
          constraints: [],
          auditNote: 'BLOCKED by P-004: LITE mode read memory attempt',
          severity: 'INFO',
        };
      }
      return null;
    }
  },

  // ── RULE P-005: Engineer tidak boleh pakai web search ──
  {
    id: 'P-005',
    description: 'Engineer mode cannot use web search (must use internal knowledge)',
    action: 'USE_WEB_SEARCH',
    evaluate: (ctx) => {
      if (ctx.mode === 'ENGINEER') {
        return {
          allow: false,
          reason: 'P-005: Engineer mode harus menggunakan internal knowledge (Brain 1 & 2). Web search tidak diizinkan.',
          constraints: [],
          auditNote: 'BLOCKED by P-005: ENGINEER web search attempt',
          severity: 'WARNING',
        };
      }
      return null;
    }
  },

  // ── RULE P-006: LITE tidak boleh pakai automation/cron ──
  {
    id: 'P-006',
    description: 'LITE mode cannot use automation tools',
    action: 'USE_AUTOMATION',
    evaluate: (ctx) => {
      if (ctx.mode === 'LITE') {
        return {
          allow: false,
          reason: 'P-006: MametLite tidak memiliki akses ke tool otomasi.',
          constraints: [],
          auditNote: 'BLOCKED by P-006: LITE mode automation attempt',
          severity: 'WARNING',
        };
      }
      return null;
    }
  },

  // ── RULE P-007: Engineer tidak boleh pakai desktop tools ──
  {
    id: 'P-007',
    description: 'Engineer mode cannot use desktop/OS tools',
    action: 'USE_DESKTOP_TOOLS',
    evaluate: (ctx) => {
      if (ctx.mode === 'ENGINEER') {
        return {
          allow: false,
          reason: 'P-007: Engineer mode tidak diizinkan mengeksekusi perintah OS.',
          constraints: [],
          auditNote: 'BLOCKED by P-007: ENGINEER desktop tools attempt',
          severity: 'WARNING',
        };
      }
      return null;
    }
  },

  // ── RULE P-008: Engineer tidak boleh write knowledge tanpa explicit action ──
  {
    id: 'P-008',
    description: 'Engineer mode cannot write knowledge autonomously',
    action: 'WRITE_KNOWLEDGE',
    evaluate: (ctx) => {
      if (ctx.mode === 'ENGINEER') {
        return {
          allow: false,
          reason: 'P-008: Engineer mode tidak boleh menulis knowledge secara otomatis. Harus melalui tindakan eksplisit user.',
          constraints: [],
          auditNote: 'BLOCKED by P-008: ENGINEER autonomous knowledge write',
          severity: 'WARNING',
        };
      }
      return null;
    }
  },

  // ── RULE P-009: Knowledge SUPERSEDED tidak boleh diakses Brain 1 ──
  {
    id: 'P-009',
    description: 'Superseded knowledge cannot be loaded into Brain 1',
    action: 'CALL_LLM',
    evaluate: (ctx) => {
      if (ctx.govStatus === 'SUPERSEDED') {
        return {
          allow: false,
          reason: 'P-009: Knowledge dengan status SUPERSEDED tidak boleh dikirim ke LLM. Gunakan versi terbaru.',
          constraints: [],
          auditNote: 'BLOCKED by P-009: SUPERSEDED knowledge access attempt',
          severity: 'BLOCK',
        };
      }
      return null;
    }
  },

  // ── RULE P-010: DRAFT/REVIEW tidak boleh masuk ke Brain 1 ──
  {
    id: 'P-010',
    description: 'Draft or review knowledge cannot be loaded into Brain',
    action: 'CALL_LLM',
    evaluate: (ctx) => {
      if (ctx.govStatus === 'DRAFT' || ctx.govStatus === 'REVIEW') {
        return {
          allow: true, // Tidak diblok tapi diberi constraint
          reason: `P-010: Knowledge dalam status ${ctx.govStatus} belum final. Gunakan dengan hati-hati.`,
          constraints: [`Knowledge status ${ctx.govStatus} — belum diverifikasi`],
          auditNote: `WARNING by P-010: ${ctx.govStatus} knowledge loaded`,
          severity: 'WARNING',
        };
      }
      return null;
    }
  },

  // ── RULE P-011: Conflict aktif menurunkan kepercayaan jawaban ──
  {
    id: 'P-011',
    description: 'Active conflicts reduce answer confidence',
    action: 'CALL_LLM',
    evaluate: (ctx) => {
      if (ctx.hasActiveConflicts) {
        return {
          allow: true,
          reason: 'P-011: Ada konflik knowledge yang aktif dan belum diselesaikan.',
          constraints: [
            'Ada konflik knowledge aktif — jawaban mungkin memiliki inkonsistensi',
            'Sampaikan ke user jika ada kontradiksi dalam knowledge',
          ],
          auditNote: 'WARNING by P-011: active conflicts detected',
          severity: 'WARNING',
        };
      }
      return null;
    }
  },

];

// ============================================================
// POLICY ENGINE CLASS
// ============================================================

export class PolicyEngine {
  /**
   * Evaluasi semua aturan yang relevan untuk satu action.
   * Returns: PolicyDecision terakhir yang paling restrictive.
   *
   * Prioritas: BLOCK > WARNING > INFO > (default ALLOW)
   */
  static evaluate(action: PolicyAction, ctx: PolicyContext): PolicyDecision {
    const applicableRules = POLICY_RULES.filter(r => r.action === action);

    let finalDecision: PolicyDecision | null = null;
    const constraints: string[] = [];
    const auditNotes: string[] = [];

    for (const rule of applicableRules) {
      const decision = rule.evaluate(ctx);
      if (!decision) continue;

      auditNotes.push(decision.auditNote);
      constraints.push(...decision.constraints);

      // BLOCK selalu menang
      if (decision.severity === 'BLOCK') {
        return {
          ...decision,
          constraints: [...constraints, ...decision.constraints],
          auditNote: auditNotes.join(' | '),
        };
      }

      // Simpan WARNING/INFO untuk digabung
      if (!finalDecision || decision.severity === 'WARNING') {
        finalDecision = decision;
      }
    }

    // Jika ada decision non-BLOCK, return dengan constraints gabungan
    if (finalDecision) {
      return {
        ...finalDecision,
        constraints,
        auditNote: auditNotes.join(' | '),
      };
    }

    // Default: ALLOW
    return {
      allow: true,
      reason: `Action '${action}' allowed by default (no applicable rules triggered).`,
      constraints: [],
      auditNote: `ALLOWED: ${action} for mode=${ctx.mode}`,
      severity: 'INFO',
    };
  }

  /**
   * Evaluasi semua action sekaligus untuk satu request.
   * Berguna di awal request untuk build full policy map.
   */
  static evaluateAll(ctx: PolicyContext): Record<PolicyAction, PolicyDecision> {
    const actions: PolicyAction[] = [
      'CALL_LLM', 'WRITE_MEMORY', 'READ_MEMORY', 'USE_WEB_SEARCH',
      'USE_AUTOMATION', 'USE_DESKTOP_TOOLS', 'WRITE_KNOWLEDGE',
      'USE_WORKSPACE', 'ANSWER_WITHOUT_EVIDENCE', 'USE_SUB_AGENTS',
      'READ_DEPRECATED_KNOWLEDGE', 'READ_DRAFT_KNOWLEDGE',
    ];

    const result = {} as Record<PolicyAction, PolicyDecision>;
    for (const action of actions) {
      result[action] = PolicyEngine.evaluate(action, ctx);
    }
    return result;
  }

  /**
   * Bangun teks constraint untuk diinjeksikan ke system prompt LLM.
   * Hanya constraints yang aktif (allow=true tapi punya constraints).
   */
  static buildConstraintPrompt(decisions: Record<string, PolicyDecision>): string {
    const activeConstraints: string[] = [];

    for (const [action, decision] of Object.entries(decisions)) {
      if (decision.allow && decision.constraints.length > 0) {
        activeConstraints.push(...decision.constraints);
      }
    }

    if (activeConstraints.length === 0) return '';

    let text = '\n\n[POLICY ENGINE CONSTRAINTS]\n';
    text += 'Batasan aktif untuk request ini:\n';
    activeConstraints.forEach((c, i) => {
      text += `${i + 1}. ${c}\n`;
    });
    return text;
  }
}
