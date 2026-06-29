export type MametCapabilityMode = "AI" | "LITE" | "ENGINEER";

export interface UnifiedExecutionContext {
  auth: { userId: string; userName?: string; appSource: string; };
  request: { 
    originalMessage: string; 
    finalMessage: string; 
    lowerMsg: string; 
    tools?: any[]; 
    model?: string; 
    stream?: boolean; 
    history?: any[]; 
    globalMemory?: any; 
    localWorkspaceEnabled?: boolean; 
    workspaceTarget?: string; 
    desktopOSMode?: boolean; 
    auditMode?: string; 
    extractedImage?: any; 
    routingDecision?: any; 
    agentIdentityPrompt?: string; 
    userContextPrompt?: string; 
    ragEnabled?: boolean;
    isRagEnabled?: boolean;
    effectiveRagThreshold?: number;
    effectiveRagMatchCount?: number;
    contractValidation?: any;
    guardianPromptDirective?: string;
  };
  policy: { mode: MametCapabilityMode; decision: "ALLOW" | "ALLOW_WITH_LIMIT" | "BLOCK"; toolsEnabled: boolean; webSearchEnabled: boolean; riskScore: number; ragTopK: number; ragThreshold: number; webHint?: string; canReadRAG: boolean; canReadMemory: boolean; canWriteMemory: boolean; canWriteKnowledge: boolean; canUseWorkspace: boolean; canUseAutomation: boolean; canUseDesktopTools: boolean; };
  state: { ragArray: any[]; memoryArray: any[]; processingSteps: string[]; };
  rag: { topK: number; threshold: number; allowLongDocs: boolean; compressionLevel: "low" | "high"; };
  execution: { memoryPriority: "memory_first" | "balanced"; webSearchEnabled: boolean; subAgentEnabled: boolean; webHint?: string; };
  trace: { riskScore: number; retrievalStrategy: string; timestamp: number; };
}

export interface RequestPipelineParams {
  request: Request;
  corsHeaders: HeadersInit;
}

export interface RequestPipelineResult {
  ctx: UnifiedExecutionContext;
  rctx: any; // RuntimeContext
  response?: Response;
}