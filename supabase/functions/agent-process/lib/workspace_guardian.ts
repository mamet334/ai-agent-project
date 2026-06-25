export type WorkspaceTarget = 'AUTO' | 'SUPABASE' | 'LOCAL';

export interface GuardianState {
  workspaceTarget: WorkspaceTarget;
  localWorkspaceEnabled: boolean;
  message: string;
}

export class WorkspaceGuardian {
  private state: GuardianState;

  constructor(state: GuardianState) {
    this.state = state;
  }

  // 1. Otoritas penentuan target
  public determineTarget(): 'SUPABASE' | 'LOCAL' {
    if (this.state.workspaceTarget === 'SUPABASE') return 'SUPABASE';
    if (this.state.workspaceTarget === 'LOCAL' && this.state.localWorkspaceEnabled) return 'LOCAL';
    
    // Logika AUTO
    if (this.state.localWorkspaceEnabled) {
      if (/knowledge workspace|knowledge space|rag|arsip cloud/i.test(this.state.message)) {
        return 'SUPABASE';
      }
      if (/desktop|folder|directory|hardisk|local file|lokal/i.test(this.state.message)) {
        return 'LOCAL';
      }
      return 'LOCAL'; // Default fallback ke lokal jika izin aktif
    }

    return 'SUPABASE'; // Fallback pamungkas
  }

  // 2. Proteksi tool (Mencegah LLM salah pilih)
  public filterTools(tools: string[], target: 'SUPABASE' | 'LOCAL'): string[] {
    let safeTools = [...(tools || [])];
    if (target === 'SUPABASE') {
      safeTools = safeTools.filter(t => t !== 'file_analyzer');
      if (!safeTools.includes('knowledge_manager')) safeTools.push('knowledge_manager');
    } else if (target === 'LOCAL') {
      safeTools = safeTools.filter(t => t !== 'knowledge_manager');
      if (!safeTools.includes('file_analyzer')) safeTools.push('file_analyzer');
    }
    return safeTools;
  }

  // 3. Otoritas Prompt LLM (Instruksi Mutlak)
  public getGuardianPrompt(target: 'SUPABASE' | 'LOCAL'): string {
    if (target === 'SUPABASE') {
      return `\n[WORKSPACE GUARDIAN: SUPABASE LOCKED] Anda DILARANG menggunakan tool file_analyzer. Seluruh operasi CRUD Folder/Workspace WAJIB diarahkan ke knowledge_manager (Cloud RAG).`;
    }
    return `\n[WORKSPACE GUARDIAN: LOCAL LOCKED] Anda DILARANG menggunakan tool knowledge_manager. Seluruh operasi CRUD Direktori/File WAJIB diarahkan ke file_analyzer atau tag <terminal>.`;
  }
}
