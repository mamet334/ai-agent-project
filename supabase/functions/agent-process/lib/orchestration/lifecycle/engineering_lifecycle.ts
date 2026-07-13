import { EngineeringState, RuntimeContext } from '../../runtime_context.ts';
import { eventBus } from '../../event/event_bus.ts';

export class EngineeringLifecycleManager {
  /**
   * Deterministic Intent Routing based on explicit ENGINEER:* commands
   */
  static determineState(userMessage: string, previousState?: EngineeringState, currentTraceId?: string): EngineeringState {
    const msg = (userMessage || '').trim();
    
    const defaultState: EngineeringState = {
      phase: 'OBSERVE_ANALYZE',
      ownerApprovalGranted: false
    };

    let currentState = previousState || defaultState;
    let newState: EngineeringState | null = null;

    // Ephemeral Auto-Revoke Check
    if (currentTraceId && currentState.approval && currentState.approval.targetTaskId !== currentTraceId) {
        // Trace ID changed, indicating a new task boundary. Revoke automatically!
        currentState = defaultState;
        
        eventBus.emit({
          type: 'EngineeringLifecycle.PhaseChanged',
          source: 'EngineeringLifecycleManager',
          payload: { fromPhase: previousState?.phase, toPhase: 'OBSERVE_ANALYZE', approved: false, intent: 'AUTO_REVOKE' }
        });
    }

    // Explicit command matching
    if (msg.includes('ENGINEER:OBSERVE')) {
      newState = { phase: 'OBSERVE_ANALYZE', ownerApprovalGranted: false };
    } else if (msg.includes('ENGINEER:PROPOSAL')) {
      newState = { phase: 'PROPOSAL', ownerApprovalGranted: false };
    } else if (msg.includes('ENGINEER:APPROVE')) {
      newState = { 
        phase: 'IMPLEMENTATION', 
        ownerApprovalGranted: true,
        approval: { targetTaskId: currentTraceId || 'unknown', grantedAt: Date.now(), status: 'ACTIVE' }
      };
    } else if (msg.includes('ENGINEER:VERIFY')) {
      newState = { 
        phase: 'VERIFICATION_DOCUMENTATION', 
        ownerApprovalGranted: true,
        approval: { targetTaskId: currentTraceId || 'unknown', grantedAt: Date.now(), status: 'ACTIVE' }
      };
    }

    if (newState && newState.phase !== currentState.phase) {
      eventBus.emit({
        type: 'EngineeringLifecycle.PhaseChanged',
        source: 'EngineeringLifecycleManager',
        payload: {
          fromPhase: currentState.phase,
          toPhase: newState.phase,
          approved: newState.ownerApprovalGranted,
          intent: msg
        }
      });
      if (newState.phase === 'IMPLEMENTATION') {
        eventBus.emit({
          type: 'EngineeringLifecycle.ApprovalGranted',
          source: 'EngineeringLifecycleManager',
          payload: { timestamp: new Date().toISOString(), contextId: 'runtime-session' }
        });
      }
      return newState;
    }

    // If no explicit command, maintain the previous state
    return currentState;
  }

  /**
   * Layer 1: Pre-flight Filter
   * Hides tools from the LLM based on Least Required Capability principle.
   */
  static filterTools(tools: any[], state: EngineeringState): any[] {
    if (!tools) return [];

    const allowedToolNames = new Set<string>();

    // READ_FILES is always allowed
    allowedToolNames.add('view_file');
    allowedToolNames.add('list_dir');
    allowedToolNames.add('grep_search');
    
    // RUN_SAFE_COMMANDS
    allowedToolNames.add('run_command');
    allowedToolNames.add('command_status');
    allowedToolNames.add('send_command_input');

    if (state.phase === 'PROPOSAL') {
      // WRITE_DOCS
      allowedToolNames.add('write_to_file');
      allowedToolNames.add('replace_file_content');
      allowedToolNames.add('multi_replace_file_content');
    }

    if (state.phase === 'IMPLEMENTATION' && state.ownerApprovalGranted) {
      // WRITE_SOURCE (All tools allowed)
      return tools; 
    }

    if (state.phase === 'VERIFICATION_DOCUMENTATION' && state.ownerApprovalGranted) {
      // All tools allowed, similar to implementation for test generation/doc updates
      return tools;
    }

    // Filter the tools array
    return tools.filter(tool => {
      const name = tool.name || tool.function?.name;
      return allowedToolNames.has(name);
    });
  }

