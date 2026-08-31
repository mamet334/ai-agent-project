/**
 * RequestClassifierService — Linux-style Request Dispatcher (PR#8)
 *
 * Tanggung jawab tunggal: menerima pesan user + konteks → mengembalikan tipe request.
 *
 * Prinsip:
 * - Klasifikasi DETERMINISTIK — heuristik/regex, 0 LLM cost, 0 DB call
 * - Cepat — selesai dalam microseconds sebelum pipeline berat dimulai
 * - Boleh salah → CONVERSATION selalu aman sebagai fallback
 *
 * Tipe yang dikenali:
 * - ENGINEER     → workspace mode ENGINEER (ditentukan dari resolvedMode)
 * - COMMAND      → pesan command eksplisit (mulai /, keyword aksi filesystem)
 * - LOOKUP       → pertanyaan faktual singkat, tidak butuh memory/RAG
 * - CONVERSATION → default, alur penuh (perilaku saat ini)
 * - SKILL        → (slot disiapkan, belum diisi — menunggu Skill Implementation)
 *
 * Referensi: docs/roadmap/PR8-linux-style-dispatch.md
 */
export class RequestClassifierService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.isInitialized = false;

    // Kata tanya yang mengindikasikan pertanyaan faktual (LOOKUP)
    this._questionStarters = [
      'apa', 'siapa', 'kapan', 'dimana', 'di mana', 'berapa', 'kenapa', 'mengapa',
      'bagaimana', 'how', 'what', 'who', 'when', 'where', 'why', 'which', 'whose',
      'apakah', 'adakah', 'bolehkah', 'bisakah', 'dapatkah', 'is ', 'are ', 'was ',
      'were ', 'do ', 'does ', 'did ', 'can ', 'could ', 'would ', 'should '
    ];

    // Keyword eksplisit yang mengindikasikan COMMAND (aksi filesystem/sistem)
    this._commandKeywords = [
      'buat folder', 'buat file', 'hapus folder', 'hapus file', 'pindahkan',
      'rename', 'salin', 'copy', 'zip', 'unzip', 'jalankan script', 'run script',
      'execute', 'eksekusi', 'create folder', 'create file', 'delete folder',
      'delete file', 'move file', 'move folder'
    ];

    // Kata/frasa yang mengindikasikan pesan butuh konteks (bukan LOOKUP)
    this._contextDependentPatterns = [
      'tadi', 'sebelumnya', 'yang tadi', 'lanjut', 'lanjutkan', 'sambung',
      'teruskan', 'itu', 'ini', 'tersebut', 'yang kamu', 'yang aku',
      'continue', 'previous', 'above', 'earlier', 'last'
    ];

    // Referensi file/path (mengindikasikan task engineering, bukan LOOKUP)
    this._filePathPattern = /\.(js|jsx|ts|tsx|py|json|css|html|md|sql|sh|env)\b/i;
    this._pathPattern = /[/\\][\w/\\.-]+/;
  }

  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.eventBus.emit('RequestClassifier:Ready', { status: 'READY', timestamp: Date.now() });
    console.log('[RequestClassifierService] Initialized and Ready');
  }

  /**
   * Klasifikasi tipe request dari pesan user.
   *
   * @param {string} userMsg - pesan dari user
   * @param {Array}  history - riwayat pesan (array of {role, content})
   * @param {string} resolvedMode - 'ENGINEER' | 'LITE' | 'STANDARD'
   * @returns {{ type: string, confidence: number, metadata: Object }}
   */
  classify(userMsg = '', history = [], resolvedMode = 'STANDARD') {
    const msg = userMsg.trim();
    const msgLower = msg.toLowerCase();
    const msgLen = msg.length;

    // -----------------------------------------------------------------------
    // 1. ENGINEER — mode ditentukan dari workspace, bukan isi pesan
    // -----------------------------------------------------------------------
    if (resolvedMode === 'ENGINEER') {
      const result = { type: 'ENGINEER', confidence: 1.0, metadata: { resolvedMode } };
      this._emitClassified(result, msgLen);
      return result;
    }

    // -----------------------------------------------------------------------
    // 2. COMMAND — pesan command eksplisit
    // -----------------------------------------------------------------------
    if (msg.startsWith('/')) {
      const commandHint = msg.split(' ')[0];
      const result = { type: 'COMMAND', confidence: 0.95, metadata: { commandHint, isSlashCommand: true } };
      this._emitClassified(result, msgLen);
      return result;
    }

    const hasCommandKeyword = this._commandKeywords.some(kw => msgLower.includes(kw));
    if (hasCommandKeyword) {
      const matchedKw = this._commandKeywords.find(kw => msgLower.includes(kw));
      const result = { type: 'COMMAND', confidence: 0.9, metadata: { commandHint: matchedKw } };
      this._emitClassified(result, msgLen);
      return result;
    }

    // -----------------------------------------------------------------------
    // 3. SKILL — cocokkan trigger dengan skill yang terdaftar di SkillRegistry
    //    Dicek sebelum LOOKUP agar trigger eksplisit ("buat laporan harian")
    //    tidak salah diklasifikasi sebagai LOOKUP
    // -----------------------------------------------------------------------
    const skillRegistry = this.serviceManager.has('SkillRegistry')
      ? this.serviceManager.get('SkillRegistry')
      : null;
    const skillMatch = skillRegistry?.matchTrigger(msgLower);
    if (skillMatch) {
      const result = {
        type: 'SKILL',
        confidence: skillMatch.confidence,
        metadata: {
          skillId: skillMatch.skill.id,
          skillName: skillMatch.skill.name,
          matchedTrigger: skillMatch.matchedTrigger
        }
      };
      this._emitClassified(result, msgLen);
      return result;
    }

    // -----------------------------------------------------------------------
    // 4. LOOKUP — pertanyaan faktual singkat, tidak butuh memory/RAG
    //    Semua kondisi berikut harus terpenuhi:
    //    a) Panjang pesan ≤ 80 karakter
    //    b) Dimulai dengan kata tanya atau pola faktual
    //    c) Tidak ada referensi ke file/path
    //    d) Tidak ada pola konteks-dependen ("tadi", "lanjut", dll)
    //    e) History tidak dalam kondisi "percakapan aktif dalam" (≤ 2 pesan sebelumnya)
    // -----------------------------------------------------------------------
    if (msgLen <= 80) {
      const startsWithQuestion = this._questionStarters.some(starter =>
        msgLower.startsWith(starter)
      );

      const hasFilePath = this._filePathPattern.test(msg) || this._pathPattern.test(msg);

      const hasContextDependency = this._contextDependentPatterns.some(pattern =>
        msgLower.includes(pattern)
      );

      // History shallow: anggap "percakapan aktif" jika ada lebih dari 4 pesan
      // dan pesan terakhir dari assistant bukan pertanyaan/aksi balik
      const historyIsShallow = history.length <= 4;

      if (startsWithQuestion && !hasFilePath && !hasContextDependency && historyIsShallow) {
        const result = {
          type: 'LOOKUP',
          confidence: 0.8,
          metadata: { isFactual: true, msgLen, historyDepth: history.length }
        };
        this._emitClassified(result, msgLen);
        return result;
      }
    }

    // -----------------------------------------------------------------------
    // 5. CONVERSATION — default (alur penuh, perilaku existing)
    // -----------------------------------------------------------------------
    const result = {
      type: 'CONVERSATION',
      confidence: 1.0,
      metadata: { msgLen, historyDepth: history.length }
    };
    this._emitClassified(result, msgLen);
    return result;
  }

  /**
   * Emit event + log untuk setiap klasifikasi.
   * @private
   */
  _emitClassified({ type, confidence }, msgLen) {
    const preview = ''; // tidak log isi pesan untuk privasi
    console.log(`[RequestClassifier] → ${type} (confidence: ${confidence}, len: ${msgLen})`);
    this.eventBus.emit('RequestClassifier:Classified', {
      type,
      confidence,
      msgLen,
      timestamp: Date.now()
    });
  }
}

export default RequestClassifierService;
