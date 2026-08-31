/**
 * SkillRegistry — Skill Loading & Trigger Matching (Skill Implementation)
 *
 * Tanggung jawab tunggal: memuat, memvalidasi, dan mengindeks semua skill
 * dari folder konvensi `frontend/src/skills/`.
 *
 * Prinsip:
 * - Trigger matching DETERMINISTIK — exact match dulu, fuzzy (includes) sebagai fallback
 * - 0 LLM cost saat matching
 * - Hanya skill dengan `active: true` yang diindeks
 * - Owner yang mendefinisikan skill — bukan AI yang memutuskan kapan pakai skill
 *
 * Referensi: docs/roadmap/teknis-skil-implementasi.md
 */

// Field wajib yang harus ada di setiap manifest skill
const REQUIRED_FIELDS = ['id', 'name', 'triggers', 'type', 'steps', 'active'];

// Tipe skill yang dikenal
const KNOWN_TYPES = ['conversation', 'generation', 'lookup'];

// Action yang valid per step
const KNOWN_ACTIONS = ['ask', 'generate', 'read', 'write'];

export class SkillRegistry {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.isInitialized = false;

    // Map<skillId, skillObject>
    this._skills = new Map();

    // Index trigger → skillId untuk lookup cepat
    // Map<triggerNormalized, skillId>
    this._triggerIndex = new Map();
  }

  async initialize() {
    if (this.isInitialized) return;

    // Scan semua file skill dari folder /skills/ via Vite's import.meta.glob
    // Menggunakan eager: true agar tidak perlu await per-file
    let skillModules = {};
    try {
      // Vite glob import — semua .json di folder skills/
      skillModules = import.meta.glob('/src/skills/*.json', { eager: true });
    } catch (e) {
      console.warn('[SkillRegistry] Gagal scan folder /skills/:', e.message);
    }

    let loaded = 0;
    let skipped = 0;

    for (const [path, module] of Object.entries(skillModules)) {
      // Skip .gitkeep dan non-JSON
      if (path.endsWith('.gitkeep')) continue;

      const skill = module?.default || module;

      // Validasi manifest
      const validation = this._validateManifest(skill, path);
      if (!validation.valid) {
        console.warn(`[SkillRegistry] Skill di ${path} ditolak: ${validation.reason}`);
        skipped++;
        continue;
      }

      // Skip jika inactive
      if (!skill.active) {
        console.log(`[SkillRegistry] Skill "${skill.id}" inactive — tidak diindeks`);
        skipped++;
        continue;
      }

      // Cek konflik ID
      if (this._skills.has(skill.id)) {
        console.warn(`[SkillRegistry] Konflik ID: "${skill.id}" sudah terdaftar — ${path} diabaikan`);
        skipped++;
        continue;
      }

      // Daftarkan skill
      this._skills.set(skill.id, skill);

      // Bangun trigger index
      for (const trigger of skill.triggers) {
        const normalized = trigger.toLowerCase().trim();
        this._triggerIndex.set(normalized, skill.id);
      }

      loaded++;
    }

    this.isInitialized = true;
    console.log(`[SkillRegistry] Initialized — ${loaded} skill aktif, ${skipped} dilewati`);

    this.eventBus.emit('SkillRegistry:Ready', {
      skillCount: loaded,
      skippedCount: skipped,
      skillIds: Array.from(this._skills.keys())
    });
  }

  /**
   * Cocokkan pesan user dengan trigger skill yang terdaftar.
   * Exact match diprioritaskan, fuzzy (includes) sebagai fallback.
   *
   * @param {string} userMsg
   * @returns {{ skill: Object, confidence: number, matchedTrigger: string } | null}
   */
  matchTrigger(userMsg = '') {
    if (!this.isInitialized || this._skills.size === 0) return null;

    const normalized = userMsg.toLowerCase().trim();

    // 1. Exact match
    const exactSkillId = this._triggerIndex.get(normalized);
    if (exactSkillId) {
      const skill = this._skills.get(exactSkillId);
      return { skill, confidence: 1.0, matchedTrigger: normalized };
    }

    // 2. Fuzzy match — cek apakah pesan mengandung trigger sebagai substring
    for (const [trigger, skillId] of this._triggerIndex.entries()) {
      if (normalized.includes(trigger)) {
        const skill = this._skills.get(skillId);
        return { skill, confidence: 0.75, matchedTrigger: trigger };
      }
    }

    return null;
  }

  /**
   * Ambil skill berdasarkan ID.
   * @param {string} skillId
   * @returns {Object|null}
   */
  getSkill(skillId) {
    return this._skills.get(skillId) || null;
  }

  /**
   * Daftar semua skill aktif.
   * @returns {Object[]}
   */
  list() {
    return Array.from(this._skills.values());
  }

  /**
   * Nonaktifkan skill (in-memory saja, tidak ubah file JSON).
   * Untuk menonaktifkan permanen, Owner harus edit `active: false` di file JSON.
   * @param {string} skillId
   */
  deactivate(skillId) {
    const skill = this._skills.get(skillId);
    if (!skill) return false;

    // Hapus dari maps
    this._skills.delete(skillId);
    for (const trigger of skill.triggers) {
      this._triggerIndex.delete(trigger.toLowerCase().trim());
    }

    this.eventBus.emit('SkillRegistry:Deactivated', { skillId });
    console.log(`[SkillRegistry] Skill "${skillId}" dinonaktifkan (in-memory)`);
    return true;
  }

  /**
   * Validasi manifest skill. Kembalikan { valid, reason }.
   * @private
   */
  _validateManifest(skill, path = '') {
    if (!skill || typeof skill !== 'object') {
      return { valid: false, reason: 'Bukan object JSON yang valid' };
    }

    // Cek field wajib
    for (const field of REQUIRED_FIELDS) {
      if (skill[field] === undefined || skill[field] === null) {
        return { valid: false, reason: `Field wajib "${field}" tidak ada` };
      }
    }

    // Cek tipe skill
    if (!KNOWN_TYPES.includes(skill.type)) {
      return { valid: false, reason: `Tipe skill tidak dikenal: "${skill.type}". Dikenal: ${KNOWN_TYPES.join(', ')}` };
    }

    // Cek triggers adalah array tidak kosong
    if (!Array.isArray(skill.triggers) || skill.triggers.length === 0) {
      return { valid: false, reason: '"triggers" harus berupa array tidak kosong' };
    }

    // Cek steps adalah array tidak kosong
    if (!Array.isArray(skill.steps) || skill.steps.length === 0) {
      return { valid: false, reason: '"steps" harus berupa array tidak kosong' };
    }

    // Cek batas maksimal step
    if (skill.steps.length > 10) {
      return { valid: false, reason: `Jumlah steps melebihi batas (${skill.steps.length} > 10)` };
    }

    // Validasi setiap step
    for (let i = 0; i < skill.steps.length; i++) {
      const step = skill.steps[i];
      if (!step.action) {
        return { valid: false, reason: `Step ${i + 1} tidak punya field "action"` };
      }
      if (!KNOWN_ACTIONS.includes(step.action)) {
        return { valid: false, reason: `Step ${i + 1} punya action tidak dikenal: "${step.action}". Dikenal: ${KNOWN_ACTIONS.join(', ')}` };
      }
      if (step.action === 'ask' && !step.prompt) {
        return { valid: false, reason: `Step ${i + 1} action "ask" harus punya field "prompt"` };
      }
      if (step.action === 'generate' && !step.prompt) {
        return { valid: false, reason: `Step ${i + 1} action "generate" harus punya field "prompt"` };
      }
    }

    return { valid: true, reason: '' };
  }
}

export default SkillRegistry;
