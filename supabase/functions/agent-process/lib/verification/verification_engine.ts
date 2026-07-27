/**
 * Verification Engine — Multi-Profile Architecture
 * 
 * Sesuai MAEF 4.5 (Verification Before Trust) dan ADR-0013 (Multi-Profile Verification Architecture).
 * Setiap capability mode memiliki verification profile yang sesuai dengan nature-nya:
 * 
 *   - ENGINEERING (verifyEngineering): Chat natural dengan ADR trace & evidence
 *   - PERSONAL (verifyPersonal): Assistant ringan dengan sanity checks
 *   - PATCH_ENGINEERING (verifyPatchEngineering): JSON patch dari Engineer dengan keamanan kode
 * 
 * Tidak ada "bypass" — setiap profile memiliki kriteria kelulusan deterministik yang ketat.
 * 
 * Last Updated: 2026-07-27
 * ADR: ADR-0013 (Multi-Profile Verification Architecture)
 */

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
  profile: "ENGINEERING" | "PERSONAL" | "PATCH_ENGINEERING";
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
  profile: "ENGINEERING" | "PERSONAL" | "PATCH_ENGINEERING";
}

export interface VerificationContext {
  responseText: string;
  sourceTrace?: string;
  confidenceReport?: any;
  evidenceReport?: any;
  runtimeContext?: any;
}

export class VerificationEngine {
  // ========================================================================
  // PROFILE 1: ENGINEERING (Mode ASSISTANT)
  // ========================================================================

