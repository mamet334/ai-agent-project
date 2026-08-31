/**
 * SkillGuardService — Validasi Keamanan Skill (Skill Implementation)
 *
 * Tanggung jawab tunggal: validasi struktural skill sebelum dieksekusi.
 *
 * Catatan desain:
 * - Bukan sandbox runtime — skill dibuat Owner sendiri, bukan pihak ketiga
 * - Cukup validasi struktural (field ada, action dikenal, tidak melebihi batas)
 * - Action yang butuh aksi berdampak ('write') → REQUIRE_CONFIRMATION via CommandRegistry (PR#1)
 * - Action tidak dikenal → DENY (tidak dieksekusi, pesan error ke Owner)
 *
 * Referensi: docs/roadmap/teknis-skil-implementasi.md
 */

// Policy per action
const ACTION_POLICY = {
  ask:      'ALLOW',                // Tanya ke Owner — selalu aman
  generate: 'ALLOW',               // Generate teks ke chat — selalu aman
  read:     'ALLOW',               // Baca file — tidak mengubah apa pun
  write:    'REQUIRE_CONFIRMATION', // Tulis/modif file — butuh konfirmasi (PR#1)
};

export class SkillGuardService {
  constructor(serviceManager) {
    this.serviceManager = serviceManager;
    this.eventBus = serviceManager.get('EventBus');
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('[SkillGuardService] Initialized');
    this.eventBus.emit('SkillGuard:Ready', { status: 'READY' });
  }

  /**
   * Validasi skill sebelum dieksekusi.
   *
   * @param {Object} skill - Skill object dari SkillRegistry
   * @returns {{ allowed: boolean, reason: string, stepPolicies: Object[] }}
   */
  validate(skill) {
    if (!skill) {
      return { allowed: false, reason: 'Skill tidak ditemukan', stepPolicies: [] };
    }

    // 1. Cek skill aktif
    if (!skill.active) {
      return { allowed: false, reason: `Skill "${skill.id}" tidak aktif`, stepPolicies: [] };
    }

    // 2. Evaluasi policy tiap step
    const stepPolicies = [];
    for (let i = 0; i < skill.steps.length; i++) {
      const step = skill.steps[i];
      const policy = ACTION_POLICY[step.action];

      if (!policy) {
        // Action tidak dikenal → DENY seluruh skill
        return {
          allowed: false,
          reason: `Step ${i + 1} punya action tidak dikenal: "${step.action}"`,
          stepPolicies
        };
      }

      stepPolicies.push({
        step: i + 1,
        action: step.action,
        policy
      });
    }

    // 3. Cek apakah ada step REQUIRE_CONFIRMATION
    const hasConfirmationStep = stepPolicies.some(s => s.policy === 'REQUIRE_CONFIRMATION');

    return {
      allowed: true,
      reason: '',
      stepPolicies,
      hasConfirmationStep
    };
  }

  /**
   * Ambil policy untuk satu action.
   * @param {string} action
   * @returns {'ALLOW' | 'REQUIRE_CONFIRMATION' | 'DENY'}
   */
  getActionPolicy(action) {
    return ACTION_POLICY[action] || 'DENY';
  }
}

export default SkillGuardService;
