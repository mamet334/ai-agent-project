import { readMemory } from '../../lib/memoryEngine';
import { resolveTraceId, emitTelemetryEvent } from '../../backend/telemetry';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const startedAt = Date.now();
  const trace_id = resolveTraceId({
    headers: req.headers,
    body: req.body,
    trace_id: req.query?.trace_id
  });

  try {
    const user_id = req.body?.user_id || req.query?.user_id;
    const key = req.body?.key || req.query?.key;

    await emitTelemetryEvent({
      eventType: 'Memory.Read.Start',
      traceId: trace_id,
      message: 'Memory read started',
      metadata: { trace_id, user_id: user_id || null, key: key || null, status: 'start' }
    });

    if (!user_id || !key) {
      await emitTelemetryEvent({
        eventType: 'Memory.Read.End',
        traceId: trace_id,
        message: 'Memory read validation failed',
        metadata: { trace_id, user_id: user_id || null, key: key || null, status: 'failed', latency_ms: Date.now() - startedAt }
      });
      return res.status(400).json({ error: 'Missing required fields', trace_id });
    }

    const result = await readMemory(user_id, key);

    await emitTelemetryEvent({
      eventType: 'Memory.Read.End',
      traceId: trace_id,
      message: 'Memory read completed',
      metadata: {
        trace_id,
        user_id,
        key,
        status: 'success',
        latency_ms: Date.now() - startedAt
      }
    });

    return res.status(200).json({ success: true, data: result, trace_id });
  } catch (err: any) {
    await emitTelemetryEvent({
      eventType: 'Memory.Read.End',
      traceId: trace_id,
      message: 'Memory read failed',
      metadata: {
        trace_id,
        status: 'failed',
        latency_ms: Date.now() - startedAt,
        error: err.message
      }
    });
    return res.status(500).json({ success: false, error: err.message, trace_id });
  }
}
