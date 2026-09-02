/**
 * AuditLogService.js — Audit Trail untuk Aksi AI (PR#1)
 *
 * Menyimpan log narasi terstruktur setiap aksi AI ke Supabase.
 * Format log: naratif (bisa "dimengerti" oleh AI masa depan), bukan sekadar baris teknis.
 *
 * Wajib log:
 * - Semua aksi di luar workspace
 * - Semua aksi destruktif (delete/overwrite)
 *
 * Opsional (ringkas saja):
 * - Operasi read-only (list/scan)
 *
 * Fase awal: log kronologis — BUKAN semantic search/embedding dulu.
 * Peningkatan ke semantic search hanya setelah pola pemakaian nyata terlihat.
 */

import { supabase } from '../../../supabase.js';

export class AuditLogService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this._initialized = false;
    this._tableName = 'assistant_audit_log';
  }

  async initialize() {
    this._initialized = true;
    console.log('[AuditLogService] Initialized');
  }

  // =============================================
  // CORE: Log satu entri aksi
  // =============================================

  /**
   * Catat satu entri aksi ke audit log.
   *
   * @param {Object} entry
   * @param {string} entry.requestedBy      - pesan user yang memicu aksi
   * @param {string} entry.aiDecision       - alasan AI memilih aksi ini
   * @param {Object} entry.action           - { command, targetPath, timestamp }
   * @param {Object} entry.result           - { success: bool, output: string, reason?: string }
   * @param {Object} entry.securityStatus   - { inWorkspace: bool, destructive: bool }
   * @param {string} [entry.userId]         - user ID dari Supabase session
   */
  async log(entry) {
    if (!this._initialized) return;

    const logEntry = {
      requested_by:   entry.requestedBy   || '',
      ai_decision:    entry.aiDecision    || '',
      command:        entry.action?.command    || '',
      target_path:    entry.action?.targetPath || '',
      executed_at:    entry.action?.timestamp  || new Date().toISOString(),
      result_success: entry.result?.success    ?? false,
      result_output:  (entry.result?.output    || '').substring(0, 1000), // cap 1000 char
      result_reason:  entry.result?.reason     || '',
      in_workspace:   entry.securityStatus?.inWorkspace  ?? true,
      is_destructive: entry.securityStatus?.destructive  ?? false,
      user_id:        entry.userId || null,
      logged_at:      new Date().toISOString()
    };

    // Log ke konsol selalu (observasi awal)
    console.log('[AuditLog]', logEntry);

    // Simpan ke Supabase hanya untuk aksi wajib-log
    const mustLog = logEntry.is_destructive || !logEntry.in_workspace;
    if (!mustLog) return; // Read-only ringan tidak wajib disimpan

    try {
      const { error } = await supabase.from(this._tableName).insert(logEntry);
      if (error) {
        // Jika tabel belum ada, log ke konsol saja — jangan throw
        console.warn('[AuditLogService] Supabase insert gagal (tabel mungkin belum dibuat):', error.message);
      }
    } catch (err) {
      console.warn('[AuditLogService] Log gagal disimpan:', err.message);
    }
  }

  // =============================================
  // SHORTCUT: Log command execution
  // =============================================

  /**
   * Shortcut untuk mencatat eksekusi command dari AssistantService.
   *
   * @param {Object} params
   * @param {string} params.userMsg      - pesan user yang memicu command
   * @param {string} params.commandName  - nama command (dari CommandRegistry)
   * @param {string} params.targetPath   - path target
   * @param {boolean} params.inWorkspace - apakah path di dalam workspace
   * @param {boolean} params.isDestructive - apakah command destruktif
   * @param {boolean} params.success     - apakah berhasil
   * @param {string}  params.output      - output/error
   * @param {string}  [params.userId]
   */
  async logCommand({ userMsg, commandName, targetPath, inWorkspace, isDestructive, success, output, userId }) {
    await this.log({
      requestedBy: userMsg,
      aiDecision: `AI menjalankan command "${commandName}" pada path "${targetPath}"`,
      action: {
        command: commandName,
        targetPath,
        timestamp: new Date().toISOString()
      },
      result: {
        success,
        output,
        reason: success ? 'Command berhasil dieksekusi.' : 'Command gagal atau ditolak.'
      },
      securityStatus: {
        inWorkspace,
        destructive: isDestructive
      },
      userId
    });
  }

  // =============================================
  // QUERY: Baca log terbaru (untuk UI/debug)
  // =============================================

  /**
   * Ambil log terbaru dari Supabase.
   * @param {number} [limit=20]
   * @param {string} [userId]
   * @returns {Promise<Array>}
   */
  async getRecentLogs(limit = 20, userId = null) {
    try {
      let query = supabase
        .from(this._tableName)
        .select('*')
        .order('logged_at', { ascending: false })
        .limit(limit);

      if (userId) query = query.eq('user_id', userId);

      const { data, error } = await query;
      if (error) {
        console.warn('[AuditLogService] getRecentLogs gagal:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('[AuditLogService] getRecentLogs error:', err.message);
      return [];
    }
  }
}
