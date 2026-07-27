import { runLLM } from '../../llm_orchestrator.ts';
import { executeResponsePipeline } from '../../coordinator/parser_pipeline.ts';
import { VerificationEngine } from '../../verification/verification_engine.ts';
import { persistTelemetryLog } from '../../verification/verification_service.ts';
import { eventBus } from '../../event/event_bus.ts';

export const SynthesisHandler = {
  async handle(state: any, ctx: any, rctx: any, maef: any): Promise<any> {
    const { 
      isChatBiasa, 
      fullSystemContext, 
      accumulatedContext, 
      confidenceReport, 
      evidenceReport, 
      tools, 
      groundingSources, 
      toolExecution, 
      subagentRuns, 
      routingDecision, 
      contractValidation 
    } = state;
    
    const stream = ctx.request.stream;
    const extractedImage = ctx.request.extractedImage;
    const history = ctx.request.history;
    const requestMode = (ctx.request.mode || 'ASSISTANT').toUpperCase(); // Normalisasi mode
    let replyMessage = 'Gagal memproses jawaban.';

    if (isChatBiasa || !maef.shouldExecutePhase('ORCHESTRATION')) {
        ctx.state.processingSteps.push('✍️ Menghubungi Model AI untuk menjawab langsung...');
        
        if (stream && !extractedImage) {
          return { 
            mode: 'STREAM', 
            type: 'LLM', 
            prompt: ctx.request.finalMessage, 
            systemContext: fullSystemContext, 
            history, 
            payload: { 
              toolsUsed: tools, 
              groundingSources, 
              toolExecution, 
              subagentRuns, 
              processingSteps: ctx.state.processingSteps, 
              auditMode: ctx.request.auditMode, 
              routingDecision, 
              contractValidation 
            }, 
            snapshot: maef.getSnapshot() 
          };
        }
        replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
        
        const { replyWithoutTrace, sourceTrace } = executeResponsePipeline('extract_trace', replyMessage, rctx);

        const vContext = {
          responseText: replyWithoutTrace,
          sourceTrace: sourceTrace,
          confidenceReport,
          evidenceReport,
          runtimeContext: ctx.state
        };

        // =============================================
        // DIAGNOSTIC: Persist verification input snapshot (ADR-0012)
        // =============================================
        // Khusus untuk mode ENGINEER, simpan snapshot diagnostik sebelum verifikasi
        if (requestMode === 'ENGINEER') {
          rctx.tasks.fire('SynthesisDiag', persistTelemetryLog(rctx, {
            userId: ctx.auth.userId ?? null,
            eventType: 'VERIFICATION_DIAG',
            provider: 'system',
            message: 'Engineer verification input snapshot',
            metadata: {
              reply_length: replyMessage?.length ?? 0,
              parser_trace: sourceTrace ?? null,
              parser_trace_found: sourceTrace !== undefined,
              backend_trace_items: confidenceReport?.sourceTrace?.length ?? 0,
              total_evidence: evidenceReport?.totalEvidence ?? 0,
              brain1_count: evidenceReport?.brain1Count ?? 0,
              brain2_count: evidenceReport?.brain2Count ?? 0,
              confidence_score: confidenceReport?.score ?? 0,
              confidence_grade: confidenceReport?.grade ?? null,
            },
          }));
        }
        
        // =============================================
        // MULTI-PROFILE VERIFICATION ROUTING (ADR-0013)
        // =============================================
        // Gunakan helper method deterministik yang memilih profile berdasarkan mode
        // ENGINEER → PATCH_ENGINEERING (JSON patch validation)
        // LITE → PERSONAL (lightweight sanity check)
        // ASSISTANT → ENGINEERING (full ADR trace + evidence check)
        const vReport = VerificationEngine.verify(requestMode, vContext);
        
        console.log(`[SynthesisHandler] Verification Profile: ${vReport.profile} | Decision: ${vReport.decision} | Score: ${vReport.score} | Mode: ${requestMode}`);

        // =============================================
        // SPECIFIC LOGGING: CHECK_002 Format Compliance (khusus ENGINEERING profile)
        // =============================================
        // Hanya relevan untuk profile ENGINEERING (mode ASSISTANT) yang membutuhkan ADR trace
        if (vReport.profile === 'ENGINEERING') {
          const check002Fail = vReport.failures.find(c => c.id === 'CHECK_002_SOURCE_TRACE_EXISTS');
          if (check002Fail) {
            rctx.tasks.fire('Check002FormatLog', persistTelemetryLog(rctx, {
              userId: ctx.auth.userId ?? null,
              eventType: 'CHECK_002_FORMAT_COMPLIANCE_FAIL',
              provider: 'system',
              message: check002Fail.message,
              metadata: {
                profile: vReport.profile,
                mode: requestMode,
                backend_trace_items: confidenceReport?.sourceTrace?.length ?? 0,
                parser_trace: sourceTrace ?? null,
                total_evidence: evidenceReport?.totalEvidence ?? 0,
                strict_mode: (Deno.env.get('ENGINEER_STRICT_MODE') ?? 'true') !== 'false',
                check_status: check002Fail.status,
              },
            }));
          }
        }
        
        // =============================================
        // AUDIT RECORD CREATION (semua profile)
        // =============================================
        const auditRecord = VerificationEngine.createAuditRecord(vReport, vContext);
        
        eventBus.emit({
          type: 'Verification.Completed',
          source: 'VerificationEngine',
          trace_id: rctx?.tasks?.traceId || 'unknown',
          payload: { 
            rctx, 
            vReport, 
            vContext, 
            userId: ctx.auth.userId, 
            auditRecord,
            profile: vReport.profile,
            mode: requestMode
          }
        });

        // =============================================
        // HARD GATE: Konsisten untuk semua profile (MAEF 4.5)
        // =============================================
        // Setiap profile memiliki kriteria FAIL-nya sendiri:
        // - ENGINEERING: FAIL jika ADR trace hilang atau ada hallucination
        // - PERSONAL: FAIL jika response kosong atau ada forbidden phrases
        // - PATCH_ENGINEERING: FAIL jika JSON invalid, ada dangerous patterns, atau core file dimodifikasi
        if (vReport.decision === "FAIL") {
          const failedChecksSummary = vReport.failures
            .map(f => `[${f.severity}] ${f.id}: ${f.message}`)
            .join(' | ');
          
          console.error(`[HARD GATE] ❌ BLOCKED. Profile: ${vReport.profile} | Mode: ${requestMode} | Score: ${vReport.score} | Failed Checks: ${vReport.failedChecks}/${vReport.totalChecks}`);
          console.error(`[HARD GATE] Failure details: ${failedChecksSummary}`);
          
          // Response berbeda berdasarkan profile untuk debugging yang lebih baik
          const failureResponse = {
            message: "Verification Failed",
            profile: vReport.profile,
            mode: requestMode,
            score: vReport.score,
            passRate: vReport.passRate,
            failures: vReport.failures.map(f => ({
              id: f.id,
              name: f.name,
              severity: f.severity,
              message: f.message
            }))
          };
          
          return { 
            mode: 'DIRECT', 
            aiResponse: failureResponse, 
            snapshot: maef.getSnapshot() 
          };
        }
        
        // Log soft warning jika ada warnings (non-fatal)
        if (vReport.warnings && vReport.warnings.length > 0) {
          console.warn(`[VERIFICATION] ⚠️ ${vReport.warnings.length} warning(s) on profile ${vReport.profile}: ${vReport.warnings.map(w => w.id).join(', ')}`);
        }
        
    } else {
        // =============================================
        // MULTI-AGENT ORCHESTRATION PATH (sub-agents dispatched)
        // =============================================
        if (maef.shouldExecutePhase('POST_PROCESSING')) {
          maef.requestTransition('POST_PROCESSING', 'Starting Final Synthesis');
          const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent.${fullSystemContext}\n\nPermintaan Awal User: "${ctx.request.finalMessage}"\n\nRiwayat pekerjaan sub-agent:\n${accumulatedContext}\n\nJAWABLAH pesan/pertanyaan user dengan ramah dan natural berdasarkan informasi dari sub-agent di atas. \n\nPENTING: \n- JANGAN gunakan format kaku seperti "Laporan Hasil Kerja".\n- Langsung berikan jawaban, sapaan balik, atau solusi.\n- Sertakan gambar jika ada.\n- Jangan pernah mengarang data palsu!\n- Gunakan format Tabel Markdown HANYA jika menyajikan data terstruktur.\n- DILARANG KERAS menggunakan blok \`\`\`mermaid\`\`\` KECUALI diminta.`;
          
          ctx.state.processingSteps.push('📝 Merangkum dan menyintesis jawaban akhir...');
          
          if (stream && !extractedImage) {
            return { 
              mode: 'STREAM', 
              type: 'LLM', 
              prompt: synthesisPrompt, 
              systemContext: fullSystemContext, 
              history, 
              payload: { 
                toolsUsed: tools, 
                groundingSources, 
                toolExecution, 
                subagentRuns, 
                processingSteps: ctx.state.processingSteps, 
                auditMode: ctx.request.auditMode, 
                routingDecision, 
                contractValidation 
              }, 
              snapshot: maef.getSnapshot() 
            };
          }
          replyMessage = await runLLM(synthesisPrompt, fullSystemContext, history, rctx);
        } else {
          if (stream && !extractedImage) {
            return { 
              mode: 'STREAM', 
              type: 'LLM', 
              prompt: ctx.request.finalMessage, 
              systemContext: fullSystemContext, 
              history, 
              payload: { 
                toolsUsed: tools, 
                groundingSources, 
                toolExecution, 
                subagentRuns, 
                processingSteps: ctx.state.processingSteps, 
                auditMode: ctx.request.auditMode, 
                routingDecision, 
                contractValidation 
              }, 
              snapshot: maef.getSnapshot() 
            };
          }
          replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
        }
    }

    // =============================================
    // MEMORY WRITE REQUEST (Event-Driven)
    // =============================================
    eventBus.emit({
      type: 'Memory.WriteRequested',
      source: 'Orchestrator',
      trace_id: rctx?.tasks?.traceId || 'unknown',
      payload: { 
        rctx, 
        userId: ctx.auth.userId, 
        message: ctx.request.finalMessage, 
        canWriteMemory: ctx.policy.canWriteMemory, 
        mode: ctx.policy.mode 
      }
    });

    await rctx.tasks.awaitAll();

    const aiResponse = {
      message: replyMessage,
      toolsUsed: tools,
      groundingSources,
      toolExecution,
      subagentRuns,
      processingSteps: ctx.state.processingSteps,
      timestamp: new Date(),
      userId: ctx.auth.userId
    };

    maef.requestTransition('COMPLETED', 'Execution Completed');
    eventBus.emit({ 
      type: 'Response.Generated', 
      source: 'Orchestrator', 
      payload: { success: true }, 
      trace_id: rctx?.tasks?.traceId || 'unknown' 
    });
    
    return { mode: 'DIRECT', aiResponse, snapshot: maef.getSnapshot() };
  }
};