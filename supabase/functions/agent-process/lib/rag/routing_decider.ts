import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { RuntimeContext } from '../runtime_context.ts';

export interface RoutingDecision {
    scope: string;
    workspace_id: string | null;
    reason_code: string;
}

export const executeRoutingDecision = async (query: string, userId: string, rctx: RuntimeContext, explicitWorkspaceId?: string): Promise<RoutingDecision> => {
    let routingDecision: RoutingDecision = {
        scope: "CORE",
        workspace_id: null,
        reason_code: "DEFAULT_ROUTING"
    };

    if (!userId) return routingDecision;

    // Use explicit workspace ID from UI if provided
    if (explicitWorkspaceId && explicitWorkspaceId.trim() !== '' && explicitWorkspaceId !== 'global') {
        const allowedWorkspaces = ['ws-lite', 'ws-assistant', 'ws-engineer'];
        
        // Jika UI mengirimkan string environment (bukan UUID), abaikan filter workspace_id
        if (allowedWorkspaces.includes(explicitWorkspaceId)) {
            return {
                scope: "CORE",
                workspace_id: null,
                reason_code: `EXPLICIT_UI_ENVIRONMENT_${explicitWorkspaceId.toUpperCase().replace('-', '_')}`
            };
        }
        
        // Jika bukan environment string, asumsikan itu adalah UUID workspace sungguhan
        return {
            scope: "WORKSPACE",
            workspace_id: explicitWorkspaceId,
            reason_code: "EXPLICIT_UI_WORKSPACE_SELECTION"
        };
    }

    try {
        const supabaseClient = createClient(
          rctx.env.supabaseUrl,
          rctx.env.supabaseServiceKey
        );

        const { data: spaces } = await supabaseClient.from('knowledge_spaces').select('id, name, space_type').eq('user_id', userId);
        if (spaces && spaces.length > 0) {
           const coreSpace = spaces.find((s: any) => s.space_type === 'CORE');
           routingDecision.workspace_id = coreSpace ? coreSpace.id : null;

           const lowerMsg = (query || '').toLowerCase();
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

        if (!routingDecision.workspace_id) {
           console.warn(`[RAG HARD ISOLATION] workspace_id is null. GLOBAL FALLBACK IS BLOCKED.`);
        } else {
           console.log(`[RAG_SCOPE_USED]: ${routingDecision.scope} | [WORKSPACE_ID]: ${routingDecision.workspace_id} | [IS_ISOLATED]: true`);
        }
    } catch (e) {
        console.error("Routing Decider Error:", e);
        routingDecision.reason_code = "ROUTING_ERROR_FALLBACK";
    }

    return routingDecision;
};
