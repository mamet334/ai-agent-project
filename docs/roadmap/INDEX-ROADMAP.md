# INDEX — Peta Dokumen Roadmap Mamet OS Ecosystem

**Tujuan dokumen ini:** Titik masuk pertama untuk Antigravity (atau AI mana pun) sebelum membaca dokumen lain di folder `docs/roadmap/`. Berisi status, urutan pengerjaan, dan ringkasan tiap dokumen — bukan pengganti isi dokumen aslinya.

**Update terakhir:** 2026-09-01  
**Prinsip folder ini:** Satu file, satu tanggung jawab. Dokumen ini HANYA index — jangan tambahkan detail teknis di sini, cukup rujukan ke file terkait.

---

## 1. Status Ringkas

| Dokumen | Status | Scope |
|---|---|---|
| `ASSISTANT-CAPABILITY-ROADMAP.md` | ✅ Selesai (PR#1–#7 Fase 1) — ⚠️ PR#5 parsial | Assistant capability, 7 PR |
| `roadmap memory governor.md` | ⚠️ Fase 1 Pondasi Saja (Service & Addendum method siap; integrasi Assistant & UI belum; Fase 2–5 belum) | `MemoryGovernorService.js` |
| `PR8-linux-style-dispatch.md` | ✅ Selesai — `RequestClassifierService` + thin dispatcher + `_handleLookup` | `RequestClassifierService`, `LookupHandler`, `ConversationHandler` |
| `teknis-skil-implementasi.md` | ✅ Selesai — SkillRegistry + SkillGuardService + SkillHandler + contoh skill | `SkillRegistry`, `SkillGuardService`, `SkillHandler` |
| `PENDING-live-verification-runtime-gaps.md` | 📋 Backlog Temuan Live (5 gap runtime, observabilitas, dan RAG) | `agent-process` Edge Function & RAG |
| `SPESIFIKASI-TEKNIS-MAMET-OS-v2.md` | 📋 Referensi — `SystemGovernorService.js` belum dikerjakan | Monitoring/observability daemon |
| `MAMET-AI-ROADMAP.md`, `engineer-autonomous-mode.md`, `engineer-chat-upgrade.md`, `fix-log.md`, `rencana.md`, `roadmap-lanjutan.md` | 📋 Belum direview ulang dalam sesi ini | — |

---

## 2. Urutan Pengerjaan & Status Eksekusi

```
[SELESAI] PR#1, PR#2, PR#3, PR#4, PR#6, PR#7 Fase 1 (Assistant Capability)
    ↓
[PONDASI SIAP] MemoryGovernorService — Fase 1 (Service core & Addendum method dibuat; integrasi penuh & Fase 2–5 pending)
    ↓
[SELESAI] PR#8 — Linux-style Dispatch (PR8-linux-style-dispatch.md)
    ↓
[SELESAI] Skill Implementation (teknis-skil-implementasi.md)
    ↓
[SELESAI] Cost Ledger Instrumentation & Guardrail Enforcement (ADR-015 Phase 1, commit 86beabe / 676a211)
    ↓
[BERIKUTNYA] Penentuan Prioritas Owner:
    Option A: Penuntasan Integrasi MemoryGovernorService (Tutup gap Assistant trigger + UI Conflict/Purge)
    Option B: SystemGovernorService (SPESIFIKASI-TEKNIS-MAMET-OS-v2.md)
    Option C: Remediasi Backlog Temuan Runtime Live (PENDING-live-verification-runtime-gaps.md)
```

**Catatan status MemoryGovernorService:** 
File `MemoryGovernorService.js` sudah ada dan terdaftar di `Kernel.js`. Method core Golden Source (`storeGoldenMemory`, `verifyMemorySummary`, `verifyEngineeringSession`) dan Addendum (`retrieveMemory`, `detectAndMarkConflict`, `resolveConflict`, `archiveMemory`, `requestPurge`, `executePurge`) sudah diimplementasikan. Namun, integrasi menyeluruh masih berstatus pondasi karena:
1. `AssistantService.handleMemoryTrigger()` masih menyimpan memori secara standar tanpa metadata Golden Source (`hasGoldenMeta = false`), sehingga bypass `storeGoldenMemory`.
2. Verifikasi memori otomatis (`verifyMemorySummary`) hanya dipanggil di akhir sesi Engineer (`_finalizeSession`), belum ada jalur untuk memori Assistant biasa.
3. Fungsi Conflict Resolution & Purge Lifecycle belum memiliki UI / user action hook.
4. Fase 2 (UI MemoryContextPanel) sampai Fase 5 belum dikerjakan.

---

## 3. Catatan Disambiguasi Penting

**`CognitiveMemoryGovernorService.js` (PR#2, sudah aktif) ≠ `MemoryGovernorService.js` (Fase 1, pondasi siap).**
- `CognitiveMemoryGovernorService.js` (port dari `cognitiveMemoryGovernor.ts`) — beroperasi di level Assistant/percakapan: memfilter memori untuk prompt injection berdasarkan `truth_score`.
- `MemoryGovernorService.js` (Fase 1) — beroperasi di level database/knowledge base: menjaga integritas ringkasan vs raw content (Golden Source Rule), two-stage retrieval, conflict resolution, dan lifecycle tabel memori.

**Tiga "governor/guard" service independen:**
- `SystemGovernorService.js` — monitoring/anomali kode & escalations (belum dibuat)
- `MemoryGovernorService.js` — integritas data/ringkasan memori (pondasi siap)
- `SkillGuardService.js` — validasi keamanan skill sebelum dieksekusi (sudah aktif via Skill Implementation)

---

## 4. Prinsip Payung yang Berlaku di Semua Dokumen

- **Owner Sovereignty** — semua aksi otomatis yang berdampak signifikan wajib eskalasi/konfirmasi eksplisit ke Owner, tidak ada auto-resolve/auto-approve untuk keputusan berisiko.
- **No Silent State Transition** — setiap perubahan status otomatis (approve, reject, expire, archive) wajib tercatat di changelog/audit log.
- **One File, One Responsibility** — berlaku untuk kode maupun dokumen (termasuk dokumen ini sendiri).
- **Soft-delete sebelum hard-delete** — pola trash bin konsisten dipakai di MemoryGovernorService dan Skill retention; hard-delete hanya via command eksplisit Owner.

---

## 5. Cara Update Dokumen Ini

Setiap kali sebuah dokumen di folder ini selesai dikerjakan (Exit Criteria terpenuhi) atau status berubah, update tabel di Bagian 1 dan pindahkan progress marker di Bagian 2. Jangan biarkan index ini basi — index yang salah lebih berbahaya daripada tidak ada index.
