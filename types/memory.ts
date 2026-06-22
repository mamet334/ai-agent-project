export interface MemoryNode {
  id: string;
  user_id: string;
  key: string;
  value: string;
  semantic_identity: string;
  confidence: number;
  created_at: string;
  updated_at?: string;
  truth_score: number;
}

export interface MemoryWriteRequest {
  user_id: string;
  key: string;
  value: string;
}

export interface MemoryReadRequest {
  user_id: string;
  key: string;
}
