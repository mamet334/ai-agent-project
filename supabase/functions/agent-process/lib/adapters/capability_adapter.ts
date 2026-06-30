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
  metadata?: any;
}

export interface CapabilityAdapter {
  name: string;
  type: 'AI' | 'DATABASE' | 'SEARCH' | 'TOOL' | 'EMBEDDING';
  
  initialize(): Promise<boolean>;
  execute(input: any, context: AdapterContext): Promise<AdapterResult>;
  stream(input: any, context: AdapterContext): AsyncGenerator<string, void, unknown>;
  healthCheck(): Promise<boolean>;
  shutdown(): Promise<void>;
}
