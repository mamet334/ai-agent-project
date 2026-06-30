export type MAEFPhase = 
  | 'INIT'
  | 'CONTEXT_BUILD'
  | 'TOOL_EXECUTION'
  | 'ORCHESTRATION'
  | 'POST_PROCESSING'
  | 'STREAMING_READY'
  | 'COMPLETED';

export interface MAEFStep {
  id: string;
  phase: MAEFPhase;
  description: string;
  timestamp: number;
}

export interface MAEFStateSnapshot {
  phase: MAEFPhase;
  steps: MAEFStep[];
  routingDecision?: any;
  toolsUsed?: number;
  evidenceReport?: any;
  confidenceReport?: any;
}

export interface MAEFExecutionContext {
  ctx: any;
  rctx: any;
  snapshot: MAEFStateSnapshot;
}

export interface MAEFExecutionResult {
  mode: 'STREAM' | 'DIRECT';
  type?: 'LLM' | 'BLOCKED';
  prompt?: string;
  systemContext?: string;
  history?: any[];
  payload?: any;
  blockedMsg?: string;
  aiResponse?: any;
  snapshot: MAEFStateSnapshot;
}
