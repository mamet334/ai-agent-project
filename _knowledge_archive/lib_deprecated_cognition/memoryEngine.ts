import { supabase } from './supabaseClient';
import { MemoryNode } from '../types/memory';
import { recalculateTruthScores } from './truthScorer';
import { logTruthEvaluation } from './truthScoringEngine';
import { emitTelemetryEvent, resolveTraceId } from '../backend/telemetry';

export async function writeMemory(
  user_id: string,
  key: string,
  value: string,
  optional_truth_score?: number,
  traceIdInput?: string
): Promise<MemoryNode> {
  const traceId = resolveTraceId({ trace_id: traceIdInput });
  const startedAt = Date.now();

  await emitTelemetryEvent({
    eventType: 'Memory.Write.Start',
    traceId,
    message: 'Memory engine write started',
    metadata: { user_id, key, status: 'start' }
  });

  if (!key || key.trim() === '') throw new Error('Empty key is not allowed.');
  if (value === null || value === undefined) throw new Error('Null/undefined value is not allowed.');

  const semantic_identity = String(value).toLowerCase().trim();
  const initial_score = optional_truth_score !== undefined ? optional_truth_score : 0;

  if (optional_truth_score !== undefined) {
    logTruthEvaluation({ key, label: optional_truth_score >= 0.75 ? 'TRUSTED' : 'LATENT', truth_score: optional_truth_score });
  }

  // Insert raw memory first
  const { data: newRow, error: insertError } = await supabase
    .from('mamet_memory')
    .insert([{
      user_id,
      key,
      value: String(value),
      semantic_identity,
      confidence: 1.0,
      truth_score: initial_score
    }])
    .select()
    .single();

  if (insertError) {
    await emitTelemetryEvent({
      eventType: 'Memory.Write.Failed',
      traceId,
      message: 'Memory engine write insert failed',
      metadata: {
        user_id,
        key,
        status: 'failed',
        latency_ms: Date.now() - startedAt,
        error: insertError.message
      }
    });
    throw new Error(`Insert failed: ${insertError.message}`);
  }

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

  await emitTelemetryEvent({
    eventType: 'Memory.Write.End',
    traceId,
    message: 'Memory engine write completed',
    metadata: {
      user_id,
      key,
      status: 'success',
      latency_ms: Date.now() - startedAt
    }
  });

  return newRow as MemoryNode;
}

export async function readMemory(user_id: string, key: string, traceIdInput?: string) {
  const traceId = resolveTraceId({ trace_id: traceIdInput });
  const startedAt = Date.now();

  await emitTelemetryEvent({
    eventType: 'Memory.Read.Start',
    traceId,
    message: 'Memory engine read started',
    metadata: { user_id, key, status: 'start' }
  });

  const { data, error } = await supabase
    .from('mamet_memory')
    .select('*')
    .eq('user_id', user_id)
    .eq('key', key)
    .order('truth_score', { ascending: false });

  if (error) {
    await emitTelemetryEvent({
      eventType: 'Memory.Read.End',
      traceId,
      message: 'Memory engine read failed',
      metadata: {
        user_id,
        key,
        status: 'failed',
        latency_ms: Date.now() - startedAt,
        error: error.message
      }
    });
    throw new Error(`Read failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    await emitTelemetryEvent({
      eventType: 'Memory.Read.End',
      traceId,
      message: 'Memory engine read completed (empty)',
      metadata: {
        user_id,
        key,
        status: 'success',
        count: 0,
        latency_ms: Date.now() - startedAt
      }
    });
    return [];
  }

  await emitTelemetryEvent({
    eventType: 'Memory.Read.End',
    traceId,
    message: 'Memory engine read completed',
    metadata: {
      user_id,
      key,
      status: 'success',
      count: data.length,
      latency_ms: Date.now() - startedAt
    }
  });

  return data;
}

export async function overrideMemory(user_id: string, key: string, value: string, traceIdInput?: string) {
  // Override conceptually writes a new parallel truth node instead of destructive replace.
  // We use writeMemory which behaves as a version append + score recalculation.
  return writeMemory(user_id, key, value, undefined, traceIdInput);
}
