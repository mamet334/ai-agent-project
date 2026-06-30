import { VerificationEngine } from '../verification_engine.ts';
import { executeResponsePipeline } from './parser_pipeline.ts';

export interface PostProcessInput {
  replyMessage: string;
  isChatBiasa: boolean;
  isStreaming: boolean;
  confidenceReport: any;
  evidenceReport: any;
  runtimeState: any; 
  userId: string | null;
  finalMessage: string;
  enableAsyncMemoryWrite: boolean;
  canWriteMemory: boolean;
  groundingSources: any[];
}

export interface PostProcessOutput {
  decision: 'PASS' | 'FAIL';
  verificationScore?: number;
  vReport?: any;
  auditRecord?: any;
  finalReplyMessage: string;
  memoryTasks: Array<{ name: string, payload: { userId: string | null, message: string } }>;
  auditTasks: Array<{ name: string, payload: { auditRecord: any, userId: string | null } }>;
  updatedGroundingSources: any[];
}

export function postProcessResponse(input: PostProcessInput): PostProcessOutput {
  const output: PostProcessOutput = {
    decision: 'PASS',
    finalReplyMessage: input.replyMessage,
    memoryTasks: [],
    auditTasks: [],
    updatedGroundingSources: input.groundingSources || [],
  };

  // 1. Verification Soft Gate (Only for isChatBiasa and NOT streaming)
  if (input.isChatBiasa && !input.isStreaming) {
    const traceResult = executeResponsePipeline('extract_trace', input.replyMessage);
    const replyWithoutTrace = traceResult.replyWithoutTrace;
    const sourceTrace = traceResult.sourceTrace;
    
    const vContext = {
      responseText: replyWithoutTrace,
      sourceTrace: sourceTrace,
      confidenceReport: input.confidenceReport,
      evidenceReport: input.evidenceReport,
      runtimeContext: input.runtimeState
    };
    
    const vReport = VerificationEngine.verify(vContext);
    const auditRecord = VerificationEngine.createAuditRecord(vReport, vContext);
    
    output.vReport = vReport;
    output.auditRecord = auditRecord;

    output.auditTasks.push({
      name: 'VerificationAuditLog',
      payload: { auditRecord, userId: input.userId }
    });

    if (vReport.decision === "FAIL") {
      output.decision = "FAIL";
      output.verificationScore = vReport.score;
      return output;
    }

    // 3. Response Finalization
    output.finalReplyMessage = replyWithoutTrace; 
  }

  // 2. Memory Write Queue (For non-ChatBiasa requests)
  if (!input.isChatBiasa) {
    if (input.enableAsyncMemoryWrite && input.canWriteMemory) {
      output.memoryTasks.push({
        name: 'MemoryWriteQueue',
        payload: { userId: input.userId, message: input.finalMessage }
      });
    }
  }

  // 4. Citation / Grounding Assembly (Deterministic pass-through)
  output.updatedGroundingSources = [...output.updatedGroundingSources];

  return output;
}
