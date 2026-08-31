# Changelog: Skill Implementation

Tanggal: 2026-08-31
Status: Selesai Diimplementasikan
Branch: `main`
Commit: `fe6e74c` — feat(SkillImpl): Skill Implementation — SkillRegistry + SkillGuardService + SkillHandler

---

## Ringkasan Eksekutif

Skill Implementation menambahkan kemampuan baru: Owner bisa mendefinisikan **prosedur
kerja terstruktur** yang dipanggil via trigger kata kunci dan dieksekusi secara konsisten
setiap kali dipanggil — mirip script/binary yang dipanggil by name di Linux.

Sebelumnya, permintaan seperti "buat laporan harian" ditangani ad-hoc oleh LLM —
hasilnya inkonsisten. Setelah Skill Implementation, permintaan itu memicu prosedur
terdefinisi: tanya langkah 1 → tanya langkah 2 → generate output — setiap kali sama.

Alur lengkap setelah semua PR (PR#8 + Skill Implementation):

```
User: "buat laporan harian"
         ↓
RequestClassifierService.classify()
  → matchTrigger("buat laporan harian") di SkillRegistry → HIT
  → type: SKILL (confidence: 1.0)
         ↓
processMessage() dispatch → _handleSkill()
  → SkillGuardService.validate() → ALLOW
  → eksekusi Step 1: ask "Apa yang sudah dikerjakan?"
  → Owner menjawab
  → eksekusi Step 2: ask "Ada hambatan?"
  → Owner menjawab
  → eksekusi Step 3: ask "Rencana besok?"
  → Owner menjawab
  → eksekusi Step 4: generate → laporan markdown ke chat
         ↓
AuditLogService.log({ type: 'SKILL_EXECUTED', ... })
```

---

## File yang Dibuat / Dimodifikasi

| File | Aksi | Keterangan |
|---|---|---|
| `frontend/src/skills/.gitkeep` | **DIBUAT** | Placeholder folder konvensi skill |
| `frontend/src/skills/daily-report.json` | **DIBUAT** | Contoh skill bawaan — laporan harian |
| `frontend/src/core/runtime/services/SkillRegistry.js` | **DIBUAT** | Scan, matchTrigger, validasi manifest |
| `frontend/src/core/runtime/services/SkillGuardService.js` | **DIBUAT** | Validasi keamanan, action policy |
| `frontend/src/core/runtime/Kernel.js` | Dimodifikasi | Import + registrasi SkillRegistry & SkillGuardService |
| `frontend/src/core/runtime/services/AssistantService.js` | Dimodifikasi | `_handleSkill()`, `_resolveAIProvider()`, dispatch SKILL |
| `frontend/src/core/runtime/services/RequestClassifierService.js` | Dimodifikasi | Slot SKILL diisi — matchTrigger via SkillRegistry |

---

## Detail Perubahan

### 1. Format Manifest Skill (`frontend/src/skills/*.json`)

Setiap skill adalah satu file JSON dengan struktur:

```json
{
  "id": "daily-report",
  "name": "Buat Laporan Harian",
  "version": "1.0.0",
  "triggers": ["buat laporan harian", "laporan hari ini", "daily report"],
  "type": "conversation",
  "steps": [
    { "order": 1, "action": "ask", "prompt": "..." },
    { "order": 4, "action": "generate", "prompt": "..." }
  ],
  "active": true,
  "author": "owner"
}
```

**Field wajib:** `id`, `name`, `triggers`, `type`, `steps`, `active`

**Tipe skill:** `conversation` | `generation` | `lookup`

**Action yang didukung:**
| Action | Policy | Keterangan |
|---|---|---|
| `ask` | ALLOW | Tanya ke Owner, tunggu jawaban |
| `generate` | ALLOW | Generate teks via LLM |
| `read` | ALLOW | Baca file (stub — belum penuh) |
| `write` | REQUIRE_CONFIRMATION | Tulis file — butuh konfirmasi PR#1 |

**Contoh skill bawaan:** `daily-report.json` — 4 langkah (3x ask + 1x generate)

---

### 2. `SkillRegistry.js` (BARU)

**Scan saat boot:**
- Menggunakan `import.meta.glob('/src/skills/*.json', { eager: true })` — Vite resolution
- Log hasil: `[SkillRegistry] Initialized — N skill aktif, N dilewati`

**Validasi manifest (cek sebelum skill diindeks):**
- Field wajib lengkap
- `type` masuk KNOWN_TYPES
- `triggers` array tidak kosong
- `steps` array tidak kosong, maks 10 step
- Setiap step punya `action` yang dikenal
- Step `ask`/`generate` wajib punya `prompt`

**Trigger matching algorithm (deterministik, 0 LLM):**
1. Normalisasi pesan: `toLowerCase().trim()`
2. Exact match ke `_triggerIndex` → confidence: 1.0
3. Fuzzy match (`includes`) ke semua trigger → confidence: 0.75
4. Return `null` jika tidak ada match

**EventBus events:**
```
SkillRegistry:Ready       → { skillCount, skippedCount, skillIds }
SkillRegistry:Deactivated → { skillId }
```

---

### 3. `SkillGuardService.js` (BARU)

**Validasi sebelum eksekusi:**
```javascript
guard.validate(skill)
// → { allowed: true, stepPolicies: [...], hasConfirmationStep: false }
// → { allowed: false, reason: "Step 2 punya action tidak dikenal: 'exec'" }
```

**Policy per action:**
```
ask      → ALLOW
generate → ALLOW
read     → ALLOW
write    → REQUIRE_CONFIRMATION
unknown  → DENY (validate() return allowed: false)
```

**EventBus events:**
```
SkillGuard:Ready → { status: 'READY' }
```

---

### 4. `Kernel.js` — Urutan Registrasi Phase 3

Urutan Phase 3 setelah semua PR (PR#1–PR#8 + Skill Implementation):

```
AssistantService
CommandRegistry
AuditLogService
RetrievalStrategyService
ModuleDiscoveryService
SkillRegistry          ← BARU
SkillGuardService      ← BARU
RequestClassifierService
AdapterRegistry
```

> `SkillRegistry` HARUS sebelum `RequestClassifierService` agar `classify()` bisa
> memanggil `skillRegistry.matchTrigger()` saat pertama kali dijalankan.

---

### 5. `AssistantService.js` — Method Baru

#### `_handleSkill({ skill, ... })`
Multi-step skill execution:

1. Validasi via `SkillGuardService.validate(skill)` — jika DENY, kirim pesan error ke Owner
2. Loop steps berurutan:
   - **ask (step pertama):** Kirim prompt ke Owner sebagai pesan AI, emit `Skill:AwaitingAnswer`, return
     *(multi-turn skill dilanjutkan di pesan berikutnya via history)*
   - **ask (step berikutnya):** Ambil jawaban dari history terakhir, accumulate ke `skillContext.answers`
   - **generate:** Bangun prompt dari `skillContext.answers`, kirim ke Edge Function, stream response
   - **write:** Emit pesan konfirmasi (REQUIRE_CONFIRMATION), tunggu CommandRegistry
   - **read:** Stub — log path, accumulate ke context
3. Emit `Skill:Completed` + log ke `AuditLogService`

**EventBus events yang diemit:**
```
Skill:Started        → { skillId, skillName }
Skill:StepDone       → { skillId, step, action }
Skill:AwaitingAnswer → { skillId, stepIndex, remainingSteps }
Skill:Completed      → { skillId, totalSteps, duration }
Skill:Error          → { skillId, step, reason }
```

#### `_resolveAIProvider()` — Helper shared
Menghilangkan duplikasi kode resolve AI provider (sebelumnya ditulis 3x di
`_handleLookup`, `_handleConversation`, dan sekarang `_handleSkill`).

---

### 6. `RequestClassifierService.js` — Slot SKILL Diisi

Sebelum pengecekan LOOKUP, tambahkan matchTrigger:

```javascript
const skillMatch = skillRegistry?.matchTrigger(msgLower);
if (skillMatch) {
  return { type: 'SKILL', confidence: skillMatch.confidence, metadata: { skillId, ... } };
}
```

SKILL dicek **sebelum** LOOKUP agar trigger eksplisit seperti "buat laporan harian"
tidak salah dikategorikan sebagai LOOKUP (walaupun panjangnya ≤80 char).

---

## Log Console yang Diharapkan Saat Runtime

**Saat boot:**
```
[SkillRegistry] Initialized — 1 skill aktif, 0 dilewati
[SkillGuard:Ready] { status: 'READY' }
[RequestClassifierService] Initialized and Ready
```

**Saat user kirim "buat laporan harian":**
```
[RequestClassifier] → SKILL (confidence: 1.0, len: 18)
[AssistantService] Skill → _handleSkill("daily-report")
[SkillHandler] Step 1/4: action=ask
Skill:AwaitingAnswer { skillId: 'daily-report', stepIndex: 0, remainingSteps: [...] }
```

---

## Catatan untuk AI Berikutnya

- **Skill multi-turn belum penuh** — saat ini skill berhenti di step `ask` pertama dan
  menunggu Owner menjawab. Kelanjutan multi-turn (step 2, 3, dst) masih manual via
  context history. Untuk membuat multi-turn fully automatic, perlu state persistence
  (simpan `skillContext` ke SessionStorage atau EventBus state antar pesan).
- **`read` action masih stub** — perlu integrasi ke `RepositoryReaderService` atau
  `VaultService` untuk membaca file sungguhan.
- **Cara tambah skill baru:** Buat file JSON baru di `frontend/src/skills/` sesuai
  format manifest. Skill langsung aktif setelah Vercel deploy berikutnya.
- **Nonaktifkan skill:** Set `"active": false` di file JSON skill yang bersangkutan.
  Atau panggil `skillRegistry.deactivate(skillId)` secara programatik (in-memory saja).
- **Urutan roadmap setelah ini:** `SystemGovernorService` (`SPESIFIKASI-TEKNIS-MAMET-OS-v2.md`)
  adalah item besar berikutnya yang belum dikerjakan — independen, bisa dimulai kapan saja.
