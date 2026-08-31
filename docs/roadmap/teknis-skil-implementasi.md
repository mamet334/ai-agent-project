# Spesifikasi Teknis: Skill Implementation

Status: Draft — Siap Dikerjakan (menunggu approval Owner)
Owner: Mamet AI Project
Scope: Assistant Capability — Skill Loading & Execution System
Prinsip Payung: Linux-Inspired Architecture — "Ringan, Bebas, dan Tangguh seperti Linux"
Tanggal Disusun: 2026-08-31
Prasyarat: PR#8 (RequestClassifierService) — selesai 2026-08-31

---

## 0. Latar Belakang & Masalah

Saat ini, kemampuan Mamet AI bersifat **generik** — tidak ada cara untuk Owner
mendefinisikan prosedur kerja spesifik yang bisa dipanggil secara konsisten.
Contoh kebutuhan nyata yang belum bisa dipenuhi:

- "Setiap kali aku bilang *review kode ini*, lakukan langkah A → B → C"
- "Setiap kali aku bilang *buat laporan harian*, ikuti format X dengan data Y"
- "Setiap kali aku bilang *debug masalah ini*, tanya dulu tentang P, Q, R"

Tanpa sistem Skill, setiap permintaan tersebut ditangani secara ad-hoc oleh LLM —
hasilnya inkonsisten tergantung context window dan mood model.

**Skill** adalah prosedur terstruktur yang didefinisikan oleh Owner, dipanggil lewat
trigger (kata kunci atau pola kalimat), dan dieksekusi secara konsisten setiap kali
dipanggil — mirip fungsi/script yang dipanggil by name di Linux.

---

## 0.1 Analogi Linux

```
Skill di Mamet AI  ≈  Script/binary di Linux
SkillRegistry      ≈  $PATH (tempat sistem mencari command yang tersedia)
SkillGuardService  ≈  Permission bits (rwx) + sudo validation
SkillHandler       ≈  exec() — jalankan prosedur yang sudah tervalidasi
RequestClassifier  ≈  Shell parser — kenali apakah input adalah command yang dikenal
```

---

## 0.2 Prinsip Owner Sovereignty dalam Skill

Sesuai prinsip yang berlaku lintas semua PR di proyek ini:
- **Owner yang mendefinisikan** skill — bukan AI yang memutuskan sendiri kapan pakai skill
- **Owner yang mengaktifkan/menonaktifkan** skill secara eksplisit
- **Tidak ada skill yang jalan otomatis** tanpa trigger eksplisit dari Owner
- Skill yang mengandung aksi berdampak (write file, send request) **tetap butuh konfirmasi**
  sesuai PR#1 (Safe Command Execution)

---

## 1. Komponen yang Akan Dibuat

### 1.1 Format Skill (Manifest)

Setiap skill adalah **satu file JSON** di folder konvensi `frontend/src/skills/` dengan
struktur berikut:

```json
{
  "id": "daily-report",
  "name": "Buat Laporan Harian",
  "version": "1.0.0",
  "description": "Prosedur membuat laporan harian kerja Owner",
  "triggers": [
    "buat laporan harian",
    "laporan hari ini",
    "daily report"
  ],
  "type": "conversation",
  "steps": [
    {
      "order": 1,
      "action": "ask",
      "prompt": "Apa yang sudah dikerjakan hari ini?"
    },
    {
      "order": 2,
      "action": "ask",
      "prompt": "Ada hambatan atau blocker?"
    },
    {
      "order": 3,
      "action": "generate",
      "prompt": "Buat laporan harian berdasarkan jawaban di atas dengan format markdown"
    }
  ],
  "active": true,
  "createdAt": "2026-08-31",
  "author": "owner"
}
```

**Field wajib:** `id`, `name`, `triggers`, `type`, `steps`, `active`

**Tipe skill:**
| Tipe | Deskripsi |
|---|---|
| `conversation` | Prosedur dialog multi-step dengan Owner |
| `generation` | Generate output berdasarkan prompt dan context |
| `lookup` | Pencarian/query ringan, tanpa memory/RAG |

---

### 1.2 `SkillRegistry` (baru)

**File:** `frontend/src/core/runtime/services/SkillRegistry.js`
**Didaftarkan di:** `Kernel.js` Phase 3, sebelum `RequestClassifierService`

**Tanggung jawab:** Memuat, memvalidasi, dan mengindeks semua skill dari `frontend/src/skills/`.

