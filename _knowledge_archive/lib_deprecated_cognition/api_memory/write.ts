import { writeMemory } from '../../lib/memoryEngine';
import { resolveTraceId, emitTelemetryEvent } from '../../backend/telemetry';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const startedAt = Date.now();
  const trace_id = resolveTraceId({
    headers: req.headers,
    body: req.body
  });

  try {
    const { user_id, key, value } = req.body;

    await emitTelemetryEvent({
      eventType: 'Memory.Write.Start',
      traceId: trace_id,
      message: 'Memory write started',
      metadata: {
        trace_id,
        user_id: user_id || null,
        key: key || null,
        status: 'start'
      }
    });

    if (!user_id || !key || value === undefined) {
      await emitTelemetryEvent({
        eventType: 'Memory.Write.Failed',
        traceId: trace_id,
        message: 'Memory write validation failed',
        metadata: {
          trace_id,
          user_id: user_id || null,
          key: key || null,
          status: 'failed',
          latency_ms: Date.now() - startedAt
        }
      });
      return res.status(400).json({ error: 'Missing required fields', trace_id });
    }

    const result = await writeMemory(user_id, key, value);

    await emitTelemetryEvent({
      eventType: 'Memory.Write.End',
      traceId: trace_id,
      message: 'Memory write completed',
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
      eventType: 'Memory.Write.Failed',
      traceId: trace_id,
      message: 'Memory write failed',
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
