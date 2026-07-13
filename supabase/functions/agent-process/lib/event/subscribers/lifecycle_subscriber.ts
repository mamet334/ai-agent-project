import { eventBus, MAEFEvent } from '../event_bus.ts';
import { persistTelemetryLog } from '../../verification/verification_service.ts';

export const registerLifecycleSubscribers = () => {
  const fireTelemetry = (event: MAEFEvent, provider: string, message: string) => {
      const rctx = event.payload?.rctx;
      if (rctx && rctx.tasks) {
          const userId = event.payload?.userId || rctx.auth?.userId || null;
          rctx.tasks.fire('TelemetryLog', persistTelemetryLog(rctx, {
              userId,
              eventType: event.type,
              provider,
              message,
              metadata: { trace_id: event.trace_id, source: event.source, ...event.payload }
          }));
      } else {
          // Fallback console log for instances where rctx is not explicitly attached
          console.log(`[LIFECYCLE_TELEMETRY_FALLBACK] ${event.type}: ${message}`, event.payload);
      }
  };

  eventBus.subscribe('EngineeringLifecycle.PhaseChanged', (event: MAEFEvent) => {
    fireTelemetry(event, 'EngineeringLifecycleManager', `Phase changed from ${event.payload?.fromPhase} to ${event.payload?.toPhase}`);
  });

  eventBus.subscribe('EngineeringLifecycle.ViolationAttempt', (event: MAEFEvent) => {
    fireTelemetry(event, 'EngineeringLifecycleManager', `Violation attempt detected for tool ${event.payload?.attemptedTool} in phase ${event.payload?.currentState}`);
  });

  eventBus.subscribe('EngineeringLifecycle.ApprovalGranted', (event: MAEFEvent) => {
    fireTelemetry(event, 'EngineeringLifecycleManager', `Owner approval granted in phase IMPLEMENTATION`);
  });
};
