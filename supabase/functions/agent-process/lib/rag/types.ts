export interface RagDocument {
  title?: string;
  content: string;
  similarity?: number;
  hybrid_score?: number;
}

export interface FormattedRagContext {
  type: 'rag';
  content: string;
  score: number;
}

export interface RoutingDecision {
  scope: string;
  workspace_id: string | null;
  reason_code: string;
}
