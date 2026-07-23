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
   * Strict verification for ENGINEER mode.
   */
  static verifyEngineering(context: VerificationContext): VerificationReport {
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

    const hasEvidence = context.evidenceReport && context.evidenceReport.totalEvidence > 0;

    if (!context.sourceTrace || typeof context.sourceTrace !== "string" || context.sourceTrace.trim().length === 0) {
      if (hasEvidence) {
        check002.status = "FAIL";
        check002.message = "Source trace is missing but evidence was provided. Engineer mode requires trace.";
        overallStatus = "FAIL";
        overallScore = 0;
      } else {
        check002.status = "WARN";
        check002.severity = "WARNING";
        check002.message = "Source trace is missing, but no evidence was provided (e.g. casual chat).";
      }
    }

    checks.push(check002);
    if (check002.status === "FAIL") {
      failures.push(check002);
    } else if (check002.status === "WARN") {
      warnings.push(check002);
    }

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

    const traceFormatRegex = /[A-Z]{3}-\d{4}/;

    if (check002.status === "PASS" && (!context.sourceTrace || !traceFormatRegex.test(context.sourceTrace))) {
      check003.status = "FAIL";
      check003.message = "Source trace does not contain any valid ID format (e.g., ADR-0001).";
      overallStatus = "FAIL";
      overallScore = 0;
    } else if (check002.status === "WARN") {
      check003.status = "WARN";
      check003.severity = "WARNING";
      check003.message = "Format check skipped due to missing trace (no evidence context).";
    }

    checks.push(check003);
    if (check003.status === "FAIL") {
      failures.push(check003);
    } else if (check003.status === "WARN") {
      warnings.push(check003);
    }

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

    // ---------------------------------------------------------
    // CHECK 007: FORBIDDEN_PHRASES (Content Hallucination Check)
    // ---------------------------------------------------------
    const check007: VerificationCheck = {
      id: "CHECK_007_FORBIDDEN_PHRASES",
      name: "No Forbidden Phrases (Hallucination)",
      status: "PASS",
      severity: "ERROR",
      message: "No hallucination or forbidden phrases detected."
    };

    const forbiddenPhrases = [
      "berdasarkan pengetahuan umum saya",
      "saya kurang yakin",
      "saya tidak tahu pasti",
      "mungkin saja",
      "sebagai model bahasa ai"
    ];

    const responseLower = (context.responseText || "").toLowerCase();
    const foundForbidden = forbiddenPhrases.find(phrase => responseLower.includes(phrase));

    if (foundForbidden) {
      check007.status = "FAIL";
      check007.message = `Detected forbidden phrase indicating hallucination or rule violation: "${foundForbidden}"`;
      overallStatus = "FAIL";
      overallScore = Math.max(0, overallScore - 50);
    }

    checks.push(check007);
    if (check007.status === "FAIL") failures.push(check007);
    
    console.log(`[VERIFICATION]\n${check007.id}\n${check007.status}`);

    // ---------------------------------------------------------
    // CHECK 008: APOLOGETIC_REFUSAL (Content Evasion Check)
    // ---------------------------------------------------------
    const check008: VerificationCheck = {
      id: "CHECK_008_APOLOGETIC_REFUSAL",
      name: "No Apologetic Refusal",
      status: "PASS",
      severity: "WARNING",
      message: "LLM provided an answer instead of a raw refusal."
    };

    const refusalPhrases = [
      "maaf, saya tidak mengerti",
      "maaf, saya tidak dapat",
      "saya tidak memiliki informasi tersebut"
    ];

    const foundRefusal = refusalPhrases.find(phrase => responseLower.includes(phrase));

    // Refusal is allowed if we genuinely have 0 confidence/evidence, but if evidence exists, LLM shouldn't refuse blindly.
    const hasEvidence = (context.evidenceReport?.totalEvidence || 0) > 0;

    if (foundRefusal && hasEvidence) {
      check008.status = "WARN";
      check008.message = `LLM refused to answer despite evidence being present: "${foundRefusal}"`;
      // Warn doesn't fail the overall status, but drops score
      overallScore = Math.max(0, overallScore - 20);
      if (overallStatus === "PASS") overallStatus = "WARN";
    } else if (foundRefusal) {
      check008.message = "LLM correctly refused to answer when no evidence was present.";
    }

    checks.push(check008);
    if (check008.status === "WARN" || check008.status === "FAIL") warnings.push(check008);
    
    console.log(`[VERIFICATION]\n${check008.id}\n${check008.status}`);

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

  /**
   * Verifikasi untuk mode PERSONAL (ASSISTANT)
   * Sesuai MAEF 4.5 dan Mamet AI Constitution Capability Separation.
   * Hanya memeriksa hal yang relevan untuk asisten pribadi.
   */
  static verifyPersonal(context: VerificationContext): VerificationReport {
      const checks: VerificationCheck[] = [];
      
      // CHECK 1: Response tidak boleh kosong
      checks.push({
          id: 'CHECK_001_RESPONSE_NOT_EMPTY',
          name: 'Response Text Not Empty',
          status: context.responseText && context.responseText.trim().length > 0 ? 'PASS' : 'FAIL',
          severity: 'CRITICAL',
          message: context.responseText && context.responseText.trim().length > 0 
              ? 'Response text is valid.' 
              : 'Response text is empty.'
      });
  
      // CHECK 2: Tidak boleh ada frasa terlarang (halusinasi)
      const forbiddenPhrases = [
          'Sebagai AI', 'saya tidak bisa', 'saya tidak dapat',
          'maaf, saya', 'As an AI', 'I cannot', 'I am unable'
      ];
      const hasForbidden = forbiddenPhrases.some(phrase => 
          context.responseText?.toLowerCase().includes(phrase.toLowerCase())
      );
      checks.push({
          id: 'CHECK_007_FORBIDDEN_PHRASES',
          name: 'No Forbidden Phrases (Hallucination)',
          status: hasForbidden ? 'FAIL' : 'PASS',
          severity: 'ERROR',
          message: hasForbidden 
              ? 'Response contains forbidden apologetic/hallucination phrases.' 
              : 'No hallucination or forbidden phrases detected.'
      });
  
      // CHECK 3: Confidence report harus ada
      checks.push({
          id: 'CHECK_004_CONFIDENCE_REPORT_EXISTS',
          name: 'Confidence Report Exists',
          status: context.confidenceReport ? 'PASS' : 'FAIL',
          severity: 'WARNING',
          message: context.confidenceReport 
              ? 'Confidence report object is present.' 
              : 'Confidence report is missing.'
      });
  
      // CHECK 4: Evidence report harus ada
      checks.push({
          id: 'CHECK_005_EVIDENCE_REPORT_EXISTS',
          name: 'Evidence Report Exists',
          status: context.evidenceReport ? 'PASS' : 'FAIL',
          severity: 'WARNING',
          message: context.evidenceReport 
              ? 'Evidence report object is present.' 
              : 'Evidence report is missing.'
      });
  
      // CHECK 5: Runtime context harus ada
      checks.push({
          id: 'CHECK_006_RUNTIME_CONTEXT_EXISTS',
          name: 'Runtime Context Exists',
          status: context.runtimeContext ? 'PASS' : 'FAIL',
          severity: 'INFO',
          message: context.runtimeContext 
              ? 'Runtime context object is present.' 
              : 'Runtime context is missing.'
      });
  
      // Hitung skor
      const failedChecks = checks.filter(c => c.status === 'FAIL');
      const criticalFails = failedChecks.filter(c => c.severity === 'CRITICAL');
      const score = checks.length > 0 
          ? Math.round(((checks.length - criticalFails.length) / checks.length) * 100) 
          : 100;
  
      const warnings = checks.filter(c => c.severity === 'WARNING' && c.status === 'FAIL');
      const totalChecks = checks.length;
      const passedChecks = totalChecks - failedChecks.length;
  
      return {
          decision: criticalFails.length === 0 ? 'PASS' : 'FAIL',
          status: criticalFails.length === 0 ? 'PASS' : 'FAIL',
          score,
          totalChecks,
          passedChecks,
          failedChecks: failedChecks.length,
          passRate: totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0,
          checks,
          failures: failedChecks,
          warnings,
          executionTimeMs: 0
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


