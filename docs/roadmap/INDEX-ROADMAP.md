# INDEX — Peta Dokumen Roadmap Mamet OS Ecosystem

**Tujuan dokumen ini:** Titik masuk pertama untuk Antigravity (atau AI mana pun) sebelum membaca dokumen lain di folder `docs/roadmap/`. Berisi status, urutan pengerjaan, dan ringkasan tiap dokumen — bukan pengganti isi dokumen aslinya.

**Update terakhir:** 2026-09-02
**Prinsip folder ini:** Satu file, satu tanggung jawab. Dokumen ini HANYA index — jangan tambahkan detail teknis di sini, cukup rujukan ke file terkait.

---

## 1. Status Ringkas

| Dokumen | Status | Scope |
|---|---|---|
| `ASSISTANT-CAPABILITY-ROADMAP.md` | ✅ Selesai (PR#1–#7 Fase 1) — ⚠️ PR#5 parsial | Assistant capability, 7 PR |
| `roadmap memory governor.md` | ✅ **Selesai Fase 1 & Integrasi** (Service core, Addendum, integrasi Assistant & Engineer, observabilitas konflik di HomeDashboard; UI Purge deferred) | `MemoryGovernorService.js` |
| `PR8-linux-style-dispatch.md` | ✅ Selesai — `RequestClassifierService` + thin dispatcher + `_handleLookup` | `RequestClassifierService`, `LookupHandler`, `ConversationHandler` |
| `teknis-skil-implementasi.md` | ✅ Selesai — SkillRegistry + SkillGuardService + SkillHandler + contoh skill | `SkillRegistry`, `SkillGuardService`, `SkillHandler` |
| `PR9-retrieval-tier-architecture.md` | ✅ **Selesai Fase 1 & 2** (Tier 1 lokal & Tier 2 internal LLM fallback aktif, `InternalKnowledgeFallbackService.js` + `RetrievalOrchestrator.js` + `CHECK_002B`; Fase 3 Web Comparison pending) | `RetrievalStrategyService.js`, `KnowledgeService.js`, `context_builder.ts`, `RetrievalOrchestrator.js`, `InternalKnowledgeFallbackService.js`, *(fase berikutnya)* `WebComparisonService.js` |
| `PENDING-supabase-security-advisor-findings.md` | ✅ **Selesai Remediasi RPC (8/9) — 1 item deferred: upgrade plan** (8 fungsi `SECURITY DEFINER` aman via migrasi; Leaked Password ditunda keputusan Owner karena batasan Pro plan) | Supabase RPC Permissions & Security |
| `PENDING-live-verification-runtime-gaps.md` | ✅ **Selesai Remediasi Gap Runtime (4/5)** — 1 backlog terbuka: format prompt Source Trace | `agent-process` Edge Function & RAG |
| `SPESIFIKASI-TEKNIS-MAMET-OS-v2.md` | 📋 Referensi — `SystemGovernorService.js` belum dikerjakan | Monitoring/observability daemon |
| `MAMET-AI-ROADMAP.md`, `engineer-autonomous-mode.md`, `engineer-chat-upgrade.md`, `fix-log.md`, `rencana.md`, `roadmap-lanjutan.md` | 📋 Belum direview ulang dalam sesi ini — **catatan:** `MAMET-AI-ROADMAP.md` memakai skema penomoran (`TASK-000x`, `ADR-000x`, istilah "MametLite"/"BRAIN 1-2") yang berbeda dari skema PR# di dokumen lain — perlu direkonsiliasi sebelum dipakai sebagai rujukan aktif | — |

---

## 2. Urutan Pengerjaan & Status Eksekusi

```
[SELESAI] PR#1, PR#2, PR#3, PR#4, PR#6, PR#7 Fase 1 (Assistant Capability)
    ↓
[SELESAI] MemoryGovernorService — Fase 1 & Integrasi (Service core, Addendum, integrasi Assistant/Engineer, Conflict UI badge; UI Purge deferred)
    ↓
[SELESAI] PR#8 — Linux-style Dispatch (PR8-linux-style-dispatch.md)
    ↓
[SELESAI] Skill Implementation (teknis-skil-implementasi.md)
    ↓
[SELESAI] Cost Ledger Instrumentation & Guardrail Enforcement (ADR-015 Phase 1, commit 86beabe / 676a211)
    ↓
[SELESAI FASE 1 & 2] PR#9 — Retrieval Tier Architecture (PR9-retrieval-tier-architecture.md)
    Menuntaskan gap PR#5 (Adaptive Retrieval Strategy) dan membangun 2 Tier utama:
    - Tier 1 Lokal: KnowledgeService.js, RetrievalStrategyService.js, context_builder.ts (Edge Function)
    - Tier 2 Internal: InternalKnowledgeFallbackService.js, auto-switching di RetrievalOrchestrator.js, CHECK_002B di verification_engine.ts
    ↓
[BERIKUTNYA] Penentuan Prioritas Owner:
    Option A: Penuntasan Integrasi MemoryGovernorService (Tutup gap Assistant trigger + UI Conflict/Purge)
    Option B: SystemGovernorService (SPESIFIKASI-TEKNIS-MAMET-OS-v2.md)
    Option C: Remediasi Backlog Temuan Runtime Live (PENDING-live-verification-runtime-gaps.md)
    Option D: Eksekusi PR#9 Fase 2 (Internal LLM Fallback)
```

**Catatan status MemoryGovernorService:**
File `MemoryGovernorService.js` sudah ada dan terdaftar di `Kernel.js`. Method core Golden Source (`storeGoldenMemory`, `verifyMemorySummary`, `verifyEngineeringSession`) dan Addendum (`retrieveMemory`, `detectAndMarkConflict`, `resolveConflict`, `archiveMemory`, `requestPurge`, `executePurge`) sudah diimplementasikan. Namun, integrasi menyeluruh masih berstatus pondasi karena:
1. `AssistantService.handleMemoryTrigger()` masih menyimpan memori secara standar tanpa metadata Golden Source (`hasGoldenMeta = false`), sehingga bypass `storeGoldenMemory`.
2. Verifikasi memori otomatis (`verifyMemorySummary`) hanya dipanggil di akhir sesi Engineer (`_finalizeSession`), belum ada jalur untuk memori Assistant biasa.
3. Fungsi Conflict Resolution & Purge Lifecycle belum memiliki UI / user action hook.
4. Fase 2 (UI MemoryContextPanel) sampai Fase 5 belum dikerjakan.

**Catatan status PR#9 (Retrieval Tier Architecture):**
Dokumen `PR9-retrieval-tier-architecture.md` telah **selesai diimplementasikan untuk Fase 1 (Tier 1 Lokal)** per 2026-09-02 (lihat changelog: [`2026-09-02-pr9-retrieval-tier-fase1-selesai.md`](../project-memory/changelog/2026-09-02-pr9-retrieval-tier-fase1-selesai.md)).
1. Tier 1 (lokal) aktif di **server-side via Edge Function `context_builder.ts`** untuk kedua mode (Assistant/Lite & Engineer) serta terhubung via facade `RetrievalOrchestrator.js` di client.
2. `RetrievalStrategyService.js` dan `KnowledgeService.js` (refactored ke Dependency Injection) tetap file terpisah yang kompatibel Deno & browser.
3. Timeout 5 detik dan explicit fallback tracking (`ctx.state.tier1Retrieval`) telah aktif di Edge Function.
4. Evaluasi biaya CP9 diselesaikan melalui **proyeksi/kalkulasi teoretis** (skenario 10.000 turn/bulan $\approx 2\%$ kuota Supabase, $0.00 mode Assistant, ~$0.06 mode Engineer); stress test nyata tetap menjadi item verifikasi pending/opsional.
5. Fase 2 (Internal LLM Fallback) dan Fase 3 (Web Comparison, wajib konfirmasi Owner) berstatus **belum dikerjakan** — menunggu arahan eksplisit Owner.

---

## 3. Catatan Disambiguasi Penting

**`CognitiveMemoryGovernorService.js` (PR#2, sudah aktif) ≠ `MemoryGovernorService.js` (Fase 1, pondasi siap).**
- `CognitiveMemoryGovernorService.js` (port dari `cognitiveMemoryGovernor.ts`) — beroperasi di level Assistant/percakapan: memfilter memori untuk prompt injection berdasarkan `truth_score`.
- `MemoryGovernorService.js` (Fase 1) — beroperasi di level database/knowledge base: menjaga integritas ringkasan vs raw content (Golden Source Rule), two-stage retrieval, conflict resolution, dan lifecycle tabel memori.

**Memory system ≠ RAG/Knowledge retrieval (klarifikasi PR#9):**
- **Memory** (`user_memories` table via `MemoryService`/`MemoryGovernorService`) — hal yang di-*remember* user secara eksplisit (preferensi, fakta personal). Bukan bagian dari desain PR#9.
- **RAG/Knowledge** (`document_chunks`/`documents` via `RetrievalStrategyService`/`context_builder.ts`) — dokumen pengetahuan, dicakup PR#9. Dua sistem ini independen, tidak boleh dicampur.

**Empat "governor/guard/orchestrator" service independen:**
- `SystemGovernorService.js` — monitoring/anomali kode & escalations (belum dibuat)
- `MemoryGovernorService.js` — integritas data/ringkasan memori (pondasi siap)
- `SkillGuardService.js` — validasi keamanan skill sebelum dieksekusi (sudah aktif via Skill Implementation)
- `RetrievalOrchestrator.js` — pengatur transisi tier retrieval pengetahuan 1→2→3 (baru, PR#9, dibangun Fase 1)

---

## 4. Prinsip Payung yang Berlaku di Semua Dokumen

- **Owner Sovereignty** — semua aksi otomatis yang berdampak signifikan wajib eskalasi/konfirmasi eksplisit ke Owner, tidak ada auto-resolve/auto-approve untuk keputusan berisiko. *(Diterapkan di PR#9: web search Tier 3 wajib konfirmasi Owner.)*
- **No Silent State Transition** — setiap perubahan status otomatis (approve, reject, expire, archive) wajib tercatat di changelog/audit log. *(Diterapkan di PR#9: kegagalan tier tidak boleh silent, harus ditandai eksplisit ke user.)*
- **One File, One Responsibility** — berlaku untuk kode maupun dokumen (termasuk dokumen ini sendiri).
- **Soft-delete sebelum hard-delete** — pola trash bin konsisten dipakai di MemoryGovernorService dan Skill retention; hard-delete hanya via command eksplisit Owner.

---

## 5. Cara Update Dokumen Ini

Setiap kali sebuah dokumen di folder ini selesai dikerjakan (Exit Criteria terpenuhi) atau status berubah, update tabel di Bagian 1 dan pindahkan progress marker di Bagian 2. Jangan biarkan index ini basi — index yang salah lebih berbahaya daripada tidak ada index.
