import { MAEFPhase, MAEFStateSnapshot, MAEFStep } from './maef_contract.ts';

export class MAEFStateMachine {
  private snapshot: MAEFStateSnapshot;
  private allowedNextPhases: Set<MAEFPhase>;

  private validTransitions: Record<MAEFPhase, MAEFPhase[]> = {
    'INIT': ['CONTEXT_BUILD'],
    'CONTEXT_BUILD': ['ORCHESTRATION', 'POST_PROCESSING', 'COMPLETED'],
    'ORCHESTRATION': ['TOOL_EXECUTION', 'POST_PROCESSING'],
    'TOOL_EXECUTION': ['POST_PROCESSING'],
    'POST_PROCESSING': ['STREAMING_READY', 'COMPLETED'],
    'STREAMING_READY': ['COMPLETED'],
    'COMPLETED': []
  };

  constructor() {
    this.snapshot = {
      phase: 'INIT',
      steps: []
    };
    // Bootstrap initialization step
    this.snapshot.steps.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
      phase: 'INIT',
      description: 'Engine Initialization',
      timestamp: Date.now()
    });
    
    // By default, the engine assumes a full lifecycle until instructed otherwise.
    this.allowedNextPhases = new Set(['CONTEXT_BUILD', 'ORCHESTRATION', 'TOOL_EXECUTION', 'POST_PROCESSING', 'STREAMING_READY', 'COMPLETED']);
  }

  // --- CONTROL PLANE: Lifecycle Decision Authority ---
  public evaluatePhaseResult(phase: MAEFPhase, result: any): void {
    if (phase === 'CONTEXT_BUILD') {
       if (result.isChatBiasa) {
           // Chat Biasa skips Orchestration and Tool Execution
           this.allowedNextPhases.delete('ORCHESTRATION');
           this.allowedNextPhases.delete('TOOL_EXECUTION');
       }
    }
  }

  public shouldExecutePhase(phase: MAEFPhase): boolean {
    return this.allowedNextPhases.has(phase);
  }

  // --- CONTROL PLANE: State Transitions ---
  public requestTransition(newPhase: MAEFPhase, description: string): void {
    const currentPhase = this.snapshot.phase;
    
    if (!this.validTransitions[currentPhase].includes(newPhase)) {
      throw new Error(`[MAEF Control Plane] Invalid state transition requested: ${currentPhase} -> ${newPhase}`);
    }

    if (!this.allowedNextPhases.has(newPhase)) {
      throw new Error(`[MAEF Control Plane] Execution of ${newPhase} has been blocked by lifecycle logic.`);
    }

    this.snapshot.phase = newPhase;
    this.snapshot.steps.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
      phase: newPhase,
      description,
      timestamp: Date.now()
    });
  }

  public updateState(updates: Partial<MAEFStateSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...updates };
  }

  public getSnapshot(): MAEFStateSnapshot {
    return { ...this.snapshot, steps: [...this.snapshot.steps] };
  }
}