  /**
   * Layer 2: Execution Guard
   * Intercepts tool execution right before it happens.
   * Returns { allowed: true } or { allowed: false, reason: string }
   */
  static enforcePolicy(toolName: string, args: any, state: EngineeringState, rctx: RuntimeContext): { allowed: boolean; reason?: string } {
    // 1. Safe tools are always allowed
    const safeTools = ['view_file', 'list_dir', 'grep_search', 'command_status', 'send_command_input', 'run_command', 'search_web', 'read_url_content'];
    if (safeTools.includes(toolName)) {
      return { allowed: true };
    }

    // 2. Modifying tools require PROPOSAL, IMPLEMENTATION, or VERIFICATION
    const writeTools = ['write_to_file', 'replace_file_content', 'multi_replace_file_content'];
    if (writeTools.includes(toolName)) {
      
      if (state.phase === 'OBSERVE_ANALYZE') {
        const reason = `[DENY] Tool ${toolName} is not allowed in OBSERVE_ANALYZE phase.`;
        this.logDeny(rctx, state, toolName, args, reason);
        return { allowed: false, reason };
      }

      // 3. Path restriction for PROPOSAL phase
      if (state.phase === 'PROPOSAL') {
        // Find the target path (tools usually have TargetFile, AbsolutePath, or DirectoryPath)
        const targetPath = args.TargetFile || args.AbsolutePath || '';
        
        // Normalize backward slashes for cross-platform matching
        const normalizedPath = targetPath.replace(/\\/g, '/');
        
        // Use strict prefix checking (relative to workspace root)
        const isSafePath = normalizedPath.startsWith('docs/') || normalizedPath.startsWith('scratch/');
        
        if (!isSafePath) {
          const reason = `[DENY] Tool ${toolName} on path '${targetPath}' is denied during PROPOSAL phase. Only docs/ and scratch/ are allowed.`;
          this.logDeny(rctx, state, toolName, args, reason);
          return { allowed: false, reason };
        }
      }

      // IMPLEMENTATION or VERIFICATION_DOCUMENTATION allows all paths
      if ((state.phase === 'IMPLEMENTATION' || state.phase === 'VERIFICATION_DOCUMENTATION') && state.ownerApprovalGranted) {
        return { allowed: true };
      }
    }

    // Default catch-all deny if we missed something
    const reason = `[DENY] Tool ${toolName} blocked by Engineering Policy fallback. Phase: ${state.phase}.`;
    this.logDeny(rctx, state, toolName, args, reason);
    return { allowed: false, reason };
  }

  private static logDeny(rctx: RuntimeContext, state: EngineeringState, toolName: string, args: any, reason: string) {
    if (rctx && rctx.logger) {
      let targetResource = args.TargetFile || args.AbsolutePath || args.DirectoryPath || args.CommandLine || 'unknown';
      const metadata = {
        phase: state.phase,
        ownerApprovalGranted: state.ownerApprovalGranted,
        capability_group: 'WRITE', // simplified
        attempted_tool: toolName,
        target_resource: targetResource,
        reason: reason
      };
      rctx.logger.logAgentEvent('ENGINEERING_POLICY_DENY', 'system', JSON.stringify(metadata)).catch(e => console.error('[Log Error]', e));
    }
    
    eventBus.emit({
      type: 'EngineeringLifecycle.ViolationAttempt',
      source: 'EngineeringLifecycleManager',
      payload: {
        attemptedTool: toolName,
        currentState: state.phase,
        denyReason: 'LIFECYCLE_RESTRICTION'
      }
    });
  }
}
