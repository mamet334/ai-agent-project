import { EngineeringLifecycleManager } from '../lifecycle/engineering_lifecycle.ts';
import { RuntimeContext } from '../../runtime_context.ts';

export type DispatcherDecision = 'ALLOW' | 'ALLOW_WITH_LIMIT' | 'DENY' | 'REQUIRE_USER_APPROVAL' | 'WOULD_DENY' | 'WOULD_REQUIRE_APPROVAL';

export interface DispatcherResult {
  decision: DispatcherDecision;
  reason?: string;
}

export class ToolDispatcher {
  /**
   * Executes a tool or plugin while enforcing policy sequence.
   * Currently runs in SHADOW MODE (Phase 1 & 2).
   */
  static async execute(
    toolName: string,
    args: any,
    rctx: RuntimeContext,
    executionFn: () => Promise<any>
  ): Promise<any> {
    const shadowMode = false; // PRIORITY 1: Hard Enforcement Activated 
    let finalDecision: DispatcherDecision = 'ALLOW';
    let denyReason = '';

    try {
      // 5. RuntimeContext null check
      if (!rctx || !rctx.policy || !rctx.state) {
          throw new Error('[ToolDispatcher] Critical Error: RuntimeContext is malformed or null.');
      }

      // 6. Recursive dispatch protection using depth counter
      if (typeof rctx.state._dispatchDepth !== 'number') {
          rctx.state._dispatchDepth = 0;
      }
      
      const MAX_DISPATCH_DEPTH = 5;
      if (rctx.state._dispatchDepth >= MAX_DISPATCH_DEPTH) {
          throw new Error(`[ToolDispatcher] Maximum dispatch depth exceeded (${MAX_DISPATCH_DEPTH}) for tool: ${toolName}. Execution aborted.`);
      }
      
      rctx.state._dispatchDepth++;

      // 1. EngineeringLifecycleManager (if in ENGINEER mode)
      if (rctx.policy.mode === 'ENGINEER' && rctx.state.engineeringState) {
         const policyRes = EngineeringLifecycleManager.enforcePolicy(toolName, args, rctx.state.engineeringState, rctx);
         if (!policyRes.allowed) {
            finalDecision = shadowMode ? 'WOULD_DENY' : 'DENY';
            denyReason = policyRes.reason || 'Blocked by EngineeringLifecycleManager';
         }
      }

      // 2. Risk Gate
      if (finalDecision === 'ALLOW' && this.isHighRisk(toolName, args)) {
         finalDecision = shadowMode ? 'WOULD_DENY' : 'DENY';
         denyReason = 'Risk Gate: High risk operation detected (e.g. destructive commands or outside workspace).';
      }

    } catch (e: any) {
      // 1. Fail-closed on internal error
      finalDecision = 'DENY';
      denyReason = `Dispatcher internal error during policy check: ${e.message}`;
      await this.logTelemetry(toolName, args, finalDecision, denyReason, rctx);
      if (rctx?.state?._dispatchDepth) rctx.state._dispatchDepth--;
      throw new Error(`[DENY_ON_INTERNAL_ERROR] ${denyReason}`);
    }
    
    // Log the SHADOW MODE decision
    await this.logTelemetry(toolName, args, finalDecision, denyReason, rctx);

    // Final Execution
    if (!shadowMode && (finalDecision === 'DENY' || finalDecision === 'REQUIRE_USER_APPROVAL')) {
      if (rctx?.state?._dispatchDepth) rctx.state._dispatchDepth--;
      throw new Error(denyReason);
    }

    try {
        return await executionFn();
    } finally {
        if (rctx?.state?._dispatchDepth) rctx.state._dispatchDepth--;
    }
  }

  private static isHighRisk(toolName: string, args: any): boolean {
    if (toolName === 'run_command' && args?.CommandLine) {
      const cmd = args.CommandLine.toLowerCase();
      
      // 3. Expanded Risk Gate based on Verification Audit
      const dangerousPatterns = [
          'rm -rf', 'rm -r ', 'del /s /q', 'format ',
          'remove-item', 'rmdir', 'shred ', 'dd if=', 
          'os.remove', 'shutil.rmtree',
          'base64', 'certutil', 'wget ', 'curl '
      ];
      
      for (const pattern of dangerousPatterns) {
          if (cmd.includes(pattern)) return true;
      }
      
      // Chaining check (&&, ||, ;, |)
      const chainedPatterns = ['&&', '||', ';', '|'];
      for (const pattern of chainedPatterns) {
          if (cmd.includes(pattern)) return true;
      }
    }
    return false;
  }

  private static async logTelemetry(toolName: string, args: any, decision: DispatcherDecision, reason: string, rctx: RuntimeContext) {
    if (!rctx?.logger) return;
    
    const targetResource = args?.TargetFile || args?.AbsolutePath || args?.task || args?.CommandLine || 'unknown';
    const metadata = {
       dispatcher_mode: shadowMode ? 'SHADOW' : 'ENFORCED',
       tool_name: toolName,
       target: targetResource,
       decision: decision,
       reason: reason,
       timestamp: new Date().toISOString()
    };

    // 4. Await directly to prevent telemetry loss on request timeout
    try {
        await rctx.logger.logAgentEvent('TOOL_DISPATCHER_AUDIT', 'system', JSON.stringify(metadata));
    } catch(e) {
        console.error('[ToolDispatcher] Failed to log telemetry:', e);
    }
  }
}
