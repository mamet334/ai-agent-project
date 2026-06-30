import { eventBus, MAEFEvent } from '../event_bus.ts';
import { persistEvidenceAuditLog, persistVerificationAuditLog, logVerificationReport, logVerificationAudit, persistTelemetryLog } from '../../verification/verification_service.ts';

export const registerAuditSubscribers = () => {
  eventBus.subscribe('Evidence.Evaluated', (event: MAEFEvent) => {
    const { rctx, evidenceReport, userId, appSource, brain1Ids, brain2Tasks, brain2Gaps, ragDocs, messagePreview, routingScope, workspaceId } = event.payload;
    if (rctx && rctx.tasks) {
      rctx.tasks.fire('EvidenceAuditLog', persistEvidenceAuditLog(rctx, {
        userId, appSource, evidenceReport, brain1Ids, brain2Tasks, brain2Gaps, ragDocs, messagePreview, routingScope, workspaceId
      }));
    }
  });

  eventBus.subscribe('Verification.Completed', (event: MAEFEvent) => {
    const { rctx, vReport, userId, auditRecord } = event.payload;
    
    logVerificationReport(vReport);
    logVerificationAudit(auditRecord);
    
    if (rctx && rctx.tasks) {
      rctx.tasks.fire('VerificationAuditLog', persistVerificationAuditLog(rctx, auditRecord, userId || null));
    }
  });

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
      }
  };

  eventBus.subscribe('Capability.Executed', (event: MAEFEvent) => {
      fireTelemetry(event, event.source || 'CapabilityRegistry', `Capability ${event.source} executed successfully.`);
  });

  eventBus.subscribe('Tool.Requested', (event: MAEFEvent) => {
      fireTelemetry(event, event.payload?.subagent || 'ToolSubscriber', `Tool execution requested for ${event.payload?.subagent}`);
  });

  eventBus.subscribe('Tool.Invoked', (event: MAEFEvent) => {
      fireTelemetry(event, event.payload?.subagent || 'ToolSubscriber', `Tool ${event.payload?.subagent} invoked.`);
  });

  eventBus.subscribe('Tool.Completed', (event: MAEFEvent) => {
      const status = event.payload?.status;
      fireTelemetry(event, event.payload?.subagent || 'ToolSubscriber', `Tool ${event.payload?.subagent} completed with status: ${status}`);
  });
};
