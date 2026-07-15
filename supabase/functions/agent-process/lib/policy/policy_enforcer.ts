export type PolicyDecision = 'ALLOW' | 'DENY' | 'ALLOW_WITH_LIMIT';
export type WorkspaceType = 'ws-lite' | 'ws-assistant' | 'ws-engineer';
export type MemoryType = 'essential_memory' | 'preference_memory' | 'engineering_memory' | 'architecture_memory' | 'audit_memory' | 'personal_memory' | 'general_memory';
export type RagScope = 'all' | 'essential_only' | 'engineering_only' | 'personal_only';

export class PolicyEnforcer {
  public static validateWorkspace(workspaceId: string): WorkspaceType {
    if (workspaceId === 'ws-lite' || workspaceId === 'ws-assistant' || workspaceId === 'ws-engineer') {
      return workspaceId as WorkspaceType;
    }
    return 'ws-assistant';
  }

  public static canReadMemory(workspace: string, memory_type: MemoryType): PolicyDecision {
    const ws = this.validateWorkspace(workspace);
    if (ws === 'ws-assistant' || ws === 'ws-engineer') return 'ALLOW';
    
    // ws-lite
    if (memory_type === 'essential_memory') return 'ALLOW';
    return 'ALLOW_WITH_LIMIT';
  }

  public static canWriteMemory(workspace: string, memory_type: MemoryType): PolicyDecision {
    const ws = this.validateWorkspace(workspace);
    if (ws === 'ws-assistant') return 'ALLOW';
    
    if (ws === 'ws-lite') {
      if (memory_type === 'essential_memory' || memory_type === 'preference_memory') return 'ALLOW_WITH_LIMIT';
      return 'DENY';
    }
    
    if (ws === 'ws-engineer') {
      if (['engineering_memory', 'architecture_memory', 'audit_memory'].includes(memory_type)) {
        return 'ALLOW';
      }
      return 'DENY';
    }
    return 'DENY';
  }

  public static canUseTool(workspace: string, tool_name: string): PolicyDecision {
    const ws = this.validateWorkspace(workspace);
    if (ws === 'ws-assistant') return 'ALLOW';
    
    if (ws === 'ws-lite') {
      const minimalTools = ['web_search', 'get_current_time', 'weather', 'calculator'];
      if (minimalTools.includes(tool_name)) return 'ALLOW';
      return 'DENY';
    }
    
    if (ws === 'ws-engineer') {
      const restrictedFromEngineer = ['social_media_poster', 'casual_chat_agent'];
      if (restrictedFromEngineer.includes(tool_name)) return 'DENY';
      return 'ALLOW'; // Engineer has access to engineer tools like shell, fs, git, etc.
    }
    return 'DENY';
  }

  public static canAccessRag(workspace: string, rag_scope: RagScope): PolicyDecision {
    const ws = this.validateWorkspace(workspace);
    if (ws === 'ws-assistant' || ws === 'ws-engineer') return 'ALLOW';
    if (ws === 'ws-lite') return rag_scope === 'essential_only' ? 'ALLOW' : 'ALLOW_WITH_LIMIT';
    return 'DENY';
  }

  public static canSpawnSubAgent(workspace: string, agent_name: string): PolicyDecision {
    const ws = this.validateWorkspace(workspace);
    if (ws === 'ws-assistant') return 'ALLOW';
    
    if (ws === 'ws-engineer') {
      const engineeringAgents = ['database_explorer', 'code_reviewer', 'shell_executor', 'file_analyzer'];
      if (engineeringAgents.includes(agent_name)) return 'ALLOW';
      return 'DENY';
    }
    
    // ws-lite cannot spawn complex sub agents
    return 'DENY';
  }
}
