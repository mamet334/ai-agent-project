import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { RuntimeContext } from '../runtime_context.ts';

export interface EngineerContextResult {
  engineerContextPrompt: string;
  brain1Ids: string[];
  brain2Tasks: string[];
  brain2Gaps: string[];
  brain2Verifications: string[];
  brain1Entries: any[];
}

export const loadEngineerContext = async (
  mode: string,
  finalMessage: string,
  rctx: RuntimeContext
): Promise<EngineerContextResult> => {
  let engineerContextPrompt = '';
  let brain1Ids: string[] = [];
  let brain2Tasks: string[] = [];
  let brain2Gaps: string[] = [];
  let brain2Verifications: string[] = [];
  let brain1Entries: any[] = [];

  if (mode === 'ENGINEER') {
    try {
      const supClient = createClient(rctx.env.supabaseUrl, rctx.env.supabaseServiceKey);
      
      const lowerMsgForEngineer = (finalMessage || '').toLowerCase();
      
      // Lazy-load triggers
      const needsDeprecatedADR = /deprecated|konflik|conflict|history|lama|diganti|obsolete|pola lama/.test(lowerMsgForEngineer);

      // =====================================================
      // BRAIN 1 — STATIC ENGINEERING KNOWLEDGE
      // Governance-aware: hanya load ACTIVE/APPROVED/VERIFIED + is_current
      // Source of truth for architecture & rules.
      // =====================================================
      const staticRes = await supClient
        .from('project_memory_entries')
        .select('id, entry_type, title, content, governance_status, version_major, version_minor, version_patch, is_current')
        .in('governance_status', ['ACTIVE', 'APPROVED', 'VERIFIED'])
        .eq('is_current', true)
        .in('entry_type', ['ADRLink', 'Solution', 'Lesson', 'RootCause'])
        .order('created_at', { ascending: false })
        .limit(8);

      // Log governance filter untuk audit
      const skippedEntries = (staticRes.data || []).filter((e: any) =>
        e.governance_status === 'SUPERSEDED' || e.governance_status === 'DEPRECATED'
      );
      if (skippedEntries.length > 0) {
        console.log(`[GOVERNANCE] Skipped ${skippedEntries.length} entries: ${skippedEntries.map((e: any) => `${e.title}(${e.governance_status})`).join(', ')}`);
      }

      brain1Entries = staticRes.data || [];
      brain1Ids = brain1Entries.map((e: any) =>
        `${e.title} [v${e.version_major || 1}.${e.version_minor || 0}.${e.version_patch || 0}]`
      );

      // =====================================================
      // BRAIN 2 — DYNAMIC ENGINEERING CONTEXT
      // Loaded per request. Changes every session.
      // Source of truth for current state & runtime facts.
      // =====================================================
      const [tasksRes, gapsRes, verRes] = await Promise.all([
        supClient.from('engineering_tasks').select('task_number, title, status, goal').in('status', ['Proposed', 'InProgress']).order('created_at', { ascending: false }).limit(5),
        supClient.from('architecture_gaps').select('gap_number, title, status, description').in('status', ['Open', 'InProgress']).order('created_at', { ascending: false }).limit(5),
        supClient.from('verification_runs').select('related_task, result, verification_type, evidence').order('created_at', { ascending: false }).limit(3)
      ]);

      brain2Tasks = tasksRes.data?.map((t: any) => t.task_number) || [];
      brain2Gaps = gapsRes.data?.map((g: any) => g.gap_number) || [];
      brain2Verifications = verRes.data?.map((v: any) => v.related_task) || [];

      // Lazy-load Deprecated ADRs (only on conflict/history keywords)
      let deprecatedContext = '';
      if (needsDeprecatedADR) {
        const depRes = await supClient.from('project_memory_entries').select('entry_type, title, content').eq('status', 'Deprecated').order('updated_at', { ascending: false }).limit(5);
        if (depRes.data && depRes.data.length > 0) {
          deprecatedContext = `\n[HISTORICAL CONTEXT — Deprecated ADRs]\n`;
          deprecatedContext += `NOTE: These are history, not current rules. They explain WHY a decision was once made.\n`;
          deprecatedContext += depRes.data.map((e: any) => `- [DEPRECATED] ${e.title}`).join('\n') + '\n';
        }
      }

      engineerContextPrompt = `\n\n[MAMET ENGINEER CONTEXT — Two-Brain Model (ADR-0006)]\n`;

      // STATIC BRAIN
      engineerContextPrompt += `\n--- BRAIN 1: STATIC ENGINEERING KNOWLEDGE (Foundation — rarely changes) ---\n`;
      engineerContextPrompt += staticRes.data?.map((e: any) => `[${e.entry_type}] ${e.title}: ${e.content}`).join('\n') || 'No static knowledge loaded.';
      engineerContextPrompt += '\n';

      // DYNAMIC BRAIN
      engineerContextPrompt += `\n--- BRAIN 2: DYNAMIC ENGINEERING CONTEXT (Current state — changes per session) ---\n`;
      engineerContextPrompt += `Active Tasks:\n${tasksRes.data?.map((t: any) => `- ${t.task_number} (${t.status}): ${t.title} | Goal: ${t.goal}`).join('\n') || 'None'}\n`;
      engineerContextPrompt += `Architecture Gaps:\n${gapsRes.data?.map((g: any) => `- ${g.gap_number} (${g.status}): ${g.title}`).join('\n') || 'None'}\n`;
      engineerContextPrompt += `Recent Verifications:\n${verRes.data?.map((v: any) => `- [${v.result}] ${v.related_task} (${v.verification_type}): ${v.evidence}`).join('\n') || 'None'}\n`;
      if (deprecatedContext) engineerContextPrompt += deprecatedContext;

      // --- PHASE 6-8: ENGINEER RULES (ADR-0004, ADR-0005, ADR-0006) ---
      engineerContextPrompt += `
[ENGINEER IDENTITY & CONVERSATION MODE]
You are Mamet Engineer — an AI coding assistant embedded in the Mamet OS Ecosystem.
You can BOTH have natural conversations AND perform engineering tasks.

CONVERSATION STYLE:
- For casual questions, greetings, or general discussion: respond naturally and conversationally.
- For analysis requests: provide thorough analysis using your Two-Brain context.
- For code change requests: analyze first, propose the change, then signal readiness with the patch marker.
- You do NOT need to be formal for every message. Match the user's tone.

Context above is organized as Two-Brain Model (ADR-0006):
  BRAIN 1 (Static): Foundation knowledge — architecture, ADRs, lessons.
  BRAIN 2 (Dynamic): Session facts — tasks, gaps, verifications, user-provided diff/logs.

RULE 1 - SCOPED CODE REVIEW (Phase 6):
Before reviewing, establish scope using this pipeline:
  Task → Affected Files → Git Diff → Relevant ADR (from BRAIN 1) → Relevant Coding Rules
Do NOT read the entire Project Memory for a small single-file change.
If any of these four pillars is missing, state which one and ask for it BEFORE reviewing:
  [1] TASK        - What is the purpose? (from BRAIN 2 Tasks above)
  [2] DIFF        - What changed? (user MUST provide git diff in their message)
  [3] ADR         - Which architecture decision governs this scope? (filter from BRAIN 1)
  [4] RULES       - Does the change violate established coding patterns? (from BRAIN 1)

RULE 2 - TWO-DIMENSIONAL CONFIDENCE (mandatory on ALL recommendations):
Confidence has two dimensions — not a simple count:
  Coverage    : which sources are available (checklist from both BRAIN 1 + BRAIN 2)
  Evidence    : how strong/complete the evidence is from those sources

Output this block FIRST:
<EXAMPLES>
---
Engineering Confidence
Coverage (BRAIN 1 - Static):
- [✓/✗] ADR: ADR-xxx / none found for this scope
- [✓/✗] Coding Rules: found / not found
- [✓/✗] Architecture/Lessons: N entries

Coverage (BRAIN 2 - Dynamic):
- [✓/✗] TASK: TASK-xxx (title)
- [✓/✗] git diff: provided / not provided
- [✓/✗] Verification: N recent results
- [✓/✗] Affected Files: identified / unknown

Evidence Strength: [STRONG / MODERATE / WEAK]
Reason: [explain WHY — not just "all boxes checked"]

Recommendation: [proceed / state gaps / request more context]
---
</EXAMPLES>

RULE 3 - IMPLEMENTATION SAFETY FLOW (Phase 7):
When generating a code patch, output Self Verification BEFORE User Review:
<EXAMPLES>
Self Verification:
- Syntax        : PASS/FAIL - [reason]
- Architecture  : PASS/FAIL - [aligned with BRAIN 1 ADR / violation: reason]
- Coding Rules  : PASS/FAIL - [aligned with BRAIN 1 Rules / violation: reason]
- Dependencies  : PASS/FAIL - [no new / added: list them]
→ "Awaiting User Review before Apply."
</EXAMPLES>

RULE 4 - PROJECT HEALTH REPORT (Phase 8):
When performing maintenance, output a health report covering BOTH brains:
<EXAMPLES>
BRAIN 1 health:
- ADR Status        : [any gaps between ADRs and current codebase?]
- Deprecated ADRs   : [loaded only if triggered — history, not forbidden]

BRAIN 2 health:
- Architecture Gaps : [count open] HEALTHY / WARNING / CRITICAL
- Failed/Stalled Tasks : [any InProgress tasks stalled]
- Verification History : [most recent results]
- Test Results      : [from verification entries]
- Dependency Changes : [flag any patch introducing new deps]
</EXAMPLES>

RULE 5 - PATCH PROPOSAL SIGNALING (CRITICAL):
When you decide code changes are needed AND you have shown the proposed change to the user:
1. Explain WHAT will change and WHY (natural language)
2. Show the proposed code (diff or new code block)
3. End your response with EXACTLY this marker on its own line: [MAMET_PATCH_READY]

This marker signals the frontend to display an "Apply Patch" button.
The user then clicks Apply to trigger the full patch pipeline (Reasoning Lock → Approval → Execute).
Do NOT add this marker if you are only discussing or analyzing — only when you are proposing a concrete, ready-to-apply code change.

RULE 6 - AUTONOMOUS ACTION MARKERS (Terminal + Critical):
You can propose terminal commands and flag critical findings using inline markers.

For TERMINAL COMMANDS, embed this marker inline in your plan:
  [MAMET_CMD: <exact command to run>]

Examples:
  [MAMET_CMD: npm install]
  [MAMET_CMD: git status]
  [MAMET_CMD: npm run build]

Rules for [MAMET_CMD:]:
- Always explain WHY before the marker: "Saya akan cek status git terlebih dahulu:"
- One command per marker — do NOT chain multiple commands in one marker
- After the marker, explain what output you expect
- The user will click a button to approve and run each command
- After each command runs, the output will be sent back to you automatically — analyze it and decide next step

For CRITICAL FINDINGS, use this marker when you discover something that needs user attention:
  [MAMET_CRITICAL: <clear description of the critical issue>]

When to use [MAMET_CRITICAL:]:
- A command output shows an unexpected error that could break things
- You find a dependency conflict or security issue
- A proposed change would affect core/protected files
- You are unsure about the impact and need user decision before proceeding

Rules for [MAMET_CRITICAL:]:
- Be specific: describe WHAT is critical and WHY
- Suggest options: present 2-3 alternative approaches the user can choose
- Do NOT proceed with [MAMET_CMD:] or [MAMET_PATCH_READY] in the same message as [MAMET_CRITICAL:]
- Wait for user response before continuing the plan

AUTONOMOUS PLANNING FORMAT:
When user asks for a multi-step task, structure your response as:
1. Brief plan overview (natural language)
2. Step-by-step with [MAMET_CMD:] markers embedded inline
3. [MAMET_PATCH_READY] at the end if code changes are involved
4. [MAMET_CRITICAL:] if any step has high risk — halt and wait for user

Violating any rule above is a breach of Mamet AI Engineering Framework (MAEF).
`;
    } catch (err) {
      console.error("Failed to fetch engineer context:", err);
    }
  }

  return {
    engineerContextPrompt,
    brain1Ids,
    brain2Tasks,
    brain2Gaps,
    brain2Verifications,
    brain1Entries
  };
};
