import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { RuntimeContext } from '../runtime_context.ts';
import { generateEmbedding } from './embedding.ts';
import { searchDocuments } from './document_search.ts';
import { loadEngineerContext, EngineerContextResult } from './engineer_context.ts';
import { loadProjectMemory } from './project_memory.ts';
import { buildContextPipeline, ContextPipelineResult } from './context_pipeline.ts';

export interface RagPipelineParams {
  userId: string | null;
  query: string;
  globalMemory: string;
  isRagEnabled: boolean;
  effectiveRagThreshold: number;
  effectiveRagMatchCount: number;
  canReadMemory: boolean;
  mode: string;
  ragTopK: number;
  webHint?: string;
  agentIdentityPrompt: string;
  userContextPrompt: string;
}

export interface RagPipelineResult {
  finalContext: string;
  ragArray: any[];
  memoryArray: any[];
  engineerContext: EngineerContextResult | null;
  metadata: {
    routingDecision: any;
    processingSteps: string[];
  };
}

export async function executeRagPipeline(
  params: RagPipelineParams,
  rctx: RuntimeContext
): Promise<RagPipelineResult> {
  let ragArray: any[] = [];
  let memoryArray: any[] = [];
  let routingDecision: any = null;
  const processingSteps: string[] = [];

  // 1. EMBEDDING & ROUTING & DOCUMENT SEARCH
  if (params.userId && params.isRagEnabled) {
    try {
      const queryEmbedding = await generateEmbedding(params.query, rctx);
      if (queryEmbedding.length > 0) {
        const supabaseClient = createClient(
          rctx.env.supabaseUrl,
          rctx.env.supabaseServiceKey
        );
        
        // 🧭 STEP 2: ROUTING DECIDER LAYER (EXPLICIT CONTROL)
        routingDecision = {
            scope: "CORE",
            workspace_id: null as string | null,
            reason_code: "DEFAULT_ROUTING"
        };

        const { data: spaces } = await supabaseClient.from('knowledge_spaces').select('id, name, space_type').eq('user_id', params.userId);
        if (spaces && spaces.length > 0) {
           const coreSpace = spaces.find((s: any) => s.space_type === 'CORE');
           routingDecision.workspace_id = coreSpace ? coreSpace.id : null;

           const lowerMsg = (params.query || '').toLowerCase();
           const isWorkspaceQuery = lowerMsg.includes('workspace') || lowerMsg.includes('ruang') || lowerMsg.includes('space');
           if (isWorkspaceQuery) {
              const workspaceSpaces = spaces.filter((s: any) => s.space_type === 'WORKSPACE').sort((a: any, b: any) => b.name.length - a.name.length);
              for (const space of workspaceSpaces) {
                 if (lowerMsg.includes(space.name.toLowerCase())) {
                    routingDecision = {
                        scope: "WORKSPACE",
                        workspace_id: space.id,
                        reason_code: "EXPLICIT_WORKSPACE_MENTION_DETECTED"
                    };
                    break;
                 }
              }
           }

           if (routingDecision.scope === "CORE") {
               routingDecision.reason_code = isWorkspaceQuery ? "WORKSPACE_NOT_FOUND_FALLBACK_TO_CORE" : "NO_EXPLICIT_WORKSPACE_DETECTED";
           }
        }

        // 🧱 STEP 3: RAG HARD ISOLATION LAYER (LIGHT ENFORCEMENT)
        if (!routingDecision.workspace_id) {
           console.warn(`[RAG HARD ISOLATION] workspace_id is null. GLOBAL FALLBACK IS BLOCKED.`);
        } else {
           console.log(`[RAG_SCOPE_USED]: ${routingDecision.scope} | [WORKSPACE_ID]: ${routingDecision.workspace_id} | [IS_ISOLATED]: true`);
        }
        
        processingSteps.push(`🔍 [Routing Decider] Scope: ${routingDecision.scope} (${routingDecision.reason_code})`);

        const ragDocs = await searchDocuments(
          queryEmbedding,
          params.query,
          params.effectiveRagThreshold,
          params.effectiveRagMatchCount,
          routingDecision,
          params.userId,
          rctx
        );
        if (ragDocs.length > 0) {
          ragArray = ragDocs;
        }
      }
    } catch (err: any) {
      console.error("RAG Search Error:", err);
      if (err.message && err.message.includes("RAG_DB_FAIL")) {
          throw err; 
      }
    }
  }
  
  console.log(`[RAG CONTEXT GENERATED] ragArray size=${ragArray.length}`);
  processingSteps.push(`[RAG CONTEXT GENERATED] ragArray size=${ragArray.length}`);

  // 2. PROJECT MEMORY (RETRIEVAL)
  const projectMemResult = await loadProjectMemory(
    params.query,
    params.userId || '',
    params.globalMemory,
    params.canReadMemory,
    rctx
  );
  memoryArray = projectMemResult.memoryArray;
  const memoryPrompt = projectMemResult.memoryPrompt;
  processingSteps.push(`[MEMORY PROMPT GENERATED] memoryPrompt="${memoryPrompt.trim()}" memoryArray size=${memoryArray.length}`);

  // 3. ENGINEER CONTEXT
  const engineerCtx = await loadEngineerContext(params.mode, params.query, rctx);
  
  // 4. CONTEXT PIPELINE (FUSION)
  const resolved = buildContextPipeline({
    memoryArray: memoryArray,
    ragArray: ragArray,
    message: params.query,
    agentIdentityPrompt: params.agentIdentityPrompt,
    userContextPrompt: params.userContextPrompt,
    memoryPrompt: memoryPrompt,
    engineerContextPrompt: engineerCtx.engineerContextPrompt,
    webHint: params.webHint,
    mode: params.mode,
    ragTopK: params.ragTopK
  }, rctx);

  return {
    finalContext: resolved.finalContext,
    ragArray,
    memoryArray,
    engineerContext: engineerCtx,
    metadata: {
      routingDecision,
      processingSteps
    }
  };
}
