import { eventBus, MAEFEvent } from '../event_bus.ts';
import { persistEvidenceAuditLog, persistVerificationAuditLog, logVerificationReport, logVerificationAudit } from '../../verification/verification_service.ts';

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
};
