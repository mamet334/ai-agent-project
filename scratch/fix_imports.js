const fs = require('fs');
const file = 'supabase/functions/agent-process/index.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/import \{ validateEvidence, buildBlockedResponse \} from '\.\/lib\/verification\/evidence_validator\.ts';/, "import { buildBlockedResponse } from './lib/verification/evidence_validator.ts';");

content = content.replace(/import \{ PolicyEngine \} from '\.\/lib\/verification\/policy_engine\.ts';\r?\n/, "");
content = content.replace(/import \{ calculateConfidence \} from '\.\/lib\/verification\/confidence_engine\.ts';\r?\n/, "");
content = content.replace(/import \{ buildUniversalContract \} from '\.\/lib\/verification\/universal_contract\.ts';\r?\n/, "");
content = content.replace(/import \{ VerificationEngine \} from '\.\/lib\/verification_engine\.ts';\r?\n/, "");

const verifServiceRegex = /import \{\s*getActiveConflictsCount,\s*persistEvidenceAuditLog,\s*persistVerificationAuditLog,\s*logVerificationReport,\s*logVerificationAudit\s*\} from '\.\/lib\/verification\/verification_service\.ts';\r?\n/;
content = content.replace(verifServiceRegex, "import { executeVerificationPipeline } from './lib/verification/verification_pipeline.ts';\n");

fs.writeFileSync(file, content);
console.log('Success');
