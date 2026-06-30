import { runLLM } from '../../llm_orchestrator.ts';
import { executeResponsePipeline } from '../../coordinator/parser_pipeline.ts';
import { VerificationEngine } from '../../verification_engine.ts';
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
        const vReport = VerificationEngine.verify(vContext);
        
        const auditRecord = VerificationEngine.createAuditRecord(vReport, vContext);
        
        eventBus.emit({
          type: 'Verification.Completed',
          source: 'VerificationEngine',
          trace_id: rctx?.tasks?.traceId || 'unknown',
          payload: { rctx, vReport, vContext, userId: ctx.auth.userId, auditRecord }
        });

        if (vReport.decision === "FAIL") {
            console.warn(`[HARD GATE] BLOCKED. Keputusan verifikasi gagal (Skor: ${vReport.score}).`);
            return { mode: 'DIRECT', aiResponse: { message: "Verification Failed" }, snapshot: maef.getSnapshot() };
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