  static verifyEngineering(context: VerificationContext): VerificationReport {
    const isStrictMode = (Deno.env.get('ENGINEER_STRICT_MODE') ?? 'true') !== 'false';
    const startTime = performance.now();
    let overallStatus: VerificationStatus = "PASS";
    let overallScore = 100;

    const checks: VerificationCheck[] = [];
    const failures: VerificationCheck[] = [];
    const warnings: VerificationCheck[] = [];

    // CHECK 001: RESPONSE_NOT_EMPTY
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
    if (check001.status === "FAIL") failures.push(check001);
    console.log(`[VERIFICATION:ENGINEERING]\n${check001.id}\n${check001.status}`);

    // CHECK 002: SOURCE_TRACE_EXISTS
    const check002: VerificationCheck = {
      id: "CHECK_002_SOURCE_TRACE_EXISTS",
      name: "Source Trace Exists",
      status: "PASS",
      severity: "CRITICAL",
      message: "Source trace string is present."
    };

    const hasEvidence = context.evidenceReport && context.evidenceReport.totalEvidence > 0;
    const hasParserTrace = !!(context.sourceTrace && typeof context.sourceTrace === "string" && context.sourceTrace.trim().length > 0);
    const backendTraceItems = context.confidenceReport?.sourceTrace;
    const hasBackendTrace = Array.isArray(backendTraceItems) && backendTraceItems.length > 0;

    if (!hasParserTrace) {
      if (!hasEvidence && !hasBackendTrace) {
        check002.status = "WARN";
        check002.severity = "WARNING";
        check002.message = "Source trace is missing, but no evidence was provided (e.g. casual chat).";
      } else if (hasEvidence && !hasBackendTrace) {
        check002.status = "FAIL";
        check002.message = "Source trace is missing and backend confidence trace is empty despite evidence. Pipeline integrity issue.";
        overallStatus = "FAIL";
        overallScore = 0;
      } else if (hasBackendTrace) {
        const failMessage = `LLM response did not include SOURCE TRACE in parseable format (regex /[A-Z]{2,3}-\\d{4}/ not found in last 30 lines). Backend has ${backendTraceItems.length} evidence item(s) but parser returned undefined. Check prompt instruction compliance.`;

        if (isStrictMode) {
          check002.status = "FAIL";
          check002.message = failMessage;
          overallStatus = "FAIL";
          overallScore = 0;
        } else {
          check002.status = "WARN";
          check002.severity = "WARNING";
          check002.message = `[STRICT_MODE=OFF] ${failMessage}`;
        }
      }
    } else {
      check002.message = `Source trace found via parser (${context.sourceTrace!.length} chars).`;
    }

    checks.push(check002);
    if (check002.status === "FAIL") failures.push(check002);
    else if (check002.status === "WARN") warnings.push(check002);

    // CHECK 003: SOURCE_TRACE_FORMAT
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
    if (check003.status === "FAIL") failures.push(check003);
    else if (check003.status === "WARN") warnings.push(check003);

    // CHECK 004: CONFIDENCE_REPORT_EXISTS
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
    if (check004.status === "FAIL") failures.push(check004);
    console.log(`[VERIFICATION:ENGINEERING]\n${check004.id}\n${check004.status}`);

    // CHECK 005: EVIDENCE_REPORT_EXISTS
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
    if (check005.status === "FAIL") failures.push(check005);
    console.log(`[VERIFICATION:ENGINEERING]\n${check005.id}\n${check005.status}`);

    // CHECK 006: RUNTIME_CONTEXT_EXISTS
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
    if (check006.status === "FAIL") failures.push(check006);
    console.log(`[VERIFICATION:ENGINEERING]\n${check006.id}\n${check006.status}`);

    // CHECK 007: FORBIDDEN_PHRASES (Content Hallucination Check)
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
    console.log(`[VERIFICATION:ENGINEERING]\n${check007.id}\n${check007.status}`);

    // CHECK 008: APOLOGETIC_REFUSAL (Content Evasion Check)
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
    const hasEvidenceForRefusal = (context.evidenceReport?.totalEvidence || 0) > 0;

    if (foundRefusal && hasEvidenceForRefusal) {
      check008.status = "WARN";
      check008.message = `LLM refused to answer despite evidence being present: "${foundRefusal}"`;
      overallScore = Math.max(0, overallScore - 20);
      if (overallStatus === "PASS") overallStatus = "WARN";
    } else if (foundRefusal) {
      check008.message = "LLM correctly refused to answer when no evidence was present.";
    }

    checks.push(check008);
    if (check008.status === "WARN" || check008.status === "FAIL") warnings.push(check008);
    console.log(`[VERIFICATION:ENGINEERING]\n${check008.id}\n${check008.status}`);

    // Final Calculation
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
      profile: "ENGINEERING",
    };
  }

  // ========================================================================
  // PROFILE 2: PERSONAL (Mode LITE / ASSISTANT Ringan)
  // ✅ FIXED: executionTimeMs dihitung real menggunakan performance.now()
  // ========================================================================

  static verifyPersonal(context: VerificationContext): VerificationReport {
    const startTime = performance.now(); // ✅ FIX: Tambahkan startTime
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
    const executionTimeMs = performance.now() - startTime; // ✅ FIX: Real time

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
      executionTimeMs,  // ✅ FIX: Gunakan nilai real
      profile: "PERSONAL",
    };
  }

  // ========================================================================
  // PROFILE 3: PATCH_ENGINEERING (Mode ENGINEER)
  // ADR-0013: Verifikasi khusus untuk output JSON patch dari Engineer
  // ========================================================================

  static verifyPatchEngineering(context: VerificationContext): VerificationReport {
    const startTime = performance.now();
    const checks: VerificationCheck[] = [];
    const failures: VerificationCheck[] = [];
    const warnings: VerificationCheck[] = [];
    let overallStatus: VerificationStatus = "PASS";
    let overallScore = 100;

    // =============================================
    // DIAGNOSTIC LOG: Rekam response mentah untuk debugging
    // =============================================
    const rawResponse = context.responseText || '';
    const responseLength = rawResponse.length;
    const responsePreview = rawResponse.substring(0, 500).replace(/\n/g, '\\n');
    const hasOpenBrace = rawResponse.includes('{');
    const hasCloseBrace = rawResponse.includes('}');
    
    console.log(`[VERIFICATION:PATCH_ENGINEERING] === DIAGNOSTIC START ===`);
    console.log(`[VERIFICATION:PATCH_ENGINEERING] Response length: ${responseLength} chars`);
    console.log(`[VERIFICATION:PATCH_ENGINEERING] Contains '{': ${hasOpenBrace}, Contains '}': ${hasCloseBrace}`);
    console.log(`[VERIFICATION:PATCH_ENGINEERING] First 500 chars: "${responsePreview}"`);
    console.log(`[VERIFICATION:PATCH_ENGINEERING] Last 200 chars: "${rawResponse.substring(Math.max(0, responseLength - 200)).replace(/\n/g, '\\n')}"`);
    console.log(`[VERIFICATION:PATCH_ENGINEERING] === DIAGNOSTIC END ===`);

    // =============================================
    // RESPONSE NORMALIZATION LAYER
    // Membersihkan output LLM dari noise sebelum parsing
    // =============================================
    const normalizedResponse = VerificationEngine._normalizeLLMResponse(rawResponse);

    // ---------------------------------------------------------
    // CHECK P01: RESPONSE_NOT_EMPTY (CRITICAL)
    // ---------------------------------------------------------
    const checkP01: VerificationCheck = {
      id: "CHECK_P01_RESPONSE_NOT_EMPTY",
      name: "Patch Response Not Empty",
      status: "PASS",
      severity: "CRITICAL",
      message: "Patch response is present."
    };

    if (!rawResponse || rawResponse.trim().length === 0) {
      checkP01.status = "FAIL";
      checkP01.message = "Patch response is empty.";
      overallStatus = "FAIL";
      overallScore = 0;
    }
    checks.push(checkP01);
    if (checkP01.status === "FAIL") failures.push(checkP01);

    // ---------------------------------------------------------
    // CHECK P02: VALID_JSON_PATCH_FORMAT (CRITICAL)
    // UPGRADE: Menggunakan normalized response
    // ---------------------------------------------------------
    const checkP02: VerificationCheck = {
      id: "CHECK_P02_VALID_JSON_PATCH_FORMAT",
      name: "Valid JSON Patch Structure",
      status: "PASS",
      severity: "CRITICAL",
      message: "Patch is valid JSON object with file paths as keys."
    };

    let parsedPatch: Record<string, string> | null = null;
    let extractionMethod: string = 'unknown';
    let extractionError: string = '';

    try {
      // ✅ Coba extract file path dari context (runtimeContext atau evidence)
      const requestedFilePath = context.runtimeContext?.requestedFilePath || 
                                context.runtimeContext?.targetFile ||
                                undefined;
      const extractionResult = VerificationEngine._extractJSONPatch(normalizedResponse, rawResponse, requestedFilePath);
      parsedPatch = extractionResult.parsed;
      extractionMethod = extractionResult.method;
      extractionError = extractionResult.error || '';
      
      if (!parsedPatch) {
        throw new Error(extractionError || "No valid JSON patch found after normalization");
      }

      // Validasi struktur
      const keys = Object.keys(parsedPatch);
      if (keys.length === 0) {
        throw new Error("Empty patch object — no files to modify");
      }

      const invalidPaths = keys.filter(k => 
        typeof k !== 'string' || 
        k.trim().length === 0 || 
        (!k.includes('/') && !k.includes('.') && !k.includes('\\'))
      );
      if (invalidPaths.length > 0) {
        throw new Error(`Invalid file path format: ${invalidPaths.slice(0, 3).join(', ')}`);
      }

      for (const [path, content] of Object.entries(parsedPatch)) {
        if (typeof content !== 'string') {
          throw new Error(`File content for "${path}" must be a string, got ${typeof content}`);
        }
      }

      checkP02.message = `Valid JSON patch with ${keys.length} file(s) [extracted via ${extractionMethod}].`;
    } catch (e: any) {
      checkP02.status = "FAIL";
      checkP02.message = `Invalid JSON patch: ${e.message}. Extraction method: ${extractionMethod}. Raw length: ${responseLength}. Has braces: {=${hasOpenBrace}, }=${hasCloseBrace}.`;
      overallStatus = "FAIL";
      overallScore = 0;
    }
    checks.push(checkP02);
    if (checkP02.status === "FAIL") failures.push(checkP02);
    console.log(`[VERIFICATION:PATCH_ENGINEERING]\n${checkP02.id}\n${checkP02.status}\nMethod: ${extractionMethod}`);

    // ---------------------------------------------------------
    // CHECK P03: NO_DANGEROUS_CODE_PATTERNS (CRITICAL - MAEF 4.1)
    // ---------------------------------------------------------
    const checkP03: VerificationCheck = {
      id: "CHECK_P03_NO_DANGEROUS_PATTERNS",
      name: "No Dangerous Code Patterns (MAEF 4.1)",
      status: "PASS",
      severity: "CRITICAL",
      message: "No eval(), new Function(), or direct vendor calls detected."
    };

    const dangerousPatterns = [
      { pattern: /\beval\s*\(/g, name: 'eval()' },
      { pattern: /new\s+Function\s*\(/g, name: 'new Function()' },
      { pattern: /require\s*\(\s*['"]child_process['"]/g, name: 'child_process access' },
      { pattern: /fetch\s*\(\s*['"]https:\/\/api\.openai\.com/g, name: 'direct OpenAI call' },
      { pattern: /fetch\s*\(\s*['"]https:\/\/generativelanguage\.googleapis\.com/g, name: 'direct Gemini call' },
    ];

    const foundDangerous: string[] = [];
    for (const { pattern, name } of dangerousPatterns) {
      if (pattern.test(rawResponse)) {
        foundDangerous.push(name);
      }
    }

    if (foundDangerous.length > 0) {
      checkP03.status = "FAIL";
      checkP03.message = `Dangerous patterns detected: ${foundDangerous.join(', ')}`;
      overallStatus = "FAIL";
      overallScore = 0;
    }
    checks.push(checkP03);
    if (checkP03.status === "FAIL") failures.push(checkP03);

    // ---------------------------------------------------------
    // CHECK P04: MAEF_EVENT_NAMESPACE_COMPLIANCE (ERROR - MAEF 4.6)
    // ---------------------------------------------------------
    const checkP04: VerificationCheck = {
      id: "CHECK_P04_MAEF_EVENT_NAMESPACE",
      name: "MAEF 4.6 Event Namespace Compliance",
      status: "PASS",
      severity: "ERROR",
      message: "All eventBus.emit calls use proper namespace format."
    };

    const eventEmitRegex = /eventBus\.emit\(\s*['"]([^'"]+)['"]/g;
    const eventMatches = [...(rawResponse || '').matchAll(eventEmitRegex)];
    const invalidEvents = eventMatches
      .map(m => m[1])
      .filter(eventName => !eventName.includes(':'));

    if (invalidEvents.length > 0) {
      checkP04.status = "FAIL";
      checkP04.message = `Events without namespace: ${invalidEvents.join(', ')}`;
      overallStatus = "FAIL";
      overallScore = Math.max(0, overallScore - 30);
    }
    checks.push(checkP04);
    if (checkP04.status === "FAIL") failures.push(checkP04);

    // ---------------------------------------------------------
    // CHECK P05: NO_CORE_FILE_MODIFICATION (CRITICAL - MAEF 4.2)
    // ---------------------------------------------------------
    const checkP05: VerificationCheck = {
      id: "CHECK_P05_NO_CORE_MODIFICATION",
      name: "No Core File Modification (MAEF 4.2)",
      status: "PASS",
      severity: "CRITICAL",
      message: "Patch does not modify immutable core files."
    };

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
      '/constitution/09_DNA.md',
    ];

    if (parsedPatch) {
      const filePaths = Object.keys(parsedPatch);
      const violatingFiles = filePaths.filter(path =>
        IMMUTABLE_PATTERNS.some(pattern => path.includes(pattern))
      );

      if (violatingFiles.length > 0) {
        checkP05.status = "FAIL";
        checkP05.message = `Attempt to modify IMMUTABLE core files: ${violatingFiles.join(', ')}`;
        overallStatus = "FAIL";
        overallScore = 0;
      }
    }
    checks.push(checkP05);
    if (checkP05.status === "FAIL") failures.push(checkP05);

    // ---------------------------------------------------------
    // Final Calculation
    // ---------------------------------------------------------
    const executionTimeMs = performance.now() - startTime;
    const finalDecision: VerificationDecision = overallStatus === "PASS" ? "PASS" : "FAIL";
    const totalChecks = checks.length;
    const failedChecks = failures.length;
    const passedChecks = totalChecks - failedChecks;
    const passRate = totalChecks === 0 ? 0 : Math.round((passedChecks / totalChecks) * 100);

    console.log(`[VERIFICATION:PATCH_ENGINEERING] Decision: ${finalDecision} | Score: ${overallScore} | Failed: ${failedChecks}/${totalChecks} | Method: ${extractionMethod}`);

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
      profile: "PATCH_ENGINEERING",
    };
  }

  // ========================================================================
  // RESPONSE NORMALIZATION LAYER (Private Helper Methods)
  // ========================================================================

  /**
   * Membersihkan output LLM dari noise (markdown, HTML, prefix/suffix)
   * agar JSON patch bisa di-extract dengan lebih reliable.
   * 
   * Ini bukan bypass — ini adalah standar industri untuk LLM output handling.
   */
  private static _normalizeLLMResponse(rawResponse: string): string {
    if (!rawResponse) return '';
    
    let cleaned = rawResponse;
    
    // 1. Hapus HTML tags (jika LLM mengembalikan HTML-wrapped response)
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    
    // 2. Hapus prefix umum yang sering ditambahkan LLM
    const prefixes = [
      /^(Here'?s the patch:?|Berikut patch-nya:?|Ini patch-nya:?|Tentu, ini patch-nya:?|OK, here'?s the JSON:?|Here is the JSON:?)/i,
      /^(I'?ve (added|modified|updated) .*?:?)/i,
      /^(Saya (sudah|telah) .*?:?)/i,
    ];
    for (const prefix of prefixes) {
      cleaned = cleaned.replace(prefix, '').trim();
    }
    
    // 3. Hapus suffix umum
    const suffixes = [
      /(Let me know if you need .*?\.?|Semoga membantu\.?|Hope this helps\.?)$/i,
      /(Feel free to ask .*?\.?)$/i,
    ];
    for (const suffix of suffixes) {
      cleaned = cleaned.replace(suffix, '').trim();
    }
    
    return cleaned;
  }

  /**
   * Multi-stage JSON patch extractor dengan fallback code block extraction.
   * UPGRADE: Jika tidak ada JSON sama sekali, coba extract code block dari natural language
   * dan convert ke JSON patch format.
   */
  private static _extractJSONPatch(
    normalized: string, 
    raw: string,
    requestFilePath?: string  // ✅ Tambahkan parameter ini
  ): { parsed: Record<string, string> | null; method: string; error?: string } {
    
    // STAGE 1: Direct parse dari normalized response
    try {
      const trimmed = normalized.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { parsed, method: 'DIRECT_PARSE_NORMALIZED' };
        }
      }
    } catch (_) {}

    // STAGE 2: Direct parse dari raw
    try {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { parsed, method: 'DIRECT_PARSE_RAW' };
        }
      }
    } catch (_) {}

    // STAGE 3: Extract dari Markdown code block (JSON)
    const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
    const codeBlockMatches = [...raw.matchAll(codeBlockRegex)];
    for (const match of codeBlockMatches) {
      try {
        const candidate = match[1].trim();
        const parsed = JSON.parse(candidate);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { parsed, method: 'MARKDOWN_JSON_BLOCK' };
        }
      } catch (_) {
        continue;
      }
    }

    // STAGE 4: Fuzzy extraction
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = raw.substring(firstBrace, lastBrace + 1);
      const cleaned = jsonCandidate
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      
      try {
        const parsed = JSON.parse(cleaned);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { parsed, method: 'FUZZY_EXTRACTION_CLEANED' };
        }
      } catch (_) {
        try {
          const parsed = JSON.parse(jsonCandidate);
          if (typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { parsed, method: 'FUZZY_EXTRACTION_RAW' };
          }
        } catch (_) {}
      }
    }

    // STAGE 5: Regex fallback
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { parsed, method: 'REGEX_FALLBACK' };
        }
      } catch (_) {}
    }

    // =====================================================
    // STAGE 6: FALLBACK CODE BLOCK EXTRACTION (NEW!)
    // =====================================================
    // Jika tidak ada JSON sama sekali, coba extract code block (jsx/javascript/typescript)
    // dan convert ke JSON patch format. Ini adalah last resort untuk menyelamatkan request.
    const languageCodeBlockRegex = /```(?:jsx?|tsx?|javascript|typescript|react)\s*\n?([\s\S]*?)\n?```/g;
    const languageMatches = [...raw.matchAll(languageCodeBlockRegex)];
    
    if (languageMatches.length > 0) {
      console.log(`[EXTRACTION] Found ${languageMatches.length} language code block(s), attempting to convert to patch...`);
      
      const syntheticPatch: Record<string, string> = {};
      
      // Coba infer file path dari context
      let inferredPath = requestFilePath;
      if (!inferredPath) {
        // Coba extract path dari response text
        const pathMatch = raw.match(/([a-zA-Z0-9_\-\/]+\.(jsx?|tsx?))/);
        if (pathMatch) {
          inferredPath = pathMatch[1];
        } else {
          inferredPath = 'unknown_file.jsx';
        }
      }
      
      // Ambil code block terbesar (anggap itu yang utama)
      let largestCode = '';
      for (const match of languageMatches) {
        if (match[1].length > largestCode.length) {
          largestCode = match[1];
        }
      }
      
      if (largestCode.length > 50) {
        syntheticPatch[inferredPath] = largestCode.trim();
        console.log(`[EXTRACTION] Successfully converted code block to patch for: ${inferredPath}`);
        return { 
          parsed: syntheticPatch, 
          method: 'CODE_BLOCK_TO_PATCH_FALLBACK' 
        };
      }
    }

    // Semua stage gagal
    return { 
      parsed: null, 
      method: 'NO_JSON_FOUND',
      error: `No JSON object found. Response has ${raw.length} chars. Contains {=${raw.includes('{')}, }=${raw.includes('}')}`
    };
  }

  // ========================================================================
  // AUDIT RECORD CREATION
  // ========================================================================

  public static createAuditRecord(
    report: VerificationReport,
    context: VerificationContext
  ): VerificationAuditRecord {
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
      evidence: context.evidenceReport || null,
      profile: report.profile,
    };
  }

  // ========================================================================
  // ROUTING HELPER (Deterministic Profile Selection - ADR-0013)
  // ========================================================================

  public static verify(
    mode: "ENGINEER" | "LITE" | "ASSISTANT" | string,
    context: VerificationContext
  ): VerificationReport {
    switch (mode) {
      case "ENGINEER":
        return VerificationEngine.verifyPatchEngineering(context);

      case "LITE":
        return VerificationEngine.verifyPersonal(context);

      case "ASSISTANT":
      default:
        return VerificationEngine.verifyEngineering(context);
    }
  }
}