export interface AdapterContext {
  trace_id: string;
  userId?: string;
  [key: string]: any;
}

export interface AdapterResult {
  result: any;
  confidence: number;
  source: string;
  trace_id: string;
}

export interface CapabilityAdapter {
  name: string;
  type: 'AI' | 'DATABASE' | 'SEARCH' | 'TOOL';
  
  initialize(): Promise<boolean>;
  execute(input: any, context: AdapterContext): Promise<AdapterResult>;
  healthCheck(): Promise<boolean>;
  shutdown(): Promise<void>;
}
