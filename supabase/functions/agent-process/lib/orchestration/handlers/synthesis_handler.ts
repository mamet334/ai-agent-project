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
    let replyMessage = 'Gagal memproses jawaban.';

    if (isChatBiasa || !maef.shouldExecutePhase('ORCHESTRATION')) {
        ctx.state.processingSteps.push('✍️ Menghubungi Model AI untuk menjawab langsung...');
        
        if (stream && !extractedImage) {
          return { mode: 'STREAM', type: 'LLM', prompt: ctx.request.finalMessage, systemContext: fullSystemContext, history, payload: { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode: ctx.request.auditMode, routingDecision, contractValidation }, snapshot: maef.getSnapshot() };
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

        // [DIAGNOSTIC] Single instrumentation point — AUDIT-03 recommendation (ADR-0012, 2026-07-23)
        // Persist diagnostic snapshot ke agent_logs sebelum keputusan verifikasi dibuat.
        // Fire-and-forget: tidak memblokir jalur verifikasi utama.
        if (ctx.request.mode === 'ENGINEER') {
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
        
        // Mode-Aware Verification (MAEF 4.5 + Mamet AI Constitution Capability Separation)
        let vReport;
        if (ctx.request.mode === 'ENGINEER') {
            // Jalur Insinyur: verifikasi ketat (ADR, source trace, evidence, format)
            vReport = VerificationEngine.verifyEngineering(vContext);

            // Persist CHECK_002_FORMAT_COMPLIANCE_FAIL ke agent_logs jika terjadi.
            // Dilakukan di sini (bukan di dalam VerificationEngine) karena engine adalah
            // pure computation class tanpa akses rctx/DB — sesuai separation of concerns.
            const check002Fail = vReport.failures.find(c => c.id === 'CHECK_002_SOURCE_TRACE_EXISTS');
            if (check002Fail) {
              rctx.tasks.fire('Check002FormatLog', persistTelemetryLog(rctx, {
                userId: ctx.auth.userId ?? null,
                eventType: 'CHECK_002_FORMAT_COMPLIANCE_FAIL',
                provider: 'system',
                message: check002Fail.message,
                metadata: {
                  backend_trace_items: confidenceReport?.sourceTrace?.length ?? 0,
                  parser_trace: sourceTrace ?? null,
                  total_evidence: evidenceReport?.totalEvidence ?? 0,
                  strict_mode: (Deno.env.get('ENGINEER_STRICT_MODE') ?? 'true') !== 'false',
                  check_status: check002Fail.status,
                },
              }));
            }
        } else {
            // Jalur Personal: verifikasi relevan (response, forbidden phrases, confidence)
            vReport = VerificationEngine.verifyPersonal(vContext);
        }
        
        const auditRecord = VerificationEngine.createAuditRecord(vReport, vContext);
        
        eventBus.emit({
          type: 'Verification.Completed',
          source: 'VerificationEngine',
          trace_id: rctx?.tasks?.traceId || 'unknown',
          payload: { rctx, vReport, vContext, userId: ctx.auth.userId, auditRecord }
        });

        if (vReport.decision === "FAIL") {
            console.log(`[SynthesisHandler] Mode saat verifikasi:`, ctx.request.mode);
            if (ctx.request.mode === 'ENGINEER' || ctx.request.mode === 'engineer') {
                console.warn(`[HARD GATE] BLOCKED. Keputusan verifikasi gagal (Skor: ${vReport.score}).`);
                return { mode: 'DIRECT', aiResponse: { message: "Verification Failed" }, snapshot: maef.getSnapshot() };
            }
            // For ASSISTANT/LITE modes, failures are typically related to missing dynamic memory rather than architecture violations.
            console.warn(`[HARD GATE] Soft Warning: Capability-Based Verification failed for mode=${ctx.request.mode}. Proceeding without blocking.`);
        }
    } else {
        if (maef.shouldExecutePhase('POST_PROCESSING')) {
          maef.requestTransition('POST_PROCESSING', 'Starting Final Synthesis');
          const synthesisPrompt = `Anda telah menugaskan beberapa sub-agent.${fullSystemContext}\n\nPermintaan Awal User: "${ctx.request.finalMessage}"\n\nRiwayat pekerjaan sub-agent:\n${accumulatedContext}\n\nJAWABLAH pesan/pertanyaan user dengan ramah dan natural berdasarkan informasi dari sub-agent di atas. \n\nPENTING: \n- JANGAN gunakan format kaku seperti "Laporan Hasil Kerja".\n- Langsung berikan jawaban, sapaan balik, atau solusi.\n- Sertakan gambar jika ada.\n- Jangan pernah mengarang data palsu!\n- Gunakan format Tabel Markdown HANYA jika menyajikan data terstruktur.\n- DILARANG KERAS menggunakan blok \`\`\`mermaid\`\`\` KECUALI diminta.`;
          
          ctx.state.processingSteps.push('📝 Merangkum dan menyintesis jawaban akhir...');
          
          if (stream && !extractedImage) {
            return { mode: 'STREAM', type: 'LLM', prompt: synthesisPrompt, systemContext: fullSystemContext, history, payload: { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode: ctx.request.auditMode, routingDecision, contractValidation }, snapshot: maef.getSnapshot() };
          }
          replyMessage = await runLLM(synthesisPrompt, fullSystemContext, history, rctx);
        } else {
          if (stream && !extractedImage) {
            return { mode: 'STREAM', type: 'LLM', prompt: ctx.request.finalMessage, systemContext: fullSystemContext, history, payload: { toolsUsed: tools, groundingSources, toolExecution, subagentRuns, processingSteps: ctx.state.processingSteps, auditMode: ctx.request.auditMode, routingDecision, contractValidation }, snapshot: maef.getSnapshot() };
          }
          replyMessage = await runLLM(ctx.request.finalMessage, fullSystemContext, history, rctx);
        }
    }

    eventBus.emit({
      type: 'Memory.WriteRequested',
      source: 'Orchestrator',
      trace_id: rctx?.tasks?.traceId || 'unknown',
      payload: { rctx, userId: ctx.auth.userId, message: ctx.request.finalMessage, canWriteMemory: ctx.policy.canWriteMemory, mode: ctx.policy.mode }
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
    eventBus.emit({ type: 'Response.Generated', source: 'Orchestrator', payload: { success: true }, trace_id: rctx?.tasks?.traceId || 'unknown' });
    
    return { mode: 'DIRECT', aiResponse, snapshot: maef.getSnapshot() };
  }
};
