# INDEX — Peta Dokumen Roadmap Mamet OS Ecosystem

**Tujuan dokumen ini:** Titik masuk pertama untuk Antigravity (atau AI mana pun) sebelum membaca dokumen lain di folder `docs/roadmap/`. Berisi status, urutan pengerjaan, dan ringkasan tiap dokumen — bukan pengganti isi dokumen aslinya.

**Update terakhir:** 2026-09-03
**Prinsip folder ini:** Satu file, satu tanggung jawab. Dokumen ini HANYA index — jangan tambahkan detail teknis di sini, cukup rujukan ke file terkait.

---

## 1. Status Ringkas

| Dokumen | Status | Scope |
|---|---|---|
| `ASSISTANT-CAPABILITY-ROADMAP.md` | ✅ Selesai (PR#1–#7 Fase 1) — ⚠️ PR#5 parsial | Assistant capability, 7 PR |
| `roadmap memory governor.md` | ✅ **Selesai Penuh (Fase 1, Addendum & CP4b UI Purge/Conflict Lifecycle)** | `MemoryGovernorService.js`, `MemoryContextPanel.jsx`, `ConversationEngine.jsx` |
| `PR8-linux-style-dispatch.md` | ✅ Selesai — `RequestClassifierService` + thin dispatcher + `_handleLookup` | `RequestClassifierService`, `LookupHandler`, `ConversationHandler` |
| `teknis-skil-implementasi.md` | ✅ Selesai — SkillRegistry + SkillGuardService + SkillHandler + contoh skill | `SkillRegistry`, `SkillGuardService`, `SkillHandler` |
| `PR9-retrieval-tier-architecture.md` | ✅ **Selesai Fase 1 & 2** (Tier 1 lokal & Tier 2 internal LLM fallback aktif, `InternalKnowledgeFallbackService.js` + `RetrievalOrchestrator.js` + `CHECK_002B`; Fase 3 Web Comparison pending) | `RetrievalStrategyService.js`, `KnowledgeService.js`, `context_builder.ts`, `RetrievalOrchestrator.js`, `InternalKnowledgeFallbackService.js`, *(fase berikutnya)* `WebComparisonService.js` |
| `PENDING-supabase-security-advisor-findings.md` | ✅ **Selesai Remediasi RPC (8/9) — 1 item deferred: upgrade plan** (8 fungsi `SECURITY DEFINER` aman via migrasi; Leaked Password ditunda keputusan Owner karena batasan Pro plan) | Supabase RPC Permissions & Security |
| `PENDING-live-verification-runtime-gaps.md` | ✅ **Selesai Remediasi Gap Runtime (5/5 — 100%)** (Trace ID, Match Memories schema, Escaped ilike, UUID storage target, CHECK_002/003 Source Trace) | `agent-process` Edge Function & RAG |
| `CHECK-P02-json-patch-schema-alignment.md` | ✅ **Selesai & Tervalidasi (Live Production Confirmed)** (Defensive Unwrap Layer di `_extractJSONPatch` + Standardisasi Prompt Engineer) | `verification_engine.ts`, `request_pipeline.ts` |
| `FIX-assistant-session-finalization-and-autosave-throttle.md` | ✅ **Selesai & Tervalidasi (Confirmed Desktop + Unit Test)** (Pemisahan `finalizeAssistantSession` dari auto-save loop & throttling DB I/O) | `AssistantService.js`, `ConversationEngine.jsx` |
| `TAHAP1-memory-system-finalization.md` | ✅ **Selesai Penuh (Sub A + Sub B + Sub C — 2026-09-03)** (Integrasi Assistant Golden Memory, UI Conflict Resolution & Purge CP4b, Category Alignment) | `MemoryGovernorService.js`, `MemoryService.js`, `MemoryContextPanel.jsx`, `ConversationEngine.jsx` |
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
[SELESAI] TAHAP 1 — Memory System Finalization (2026-09-03)
    - Sub A: Integrasi penuh MemoryGovernorService ke Assistant Trigger (secure-by-default storeGoldenMemory)
    - Sub B (CP4b): UI Purge Lifecycle & Conflict Resolution + atomic metadata.conflict_info
    - Sub C (Backlog #7): Memory Context Panel Category Alignment (Display Layer terisolasi)
    ↓
[TAHAP 2 - BERIKUTNYA] SystemGovernorService.js (Opsi B)
    Pembangunan daemon Codebase Governance & File Integrity dari nol sesuai SPESIFIKASI-TEKNIS-MAMET-OS-v2.md.
    - Dikonfirmasi TIDAK punya dependensi data ke skema user_memories/metadata.conflict_info — aman dikerjakan setelah Tahap 1 tanpa risiko rework. Urutan ini dipilih agar modul greenfield berbobot tinggi dikerjakan setelah fondasi Memory System stabil 100%.
    - Risiko: Sedang | Kompleksitas: Tinggi
    ↓
[TAHAP 3] PR#9 Fase 3 — Web Comparison (Opsi D)
    WebComparisonService.js + Tier 3 di RetrievalOrchestrator.js dengan gerbang konfirmasi Owner (Human-in-Command).
    - Dikonfirmasi 100% independen dari Tahap 1 & 2 — ditempatkan terakhir karena kompleksitas modular paling terisolasi di antara tiga tahap.
    - Risiko: Rendah | Kompleksitas: Sedang
```

*Catatan Terpisah:* Opsi C (Remediasi Backlog Runtime — `ModuleDiscoveryService` refactor, React Warning render phase) dan item housekeeping lain di Bagian 6 tetap independen dari 3 tahap ini dan dapat disisipkan kapan saja tanpa mempengaruhi urutan arsitektural di atas (Referensi: Sesi audit dependensi 3 inisiatif besar, 2026-09-03).

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

---

## 6. Item Backlog & Temuan Pending (Menunggu Penjadwalan Owner)

1. **Refactor `ModuleDiscoveryService.js`:**
   - **Isu:** Memanggil `window.electronAPI.runTerminalCommand()` saat boot desktop sehingga memicu popup izin terminal AI tanpa trigger user.
   - **Solusi:** Migrasi ke `window.electronAPI.listFiles()` & `readFile()` yang aman.
2. **React Warning Render Phase (`WorkspaceContext.jsx:12`):**
   - **Isu:** Warning *"Cannot update a component while rendering"* dipicu dari `WorkbenchZone.jsx:60` via `EventBus`.
   - **Rencana Audit:** Telusuri mengapa pemanggilan `setState` terpanggil di dalam render phase alih-alih di dalam `useEffect`/event callback.
3. **Bug Klasifikasi Intent Recall `RequestClassifier`:**
   - **Isu:** Pertanyaan recall (misal *"masih ingat nama saya?"*) tidak dijawab, melainkan disimpan sebagai memori baru dengan teks terpotong (*"ingat"* terhapus menjadi *"masih nama saya?"*).
   - **Status:** ✅ **Selesai & Tervalidasi Penuh (Live Desktop Confirmed — 4/4 Skenario Kunci)** ([`FIX-intent-classification-and-memory-store-unification.md`](./FIX-intent-classification-and-memory-store-unification.md)).
4. **CP4b Memory Governor — UI Purge Lifecycle & Conflict Resolution:**
   - **Status:** ✅ **Selesai Diimplementasikan (Tahap 1 Sub B — 2026-09-03)** ([`2026-09-03-tahap1-sub-b-ui-purge-and-conflict-resolution.md`](../project-memory/changelog/2026-09-03-tahap1-sub-b-ui-purge-and-conflict-resolution.md)).
   - **Cakupan Selesai:** Pengayaan atomik `metadata.conflict_info`, penurunan log level ke `console.log`, UI visual diff perbandingan versi lama vs baru di `MemoryContextPanel.jsx`, tombol aksi Owner resolusi konflik (`keep`/`discard`), dan antarmuka Trash Bin siklus 2-tahap (*Soft-delete $\rightarrow$ Pending Purge $\rightarrow$ Hard Delete* dengan konfirmasi modal aman).
5. **PR#9 Fase 3 — Tier 3 Web Comparison:**
   - **Status:** Service `WebComparisonService.js` untuk komparasi web search terstruktur dengan gerbang konfirmasi Owner.
6. **Audit & Penyelarasan Persona Kesadaran Memori pada System Prompt:**
   - **Isu:** Respons LLM untuk kalimat negasi (misal *"jangan simpan info ini ya"*) mengklaim *"saya tidak menyimpan informasi pribadi... bersifat sementara"* — bertentangan dengan arsitektur sistem yang memiliki `MemoryGovernorService` aktif.
   - **Status:** ✅ **Selesai Diimplementasikan** ([`2026-09-03-fix-persona-memory-awareness-wording.md`](../project-memory/changelog/2026-09-03-fix-persona-memory-awareness-wording.md)) via penambahan blok `KESADARAN SISTEM MEMORI` di `request_pipeline.ts`.
7. **Fase 2 — Memory Context Panel Category Alignment (Backlog #7):**
   - **Status:** ✅ **Selesai Diimplementasikan (Tahap 1 Sub C — 2026-09-03)** ([`2026-09-03-tahap1-sub-c-memory-context-panel-category-alignment.md`](../project-memory/changelog/2026-09-03-tahap1-sub-c-memory-context-panel-category-alignment.md)).
   - **Solusi Terisolasi:** Menambahkan `getActiveMemories` di `MemoryGovernorService.js` khusus untuk tampilan panel UI tanpa menyentuh heuristik retrieval backend `MemoryService._inferCategories()`. Panel kini menampilkan seluruh memori aktif lintas kategori saat idle/generik dan tidak lagi keliru menampilkan "0 memori aktif".

