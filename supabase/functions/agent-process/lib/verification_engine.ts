export type VerificationStatus = "PASS" | "FAIL" | "WARN";
export type VerificationDecision = "PASS" | "FAIL";
export type CheckSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export interface VerificationCheck {
  id: string;
  name: string;
  status: VerificationStatus;
  severity: CheckSeverity;
  message: string;
}

export interface VerificationReport {
  decision: VerificationDecision;
  status: VerificationStatus;
  score: number;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  passRate: number;
  checks: VerificationCheck[];
  failures: VerificationCheck[];
  warnings: VerificationCheck[];
  executionTimeMs: number;
}

export interface VerificationAuditRecord {
  timestamp: string;
  provider: string;
  model: string;
  decision: VerificationDecision;
  status: VerificationStatus;
  score: number;
  executionTimeMs: number;
  checks: VerificationCheck[];
  failures: VerificationCheck[];
  sourceTrace: string | null;
  confidence: any;
  evidence: any;
}

export interface VerificationContext {
  responseText: string;
  sourceTrace?: string;
  confidenceReport?: any;
  evidenceReport?: any;
  runtimeContext?: any;
}

export class VerificationEngine {
  /**
   * Verifies the LLM output against deterministic rules.
   * Currently implements a dummy skeleton that always returns PASS.
   */
  static verify(context: VerificationContext): VerificationReport {
    const startTime = performance.now();
    let overallStatus: VerificationStatus = "PASS";
    let overallScore = 100;

    const checks: VerificationCheck[] = [];
    const failures: VerificationCheck[] = [];
    const warnings: VerificationCheck[] = [];

    // ---------------------------------------------------------
    // CHECK 001: RESPONSE_NOT_EMPTY
    // ---------------------------------------------------------
    const check001: VerificationCheck = {
      id: "CHECK_001_RESPONSE_NOT_EMPTY",
      name: "Response Text Not Empty",
      status: "PASS",
      severity: "CRITICAL",
      message: "Response text is valid."
    };

    if (!context.responseText || typeof context.responseText !== "string" || context.responseText.trim().length === 0) {
      check001.status = "FAIL";
      check001.message = "Response text is empty or only whitespace.";
      overallStatus = "FAIL";
      overallScore = 0;
    }

    checks.push(check001);
    if (check001.status === "FAIL") {
      failures.push(check001);
    }
    
    console.log(`[VERIFICATION]\n${check001.id}\n${check001.status}`);

    // ---------------------------------------------------------
    // CHECK 002: SOURCE_TRACE_EXISTS
    // ---------------------------------------------------------
    const check002: VerificationCheck = {
      id: "CHECK_002_SOURCE_TRACE_EXISTS",
      name: "Source Trace Exists",
      status: "PASS",
      severity: "CRITICAL",
      message: "Source trace string is present."
    };

    if (!context.sourceTrace || typeof context.sourceTrace !== "string" || context.sourceTrace.trim().length === 0) {
      check002.status = "FAIL";
      check002.message = "Source trace is missing, empty, or not a valid string.";
      overallStatus = "FAIL";
      overallScore = 0; // Gagal CHECK menyebabkan skor anjlok
    }

    checks.push(check002);
    if (check002.status === "FAIL") {
      failures.push(check002);
    }
    
    console.log(`[VERIFICATION]\n${check002.id}\n${check002.status}`);

    // ---------------------------------------------------------
    // CHECK 003: SOURCE_TRACE_FORMAT
    // ---------------------------------------------------------
    const check003: VerificationCheck = {
      id: "CHECK_003_SOURCE_TRACE_FORMAT",
      name: "Source Trace Format Valid",
      status: "PASS",
      severity: "ERROR",
      message: "Source trace matches expected ID format."
    };

    // Deteksi setidaknya satu entitas dengan pola 3 Huruf Kapital - 4 Angka (misal: ADR-0001, MEM-0005)
    const traceFormatRegex = /[A-Z]{3}-\d{4}/;

    if (!context.sourceTrace || !traceFormatRegex.test(context.sourceTrace)) {
      check003.status = "FAIL";
      check003.message = "Source trace does not contain any valid ID format (e.g., ADR-0001).";
      overallStatus = "FAIL";
      overallScore = 0;
    }

    checks.push(check003);
    if (check003.status === "FAIL") {
      failures.push(check003);
    }
    
    console.log(`[VERIFICATION]\n${check003.id}\n${check003.status}`);

    // ---------------------------------------------------------
    // CHECK 004: CONFIDENCE_REPORT_EXISTS
    // ---------------------------------------------------------
    const check004: VerificationCheck = {
      id: "CHECK_004_CONFIDENCE_REPORT_EXISTS",
      name: "Confidence Report Exists",
      status: "PASS",
      severity: "WARNING",
      message: "Confidence report object is present."
    };

    if (context.confidenceReport === null || context.confidenceReport === undefined) {
      check004.status = "FAIL";
      check004.message = "Confidence report object is null or undefined.";
      overallStatus = "FAIL";
      overallScore = 0;
    }

    checks.push(check004);
    if (check004.status === "FAIL") {
      failures.push(check004);
    }
    
    console.log(`[VERIFICATION]\n${check004.id}\n${check004.status}`);

    // ---------------------------------------------------------
    // CHECK 005: EVIDENCE_REPORT_EXISTS
    // ---------------------------------------------------------
    const check005: VerificationCheck = {
      id: "CHECK_005_EVIDENCE_REPORT_EXISTS",
      name: "Evidence Report Exists",
      status: "PASS",
      severity: "WARNING",
      message: "Evidence report object is present."
    };

    if (context.evidenceReport === null || context.evidenceReport === undefined) {
      check005.status = "FAIL";
      check005.message = "Evidence report object is null or undefined.";
      overallStatus = "FAIL";
      overallScore = 0;
    }

    checks.push(check005);
    if (check005.status === "FAIL") {
      failures.push(check005);
    }
    
    console.log(`[VERIFICATION]\n${check005.id}\n${check005.status}`);

    // ---------------------------------------------------------
    // CHECK 006: RUNTIME_CONTEXT_EXISTS
    // ---------------------------------------------------------
    const check006: VerificationCheck = {
      id: "CHECK_006_RUNTIME_CONTEXT_EXISTS",
      name: "Runtime Context Exists",
      status: "PASS",
      severity: "INFO",
      message: "Runtime context object is present."
    };

    if (context.runtimeContext === null || context.runtimeContext === undefined) {
      check006.status = "FAIL";
      check006.message = "Runtime context object is null or undefined.";
      overallStatus = "FAIL";
      overallScore = 0;
    }

    checks.push(check006);
    if (check006.status === "FAIL") {
      failures.push(check006);
    }
    
    console.log(`[VERIFICATION]\n${check006.id}\n${check006.status}`);

    const executionTimeMs = performance.now() - startTime;
    const finalDecision: VerificationDecision = overallStatus === "PASS" ? "PASS" : "FAIL";
    const totalChecks = checks.length;
    const failedChecks = failures.length;
    const passedChecks = totalChecks - failedChecks;
    const passRate = totalChecks === 0 ? 0 : Math.round((passedChecks / totalChecks) * 100);

    return {
      decision: finalDecision,
      status: overallStatus,
      score: overallScore,
      totalChecks,
      passedChecks,
      failedChecks,
      passRate,
      checks,
      failures,
      warnings,
      executionTimeMs,
    };
  }

  public static createAuditRecord(report: VerificationReport, context: VerificationContext): VerificationAuditRecord {
    return {
      timestamp: new Date().toISOString(),
      provider: context.runtimeContext?.llmProvider || "UNKNOWN",
      model: context.runtimeContext?.llmModel || "UNKNOWN",
      decision: report.decision,
      status: report.status,
      score: report.score,
      executionTimeMs: report.executionTimeMs,
      checks: report.checks,
      failures: report.failures,
      sourceTrace: context.sourceTrace || null,
      confidence: context.confidenceReport || null,
      evidence: context.evidenceReport || null
    };
  }
}