**Fungsi utama:**

```javascript
async initialize()
// Scan folder /skills/, validasi manifest, bangun trigger index

matchTrigger(userMsg)
// Input : string pesan
// Output: { skill, confidence, matchedTrigger } | null
// Matching: exact match dulu, lalu fuzzy (includes) sebagai fallback

getSkill(skillId)
// Ambil skill by ID

list()
// Daftar semua skill aktif

activate(skillId) / deactivate(skillId)
// Aktif/nonaktif tanpa hapus file
```

**Trigger matching algorithm (deterministik, 0 LLM):**
1. Normalisasi pesan: lowercase + trim
2. Cek exact match ke semua `triggers[]` dari semua skill aktif
3. Jika tidak ada, cek `includes()` (trigger sebagai substring)
4. Jika ada match, return `{ skill, confidence: 1.0 (exact) | 0.75 (fuzzy), matchedTrigger }`
5. Jika tidak ada match, return `null`

---

### 1.3 `SkillGuardService` (baru)

**File:** `frontend/src/core/runtime/services/SkillGuardService.js`
**Didaftarkan di:** `Kernel.js` Phase 3, setelah `SkillRegistry`

**Tanggung jawab:** Validasi keamanan skill sebelum dieksekusi.
Bukan sandbox (skill dibuat Owner sendiri) — cukup validasi struktural.

**Fungsi utama:**

```javascript
validate(skill)
// Input : skill object dari SkillRegistry
// Output: { allowed: boolean, reason: string }
// Cek:
//   1. Manifest valid (field wajib ada, tipe dikenal)
//   2. Steps valid (tidak ada action yang tidak dikenal)
//   3. Skill tidak di-deactivate
//   4. Tidak ada referensi external yang tidak diizinkan
//   5. Jumlah steps tidak melebihi batas (maks 10 step per skill)

getActionPolicy(action)
// Kembalikan policy untuk action tertentu:
//   'ask'      → ALLOW (selalu aman)
//   'generate' → ALLOW (output ke chat)
//   'write'    → REQUIRE_CONFIRMATION (via CommandRegistry PR#1)
//   'read'     → ALLOW (baca file, bukan tulis)
//   unknown    → DENY
```

