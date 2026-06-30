import { MAEFExecutionResult } from '../maef/maef_contract.ts';
import { initializeEventSubscribers } from '../event/subscribers/registry.ts';
import { MAEFStateMachine } from '../maef/maef_state_machine.ts';
import { ContextBuilderHandler } from './handlers/context_builder.ts';
import { IntentRouterHandler } from './handlers/intent_router.ts';
import { ExecutionPlannerHandler } from './handlers/execution_handler.ts';
import { SynthesisHandler } from './handlers/synthesis_handler.ts';

export const coreEngine = {
  async execute(ctx: any, rctx: any): Promise<MAEFExecutionResult> {
    initializeEventSubscribers();
    const maef = new MAEFStateMachine();

    // Default Fallbacks
    let model = rctx.model.model;
    let tools = ctx.request.tools;
    let groundingSources: any[] = [];
    let toolExecution: any = null;
    let subagentRuns: any[] = [];
    let contractValidation = ctx.request.contractValidation;
    let routingDecision = ctx.request.routingDecision;

    // --- PHASE 1: CONTEXT BUILDER ---
    const contextResult = await ContextBuilderHandler.handle(ctx, rctx, maef);
    
    if (contextResult.isBlocked) {
       return contextResult.response;
    }

    const { fullSystemContext, evidenceReport, confidenceReport } = contextResult;
    routingDecision = contextResult.routingDecision || routingDecision;

    // --- PHASE 2: INTENT ROUTING ---
    const routerResult = await IntentRouterHandler.handle(ctx, rctx, maef);
    const { isChatBiasa, plan } = routerResult;
    contractValidation = routerResult.contractValidation || contractValidation;

    // --- PHASE 3: EXECUTION PLANNER ---
    let accumulatedContext = `Permintaan awal user: "${ctx.request.finalMessage}"\n\n`;
    
    if (plan && plan.length > 0 && maef.shouldExecutePhase('ORCHESTRATION')) {
        const executionResult = await ExecutionPlannerHandler.execute(plan, ctx, rctx, maef, accumulatedContext, model);
        accumulatedContext = executionResult.accumulatedContext;
        subagentRuns = executionResult.subagentRuns;
    }

    // --- PHASE 4 & 5: SYNTHESIS & VERIFICATION ---
    const synthesisState = {
      isChatBiasa,
      fullSystemContext,
      accumulatedContext,
      confidenceReport,
      evidenceReport,
      tools,
      groundingSources,
      toolExecution,
      subagentRuns,
      routingDecision,
      contractValidation
    };

    return await SynthesisHandler.handle(synthesisState, ctx, rctx, maef);
  }
};
