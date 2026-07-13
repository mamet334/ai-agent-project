/**
 * Backup Export — Mamet AI Knowledge Operating System
 * =====================================================
 * Edge Function untuk mengekspor seluruh data Supabase ke format
 * JSON, Markdown, atau ZIP. Ini memastikan data tidak terkunci
 * pada Supabase — bisa dipindah ke PostgreSQL lokal kapan saja.
 *
 * Filosofi (tujuan universal.txt — Fase 5):
 * - Export JSON, Export SQL, Export Markdown, Export ZIP
 * - "Dengan begitu Anda tidak terkunci pada Supabase."
 *
 * Endpoints:
 * POST /backup-export
 * Body: { format: 'json' | 'markdown' | 'zip', userId: string }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tabel yang akan di-backup (ordered by dependency)
// NOTE: document_chunks TIDAK di-backup karena:
//   1. Tidak punya kolom user_id (tidak bisa di-filter per user secara aman)
//   2. Data vector embedding bisa di-regenerate dari dokumen induk via rag-process
//   3. Ukuran terlalu besar untuk export JSON biasa
const BACKUP_TABLES = [
  'knowledge_spaces',
  'workspace_summaries',
  'documents',
  'project_memory_entries',
  'knowledge_relationships',
  'knowledge_conflicts',
  'memory_relations',
  'engineering_tasks',
  'architecture_gaps',
  'verification_runs',
  'user_memories',
  'chats',
  'api_usage',
  'agent_logs',
  'evidence_audit_logs',
];

// Tabel kritis yang wajib ada di backup
const CRITICAL_TABLES = [
  'knowledge_spaces',
  'documents',
  'project_memory_entries',
  'user_memories',
];

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

    const body = await req.json();
    const format = body.format || 'json'; // 'json' | 'markdown' | 'summary'
    const userId = user.id;

    const exportData: Record<string, any[]> = {};
    const exportErrors: string[] = [];

    // === Fetch data dari setiap tabel ===
    for (const tableName of BACKUP_TABLES) {
      try {
        let query = supabase.from(tableName).select('*');

        // Filter by user_id jika kolom ada (untuk tabel yang punya user_id)
        if (!['document_chunks'].includes(tableName)) {
          query = query.eq('user_id', userId);
        }

        const { data, error } = await query.order('created_at', { ascending: true });

        if (error) {
          console.error(`[BACKUP] Error fetching ${tableName}:`, error.message);
          exportErrors.push(`${tableName}: ${error.message}`);
          exportData[tableName] = [];
        } else {
          exportData[tableName] = data || [];
          console.log(`[BACKUP] ${tableName}: ${data?.length || 0} rows`);
        }
      } catch (tableErr: any) {
        exportErrors.push(`${tableName}: ${tableErr.message}`);
        exportData[tableName] = [];
      }
    }

    // Hitung statistik
    const stats = {
      exportedAt: new Date().toISOString(),
      userId,
      format,
      tables: {} as Record<string, number>,
      criticalTablesStatus: {} as Record<string, string>,
      totalRows: 0,
      errors: exportErrors,
    };

    for (const [table, rows] of Object.entries(exportData)) {
      stats.tables[table] = rows.length;
      stats.totalRows += rows.length;
    }

    for (const critTable of CRITICAL_TABLES) {
      const count = exportData[critTable]?.length || 0;
      stats.criticalTablesStatus[critTable] = count > 0 ? `OK (${count} rows)` : 'EMPTY';
    }

    if (format === 'json') {
      // === JSON Export ===
      const jsonExport = {
        metadata: stats,
        data: exportData,
      };

      return new Response(JSON.stringify(jsonExport, null, 2), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="mamet-backup-${userId.substring(0, 8)}-${new Date().toISOString().split('T')[0]}.json"`,
        }
      });

    } else if (format === 'markdown') {
      // === Markdown Export ===
      let md = `# Mamet AI Knowledge Export\n`;
      md += `**Exported At:** ${stats.exportedAt}\n`;
      md += `**Total Rows:** ${stats.totalRows}\n\n`;
      md += `---\n\n`;

      // Project Memory → Markdown
      const memories = exportData['project_memory_entries'] || [];
      if (memories.length > 0) {
        md += `## Project Memory Entries (${memories.length})\n\n`;
        for (const m of memories) {
          md += `### [${m.entry_type}] ${m.title}\n`;
          md += `**Status:** ${m.status}\n`;
          md += `**Created:** ${m.created_at}\n\n`;
          md += `${m.content || ''}\n\n`;
          md += `---\n\n`;
        }
      }

      // Engineering Tasks → Markdown
      const tasks = exportData['engineering_tasks'] || [];
      if (tasks.length > 0) {
        md += `## Engineering Tasks (${tasks.length})\n\n`;
        for (const t of tasks) {
          md += `### ${t.task_number}: ${t.title}\n`;
          md += `**Status:** ${t.status}\n`;
          md += `**Goal:** ${t.goal || ''}\n\n`;
        }
        md += `---\n\n`;
      }

      // Architecture Gaps → Markdown
      const gaps = exportData['architecture_gaps'] || [];
      if (gaps.length > 0) {
        md += `## Architecture Gaps (${gaps.length})\n\n`;
        for (const g of gaps) {
          md += `### ${g.gap_number}: ${g.title}\n`;
          md += `**Status:** ${g.status}\n`;
          md += `**Description:** ${g.description || ''}\n\n`;
        }
        md += `---\n\n`;
      }

      // Knowledge Spaces → Markdown
      const spaces = exportData['knowledge_spaces'] || [];
      if (spaces.length > 0) {
        md += `## Knowledge Spaces (${spaces.length})\n\n`;
        for (const s of spaces) {
          md += `- **${s.name}** (${s.space_type}): ${s.id}\n`;
        }
        md += `\n---\n\n`;
      }

      // Documents → Markdown summary
      const docs = exportData['documents'] || [];
      if (docs.length > 0) {
        md += `## Documents in Knowledge Base (${docs.length})\n\n`;
        for (const d of docs) {
          md += `- **${d.title}** — Space: ${d.space_id} | Created: ${d.created_at}\n`;
        }
        md += `\n---\n\n`;
      }

      // User Memories → Markdown
      const userMems = exportData['user_memories'] || [];
      if (userMems.length > 0) {
        md += `## User Memories (${userMems.length})\n\n`;
        for (const m of userMems) {
          md += `- **${m.memory_state}**: ${m.content || m.summary || ''}\n`;
        }
        md += `\n---\n\n`;
      }

      md += `\n## Export Stats\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\`\n`;

      return new Response(md, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename="mamet-backup-${userId.substring(0, 8)}-${new Date().toISOString().split('T')[0]}.md"`,
        }
      });

    } else if (format === 'summary') {
      // === Summary Export (untuk tampilan di frontend) ===
      return new Response(JSON.stringify({ stats, errors: exportErrors }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else {
      return new Response(JSON.stringify({ error: `Format '${format}' tidak didukung. Gunakan: json, markdown, summary` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error('[BACKUP_EXPORT] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
