import { supabase } from './supabaseClient';
import { MemoryNode } from '../types/memory';
import { recalculateTruthScores } from './truthScorer';

export async function writeMemory(user_id: string, key: string, value: string): Promise<MemoryNode> {
  if (!key || key.trim() === '') throw new Error("Empty key is not allowed.");
  if (value === null || value === undefined) throw new Error("Null/undefined value is not allowed.");
  
  const semantic_identity = String(value).toLowerCase().trim();

  // Insert raw memory first
  const { data: newRow, error: insertError } = await supabase
    .from('mamet_memory')
    .insert([{
       user_id,
       key,
       value: String(value),
       semantic_identity,
       confidence: 1.0,
       truth_score: 0 // placeholder before calc
    }])
    .select()
    .single();

  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

  // Recalculate scores for all nodes of this key
  const { data: allNodes, error: fetchError } = await supabase
    .from('mamet_memory')
    .select('*')
    .eq('user_id', user_id)
    .eq('key', key);

  if (!fetchError && allNodes) {
    recalculateTruthScores(allNodes);
    // Batch update scores
    for (const node of allNodes) {
      await supabase.from('mamet_memory').update({ truth_score: node.truth_score }).eq('id', node.id);
    }
  }

  return newRow as MemoryNode;
}

export async function readMemory(user_id: string, key: string) {
  const { data, error } = await supabase
    .from('mamet_memory')
    .select('*')
    .eq('user_id', user_id)
    .eq('key', key)
    .order('truth_score', { ascending: false });

  if (error) throw new Error(`Read failed: ${error.message}`);
  
  if (!data || data.length === 0) return { active: null, latent: [] };

  return {
    active: data[0],
    latent: data.slice(1)
  };
}

export async function overrideMemory(user_id: string, key: string, value: string) {
  // Override conceptually writes a new parallel truth node instead of destructive replace.
  // We use writeMemory which behaves as a version append + score recalculation.
  return writeMemory(user_id, key, value);
}