**Policy actions yang didukung Fase 1:**
- `ask` — tanya ke user (ALLOW)
- `generate` — generate teks ke chat (ALLOW)
- `read` — baca file (ALLOW)
- `write` — tulis/modif file (REQUIRE_CONFIRMATION via PR#1)
- Lainnya → DENY (tidak dieksekusi, error ke Owner)

---

### 1.4 `SkillHandler` (baru, di dalam AssistantService)

**Bukan file terpisah** — method private di `AssistantService.js`:

```javascript
async _handleSkill({ skill, userMsg, history, token, ... })
```

**Alur eksekusi:**

```
1. Ambil skill dari SkillRegistry
2. Validasi via SkillGuardService.validate(skill)
   → Jika tidak allowed: kembalikan pesan error ke Owner
3. Eksekusi steps secara berurutan:
   - 'ask'      → kirim prompt ke Owner sebagai pesan AI, tunggu jawaban
   - 'generate' → kirim ke Edge Function dengan context dari jawaban sebelumnya
   - 'write'    → emit ke CommandRegistry untuk konfirmasi (PR#1 flow)
   - 'read'     → baca file, masukkan ke context langkah berikutnya
4. Kumpulkan hasil semua step → format final output
5. Log ke AuditLogService: skill dieksekusi, steps yang dijalankan, hasil
```

**State management antar step:**

```javascript
// Context yang diakumulasi selama eksekusi multi-step skill
const skillContext = {
  skillId: skill.id,
  answers: [],       // Jawaban dari user untuk setiap step 'ask'
  outputs: [],       // Output dari setiap step 'generate'
  currentStep: 0
};
```

**Emit EventBus:**
```
Skill:Started    → { skillId, skillName }
Skill:StepDone   → { skillId, step, result }
Skill:Completed  → { skillId, totalSteps, duration }
Skill:Error      → { skillId, step, reason }
```

---

## 2. Integrasi ke `RequestClassifierService`

Setelah `SkillRegistry` tersedia, isi slot SKILL di `RequestClassifierService.classify()`
(saat ini ada TODO comment di baris ~103):

```javascript
// Baris ~103 RequestClassifierService.js — ganti TODO dengan:
const skillRegistry = this.serviceManager.has('SkillRegistry')
  ? this.serviceManager.get('SkillRegistry')
  : null;
const skillMatch = skillRegistry?.matchTrigger(msgLower);
if (skillMatch) {
  const result = {
    type: 'SKILL',
    confidence: skillMatch.confidence,
    metadata: { skillId: skillMatch.skill.id, matchedTrigger: skillMatch.matchedTrigger }
  };
  this._emitClassified(result, msgLen);
  return result;
}
```

---

## 3. Integrasi ke `AssistantService.processMessage()`

Tambahkan dispatch untuk SKILL di `processMessage()`:

```javascript
// Di processMessage(), setelah dispatch LOOKUP:
if (requestType === 'SKILL') {
  const { metadata: { skillId } } = classificationResult;
  const skill = this.serviceManager.get('SkillRegistry')?.getSkill(skillId);
  if (skill) return this._handleSkill({ ...handlerParams, skill });
  // Fallback ke CONVERSATION jika skill tidak ditemukan
}
```

---

## 4. Integrasi ke `Kernel.js`

Urutan registrasi Phase 3 yang diperbarui:

```
... (service sebelumnya)
→ ModuleDiscoveryService
→ SkillRegistry            ← BARU (sebelum RequestClassifierService)
→ SkillGuardService        ← BARU (setelah SkillRegistry)
→ RequestClassifierService ← sudah ada (PR#8), tapi perlu baca SkillRegistry
→ AdapterRegistry
```

> [!IMPORTANT]
> `SkillRegistry` harus didaftarkan **sebelum** `RequestClassifierService`
> karena `classify()` mengakses `SkillRegistry` via `serviceManager.get()`.

---

## 5. Folder dan File Baru

```
frontend/src/
├── skills/                         ← Folder konvensi skill (BARU)
│   ├── .gitkeep                    ← Jaga folder tetap ada di git
│   └── (skill-id.json...)          ← Dibuat oleh Owner
└── core/runtime/services/
    ├── SkillRegistry.js            ← BARU
    └── SkillGuardService.js        ← BARU
```

`AssistantService.js` — tambah method `_handleSkill()`

---

## 6. Exit Criteria

- [ ] `frontend/src/skills/` folder dibuat dengan `.gitkeep`
- [ ] `SkillRegistry` scan folder `/skills/` saat boot, log jumlah skill yang ditemukan
- [ ] `matchTrigger("buat laporan harian")` → return skill yang sesuai (jika ada)
- [ ] `matchTrigger("apa ibu kota Indonesia")` → return `null` (bukan skill)
- [ ] `SkillGuardService.validate()` reject skill dengan step action tidak dikenal
- [ ] `_handleSkill()` eksekusi step `ask` dan `generate` tanpa error
- [ ] Slot SKILL di `RequestClassifierService.classify()` diisi dan berfungsi
- [ ] Dispatch ke `_handleSkill()` dari `processMessage()` berfungsi
- [ ] EventBus emit `Skill:Started`, `Skill:Completed` terekam di console
- [ ] AuditLogService mencatat eksekusi skill (nama, steps, hasil)
- [ ] Skill `active: false` tidak pernah dieksekusi
- [ ] Build Vercel lulus tanpa error baru

---

## 7. Yang TIDAK Dikerjakan di Fase Ini

- ❌ UI untuk Owner mendefinisikan skill (buat/edit via chat UI) — Owner definisikan
  skill manual via file JSON di `/skills/` untuk sekarang
- ❌ Skill yang men-trigger skill lain (chaining) — terlalu kompleks di fase pertama
- ❌ Skill dengan akses network langsung — hanya lewat `webSearchTool` yang sudah ada
- ❌ Skill sharing / import dari luar — hanya skill lokal milik Owner
- ❌ Versioning conflict resolution antar skill — cukup `active: boolean` untuk sekarang

---

## 8. Prinsip Anti Over-Engineering

- Trigger matching deterministik (exact + includes) — bukan semantic similarity atau ML
- Format skill JSON sederhana — bukan DSL atau bahasa scripting custom
- `SkillGuardService` validasi struktural saja — bukan sandbox runtime
- Folder `/skills/` diisi manual oleh Owner — bukan auto-generated oleh AI
- Mulai dengan 3 action saja (`ask`, `generate`, `write`) — tambah action lain
  setelah ada bukti kebutuhan nyata
