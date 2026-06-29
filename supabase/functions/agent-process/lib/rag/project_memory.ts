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
  rctx: RuntimeContext
): Promise<ProjectMemoryResult> => {
  let memoryArray: any[] = [];
  
  if (canReadMemory) {
    memoryArray = await retrieveMemories(
      finalMessage,
      userId,
      rctx.env.supabaseUrl,
      rctx.env.supabaseServiceKey
    );
  }
  
  if (!Array.isArray(memoryArray)) {
    memoryArray = [];
  }
  
  const memoryPrompt = globalMemory 
    ? `\n\n[MEMORI GLOBAL & PREFERENSI USER]:\n${globalMemory}\n(Patuhi instruksi/ingatan di atas secara ketat di setiap jawaban Anda!)` 
    : '';
  
  return { memoryArray, memoryPrompt };
};
