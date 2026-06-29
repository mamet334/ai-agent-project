import { SubAgentPlan, CoordinatorPlanParseResult, ContractValidationResult } from './types.ts';

export function parseCoordinatorPlan(planText: string): CoordinatorPlanParseResult {
  let plan: any[] = [];
  let healerTriggered = false;
  let cleanedText = planText.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    plan = JSON.parse(cleanedText);
  } catch (err) {
    healerTriggered = true;
    const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        plan = JSON.parse(jsonMatch[0].replace(/,\s*]/g, ']'));
      } catch(e) {
        return {
          plan: [],
          validation: { step: 'VALIDATION', status: 'REJECTED', reason_code: 'HEALER_FAILED', normalized_plan: [] },
          healerTriggered,
          error: 'JSON_REPAIR_FAILED'
        };
      }
    } else {
      return {
        plan: [],
        validation: { step: 'VALIDATION', status: 'REJECTED', reason_code: 'INVALID_JSON_FORMAT', normalized_plan: [] },
        healerTriggered,
        error: 'INVALID_JSON_FORMAT'
      };
    }
  }

  // --- MAMET HEALER: Fallback Layer ---
  if (plan && !Array.isArray(plan) && typeof plan === 'object') {
    healerTriggered = true;
    plan = [plan];
  }

  if (Array.isArray(plan)) {
    plan = plan.map(p => {
      let mutated = false;
      if (p && typeof p.task !== 'string') {
        p.task = typeof p.task === 'object' ? JSON.stringify(p.task) : String(p.task || "");
        mutated = true;
      }
      if (p && !p.subagent) {
        p.subagent = 'UNKNOWN';
        mutated = true;
      }
      if (mutated) healerTriggered = true;
      return p;
    });
  }

  // 🧱 STEP 1: EXECUTION CONTRACT LAYER
  let validation: ContractValidationResult = {
    step: "VALIDATION",
    status: "OK",
    reason_code: "PASSED",
    normalized_plan: plan
  };

  if (!Array.isArray(plan)) {
    validation = { step: "VALIDATION", status: "REJECTED", reason_code: "SCHEMA_VIOLATION: Root is not an array", normalized_plan: [] };
  } else {
    for (const p of plan) {
      if (!p || typeof p !== 'object' || !p.subagent || !p.task || p.subagent === 'UNKNOWN' || p.subagent.trim() === '') {
        validation = { step: "VALIDATION", status: "REJECTED", reason_code: `SCHEMA_VIOLATION: Missing or invalid subagent/task fields`, normalized_plan: [] };
        break;
      }
    }
  }

  return { plan: validation.status === 'OK' ? plan : [], validation, healerTriggered };
}
