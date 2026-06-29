export interface SubAgentPlan {
  subagent: string;
  task: string;
}

export interface TraceParseResult {
  replyWithoutTrace: string;
  sourceTrace?: string;
}

export interface ContractValidationResult {
  step: string;
  status: 'OK' | 'REJECTED';
  reason_code: string;
  normalized_plan: SubAgentPlan[];
}

export interface CoordinatorPlanParseResult {
  plan: SubAgentPlan[];
  validation: ContractValidationResult;
  healerTriggered: boolean;
  error?: string;
}
