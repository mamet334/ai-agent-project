import { RuntimeContext } from '../runtime_context.ts';
import { retrieveMemories } from '../../plugins/memory_manager_v1.ts';

export interface ProjectMemoryResult {
  memoryArray: any[];
  memoryPrompt: string;
}

export const loadProjectMemory = async (
  finalMessage: string,
  userId: string,
  globalMemory: string,
  canReadMemory: boolean,
  rctx: RuntimeContext,
  workspaceId?: string | null
): Promise<ProjectMemoryResult> => {
  let memoryArray: any[] = [];
  
  if (canReadMemory) {
    memoryArray = await retrieveMemories(
      finalMessage,
      userId,
      rctx.env.supabaseUrl,
      rctx.env.supabaseServiceKey,
      rctx,
      workspaceId
    );
  }
  
  if (!Array.isArray(memoryArray)) {
    memoryArray = [];
  }
  
  const memoryPrompt = globalMemory 
    ? `\n\n[MEMORI & KONTEKS SISTEM]:\n${globalMemory}\n(Gunakan konteks dan preferensi di atas secara relevan dan proporsional; jangan memaksakan preferensi personal ke pertanyaan informasi umum/berita.)` 
    : '';
  
  return { memoryArray, memoryPrompt };
};
