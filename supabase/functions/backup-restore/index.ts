/**
 * Backup Restore — Mamet AI Knowledge Operating System
 * ======================================================
 * Edge Function untuk merestore data dari backup JSON.
 * Data yang direstore akan divalidasi terlebih dahulu.
 *
 * Filosofi (tujuan universal.txt — Fase 5):
 * - "Restore JSON, Restore SQL, Restore ZIP"
 * - "Kalau suatu saat pindah ke PostgreSQL lokal, data tetap aman."
 *
 * Endpoints:
 * POST /backup-restore
 * Body: { backup: <JSON dari backup-export>, mode: 'dry_run' | 'restore', tables?: string[] }
 *
 * PENTING: mode 'dry_run' hanya validasi tanpa menyimpan.
 *          mode 'restore' benar-benar menyimpan ke DB.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Urutan restore (sesuai dependency)
// NOTE: document_chunks tidak di-restore karena tidak di-backup.
// Re-embed dokumen via rag-process endpoint setelah restore selesai.
const RESTORE_ORDER = [
  'knowledge_spaces',
  'documents',
  'project_memory_entries',
  'engineering_tasks',
  'architecture_gaps',
  'verification_runs',
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
    const backup = body.backup;
    const mode = body.mode || 'dry_run'; // 'dry_run' | 'restore'
    const tablesToRestore: string[] = body.tables || RESTORE_ORDER;

    // === VALIDASI BACKUP ===
    if (!backup || !backup.metadata || !backup.data) {
      return new Response(JSON.stringify({
        error: 'Format backup tidak valid. Harus punya fields: metadata, data'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pastikan backup dari user yang sama
    const backupUserId = backup.metadata.userId;
    if (backupUserId !== user.id) {
      return new Response(JSON.stringify({
        error: `Backup dari user lain (${backupUserId}). Anda hanya bisa restore backup milik Anda sendiri.`
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: Record<string, { status: string; rowsProcessed: number; errors: string[] }> = {};
    let totalRestored = 0;
    let totalErrors = 0;

    // === PROSES RESTORE PER TABEL ===
    for (const tableName of tablesToRestore) {
      const tableData = backup.data[tableName];

      if (!tableData || !Array.isArray(tableData)) {
        results[tableName] = { status: 'SKIPPED', rowsProcessed: 0, errors: ['No data in backup'] };
        continue;
      }

      if (tableData.length === 0) {
        results[tableName] = { status: 'EMPTY', rowsProcessed: 0, errors: [] };
        continue;
      }

      const tableErrors: string[] = [];
      let rowsProcessed = 0;

      if (mode === 'dry_run') {
        // Dry run: validasi saja
        results[tableName] = {
          status: 'DRY_RUN_OK',
          rowsProcessed: tableData.length,
          errors: []
        };
        continue;
      }

      // === RESTORE MODE ===
      // Proses per batch untuk menghindari timeout
      const BATCH_SIZE = 50;

      for (let i = 0; i < tableData.length; i += BATCH_SIZE) {
        const batch = tableData.slice(i, i + BATCH_SIZE).map((row: any) => {
          const cleanRow = { ...row };
          // Pastikan user_id tetap milik user yang merestore
          if (cleanRow.user_id) cleanRow.user_id = user.id;
          return cleanRow;
        });

        try {
          const { error: insertError } = await supabase
            .from(tableName)
            .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

          if (insertError) {
            tableErrors.push(`Batch ${i}-${i + BATCH_SIZE}: ${insertError.message}`);
            totalErrors++;
          } else {
            rowsProcessed += batch.length;
            totalRestored += batch.length;
          }
        } catch (batchErr: any) {
          tableErrors.push(`Batch ${i}-${i + BATCH_SIZE}: ${batchErr.message}`);
          totalErrors++;
        }

        // Delay kecil antar batch untuk rate limit
        if (i + BATCH_SIZE < tableData.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      results[tableName] = {
        status: tableErrors.length === 0 ? 'RESTORED' : 'PARTIAL',
        rowsProcessed,
        errors: tableErrors,
      };
    }

    const response = {
      success: totalErrors === 0,
      mode,
      summary: {
        totalRestored,
        totalErrors,
        tablesProcessed: Object.keys(results).length,
        backupDate: backup.metadata.exportedAt,
        restoreDate: new Date().toISOString(),
      },
      tables: results,
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[BACKUP_RESTORE] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
