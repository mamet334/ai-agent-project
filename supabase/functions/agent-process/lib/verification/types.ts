// ============================================================
// VERIFICATION DOMAIN TYPES (Wave 5.2E)
// ============================================================

// --- EVIDENCE VALIDATOR TYPES ---
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

export interface EvidenceInput {
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

// --- CONFIDENCE ENGINE TYPES ---
export interface SourceTraceItem {
  type: 'ADR' | 'TASK' | 'GAP' | 'VERIFICATION' | 'RAG' | 'MEMORY' | 'LESSON' | 'VISION' | 'MAEF' | 'SOLUTION' | 'OTHER';
  id: string;           // entry_id atau identifier
  title: string;        // Judul singkat
  govStatus?: string;   // governance_status (ACTIVE, DEPRECATED, dll)
  version?: string;     // "1.2.0"
  isCurrent?: boolean;
  relationship?: string; // Hubungan dengan jawaban: "primary", "supporting", "referenced"
}

export interface ConfidenceReport {
  score: number;          // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';  // A=90+, B=75+, C=60+, D=45+, F=<45
  breakdown: {
    baseScore: number;
    evidenceBonus: number;
    conflictPenalty: number;
    versionBonus: number;
    verificationBonus: number;
    engineerBrainPenalty: number;
  };
  signals: {
    evidenceCount: number;
    activeConflicts: number;
    versionStatus: 'CURRENT' | 'OUTDATED' | 'UNKNOWN';
    hasVerification: boolean;
    mode: string;
  };
  sourceTrace: SourceTraceItem[];
  summaryText: string;    // Teks yang diinjeksikan ke system prompt
  label: string;          // "High Confidence", "Low Confidence", dll
}

export interface ConfidenceInput {
  mode: string;
  brain1Ids: string[];              // Title ADR/Lesson/dll yang di-load
  brain1Entries?: Array<{           // Detail entry jika tersedia
    id: string;
    entry_type: string;
    title: string;
    governance_status?: string;
    version_major?: number;
    version_minor?: number;
    version_patch?: number;
    is_current?: boolean;
  }>;
  brain2Tasks: string[];
  brain2Gaps: string[];
  brain2Verifications: string[];
  ragDocs: string[];                // Judul dokumen RAG
  memoryCount: number;
  activeConflicts?: number;         // Dari knowledge_conflicts table
  hasVerification?: boolean;        // Ada verifikasi yang PASS?
  allCurrent?: boolean;             // Semua knowledge is_current?
}

// --- POLICY ENGINE TYPES ---
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

// --- UNIVERSAL EVIDENCE CONTRACT TYPES ---
export interface IdentityBlock {
  name: string;
  version: string;
  mode: string;
  appSource: string;
  capabilities: string[];
  restrictions: string[];
}

export interface MemoryBlock {
  hasMemory: boolean;
  memoryCount: number;
  memoryContext: string;  // Teks ringkasan memory (sudah dibangun di context_fusion)
}

export interface KnowledgeBlock {
  hasBrain1: boolean;
  brain1Count: number;
  brain1Summary: string;
  hasBrain2: boolean;
  brain2Count: number;
  brain2Summary: string;
  hasRAG: boolean;
  ragCount: number;
  ragSummary: string;
}

export interface RuntimeBlock {
  evidenceGateVerdict: 'PASSED' | 'BLOCKED' | 'WARNING';
  totalEvidence: number;
  confidenceScore: number;
  confidenceGrade: string;
  activeConflicts: number;
  versionStatus: string;
  requestId: string;
  timestamp: string;
}

export interface ConstraintBlock {
  canCallLLM: boolean;
  canWriteMemory: boolean;
  canReadMemory: boolean;
  canUseWebSearch: boolean;
  canUseAutomation: boolean;
  canUseDesktopTools: boolean;
  canWriteKnowledge: boolean;
  activeConstraints: string[];  // Daftar aturan aktif dari Policy Engine
  forbidden: string[];           // Daftar larangan eksplisit
}

export interface OutputContractBlock {
  language: string;
  expectedFormat: string;
  requireSourceTrace: boolean;
  requireConfidenceStatement: boolean;
  maxResponseLength?: number;
  forbiddenPatterns: string[];
}

export interface UniversalEvidenceContract {
  identity: IdentityBlock;
  memory: MemoryBlock;
  knowledge: KnowledgeBlock;
  runtime: RuntimeBlock;
  constraint: ConstraintBlock;
  outputContract: OutputContractBlock;
  systemBasePrompt: string; // Instruksi dasar (Identity, Sub-Agents, Fitur Zip/Chart)
  // Full text rendition — siap dikirim ke LLM
  asSystemPromptText: () => string;
}

export interface ContractBuilderInput {
  mode: string;
  appSource: string;
  userId: string;
  evidenceReport: EvidenceReport;
  confidenceReport: ConfidenceReport;
  brain1Entries: any[];
  brain2Tasks: string[];
  brain2Gaps: string[];
  brain2Verifications: string[];
  ragArray: any[];
  memoryArray: any[];
  memoryContextText: string;
  brain1ContextText: string;
  brain2ContextText: string;
  ragContextText: string;
  policyConstraints: string[];
  policyForbidden: string[];
  systemBasePrompt: string;
  activeConflicts?: number;
}
