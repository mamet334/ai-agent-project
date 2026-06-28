/**
 * Knowledge Health Monitor — Mamet AI Knowledge OS Phase 2 (Priority 10)
 * ========================================================================
 * API endpoint untuk dashboard kesehatan knowledge.
 *
 * GET /knowledge-health → return health report JSON
 *
 * Response:
 * {
 *   health_score: 87,
 *   active_knowledge: 28,
 *   deprecated: 4,
 *   open_conflicts: 1,
 *   orphan_knowledge: 6,
 *   missing_verification: 2,
 *   version_status: { current: 25, outdated: 3 },
 *   recommendations: [...]
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    const { data: { user }, error: authError } = await authSupabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const userId = user.id;
    const results: Record<string, any> = {};

    // ── 1. Knowledge Governance Status ──
    const { data: govData } = await supabase
      .from('project_memory_entries')
      .select('governance_status, is_current, entry_type, version_major, version_minor, version_patch')
      .eq('user_id', userId);

    const entries = govData || [];

    const statusCounts: Record<string, number> = {};
    let currentCount = 0;
    let outdatedCount = 0;

    for (const e of entries) {
      const gs = e.governance_status || 'ACTIVE';
      statusCounts[gs] = (statusCounts[gs] || 0) + 1;
      if (e.is_current === true) currentCount++;
      else if (e.is_current === false) outdatedCount++;
    }

    results.governance = {
      total: entries.length,
      by_status: statusCounts,
      active: statusCounts['ACTIVE'] || 0,
      draft: statusCounts['DRAFT'] || 0,
      review: statusCounts['REVIEW'] || 0,
      deprecated: statusCounts['DEPRECATED'] || 0,
      superseded: statusCounts['SUPERSEDED'] || 0,
      archived: statusCounts['ARCHIVED'] || 0,
    };

    results.versions = {
      current: currentCount,
      outdated: outdatedCount,
    };

    // ── 2. Knowledge Conflicts ──
    const { data: conflictsData } = await supabase
      .from('knowledge_conflicts')
      .select('resolution_status, severity')
      .eq('entry_a_id', userId); // simplified - should join via user

    const conflicts = conflictsData || [];
    const openConflicts = conflicts.filter(c => c.resolution_status === 'OPEN').length;
    const criticalConflicts = conflicts.filter(c => c.severity === 'CRITICAL' && c.resolution_status === 'OPEN').length;

    results.conflicts = {
      total: conflicts.length,
      open: openConflicts,
      critical: criticalConflicts,
      resolved: conflicts.filter(c => c.resolution_status === 'RESOLVED').length,
    };

    // ── 3. Knowledge Relationships (Graph coverage) ──
    const { data: relData } = await supabase
      .from('knowledge_relationships')
      .select('from_id, to_id, relation_type')
      .limit(500);

    const rels = relData || [];
    const connectedIds = new Set<string>();
    for (const r of rels) {
      connectedIds.add(r.from_id);
      connectedIds.add(r.to_id);
    }

    const activeEntryIds = entries
      .filter(e => e.governance_status === 'ACTIVE' || e.governance_status === 'APPROVED')
      .map((e: any) => e.id)
      .filter(Boolean);

    const orphanCount = activeEntryIds.filter((id: string) => !connectedIds.has(id)).length;

    results.graph = {
      total_relationships: rels.length,
      connected_entries: connectedIds.size,
      orphan_entries: orphanCount,
    };

    // ── 4. Engineering Tasks & Verification ──
    const { data: tasksData } = await supabase
      .from('engineering_tasks')
      .select('status')
      .eq('user_id', userId);

    const tasks = tasksData || [];
    results.tasks = {
      total: tasks.length,
      proposed: tasks.filter(t => t.status === 'Proposed').length,
      in_progress: tasks.filter(t => t.status === 'InProgress').length,
      done: tasks.filter(t => t.status === 'Done').length,
    };

    const { data: verData } = await supabase
      .from('verification_runs')
      .select('result')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    const vers = verData || [];
    results.verifications = {
      total: vers.length,
      pass: vers.filter(v => v.result === 'PASS').length,
      fail: vers.filter(v => v.result === 'FAIL').length,
      pending: vers.filter(v => v.result === 'PENDING').length,
    };

    // ── 5. Evidence Audit Summary (last 7 days) ──
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: auditData } = await supabase
      .from('evidence_audit_logs')
      .select('verdict, llm_called, mode')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo);

    const audits = auditData || [];
    results.evidence_audit_7d = {
      total_requests: audits.length,
      passed: audits.filter(a => a.verdict === 'PASSED').length,
      blocked: audits.filter(a => a.verdict === 'BLOCKED').length,
      warned: audits.filter(a => a.verdict === 'WARNING').length,
      llm_called: audits.filter(a => a.llm_called).length,
      by_mode: {
        engineer: audits.filter(a => a.mode === 'ENGINEER').length,
        ai: audits.filter(a => a.mode === 'AI').length,
        lite: audits.filter(a => a.mode === 'LITE').length,
      }
    };

    // ── 6. Health Score Calculation ──
    let healthScore = 100;
    healthScore -= openConflicts * 10;
    healthScore -= criticalConflicts * 10; // double penalty for critical
    healthScore -= orphanCount * 5;
    healthScore -= (statusCounts['DRAFT'] || 0) * 2;
    healthScore += Math.min((statusCounts['ACTIVE'] || 0) * 2, 20);
    healthScore = Math.max(0, Math.min(100, healthScore));

    const healthGrade =
      healthScore >= 90 ? 'A' :
      healthScore >= 75 ? 'B' :
      healthScore >= 60 ? 'C' :
      healthScore >= 45 ? 'D' : 'F';

    // ── 7. Recommendations ──
    const recommendations: string[] = [];

    if (openConflicts > 0) {
      recommendations.push(`[KRITIS] ${openConflicts} konflik knowledge masih OPEN — selesaikan di knowledge_conflicts table`);
    }
    if (orphanCount > 3) {
      recommendations.push(`[SEDANG] ${orphanCount} knowledge entries tidak terhubung ke graph — tambahkan knowledge_relationships`);
    }
    if ((statusCounts['DRAFT'] || 0) > 0) {
      recommendations.push(`[INFO] ${statusCounts['DRAFT']} knowledge masih DRAFT — lanjutkan ke REVIEW atau hapus jika tidak relevan`);
    }
    if (outdatedCount > 0) {
      recommendations.push(`[SEDANG] ${outdatedCount} knowledge entries bukan versi terkini (is_current=FALSE)`);
    }
    if (results.verifications.fail > 0) {
      recommendations.push(`[KRITIS] ${results.verifications.fail} verifikasi GAGAL — perbaiki task terkait`);
    }
    if (results.tasks.in_progress > 5) {
      recommendations.push(`[INFO] ${results.tasks.in_progress} task sedang InProgress — pertimbangkan untuk menyelesaikan yang terlama`);
    }
    if (recommendations.length === 0) {
      recommendations.push('[OK] Knowledge base dalam kondisi sehat. Tidak ada aksi yang diperlukan saat ini.');
    }

    // ── FINAL RESPONSE ──
    const response = {
      health_score: healthScore,
      health_grade: healthGrade,
      health_label:
        healthScore >= 90 ? 'Sangat Sehat' :
        healthScore >= 75 ? 'Sehat' :
        healthScore >= 60 ? 'Perlu Perhatian' :
        healthScore >= 45 ? 'Kritis' : 'Darurat',
      generated_at: new Date().toISOString(),
      user_id: userId,
      summary: results,
      recommendations,
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[KNOWLEDGE_HEALTH] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
