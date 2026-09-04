# INDEX — Peta Dokumen Roadmap Mamet OS Ecosystem

**Tujuan dokumen ini:** Titik masuk pertama untuk Antigravity (atau AI mana pun) sebelum membaca dokumen lain di folder `docs/roadmap/`. Berisi status, urutan pengerjaan, dan ringkasan tiap dokumen — bukan pengganti isi dokumen aslinya.

**Update terakhir:** 2026-09-04
**Prinsip folder ini:** Satu file, satu tanggung jawab. Dokumen ini HANYA index — jangan tambahkan detail teknis di sini, cukup rujukan ke file terkait.

---

## 1. Status Ringkas

| Dokumen | Status | Scope |
|---|---|---|
| `ASSISTANT-CAPABILITY-ROADMAP.md` | ✅ Selesai (PR#1–#7 Fase 1) — ⚠️ PR#5 parsial | Assistant capability, 7 PR |
| `roadmap memory governor.md` | ✅ **Selesai Penuh (Fase 1, Addendum & CP4b UI Purge/Conflict Lifecycle)** | `MemoryGovernorService.js`, `MemoryContextPanel.jsx`, `ConversationEngine.jsx` |
| `PR8-linux-style-dispatch.md` | ✅ Selesai — `RequestClassifierService` + thin dispatcher + `_handleLookup` | `RequestClassifierService`, `LookupHandler`, `ConversationHandler` |
| `teknis-skil-implementasi.md` | ✅ Selesai — SkillRegistry + SkillGuardService + SkillHandler + contoh skill | `SkillRegistry`, `SkillGuardService`, `SkillHandler` |
| `PR9-retrieval-tier-architecture.md` | ✅ **Selesai Penuh (Fase 1, 2, & 3 — Live-Verified)** (Tier 1 lokal, Tier 2 internal fallback, Tier 3 Web Comparison dengan Human-in-Command, multi-provider RSS/IPC bridge, integrasi RAG server-side, standarisasi varian label status, & live test terkonfirmasi) | `RetrievalStrategyService.js`, `KnowledgeService.js`, `context_builder.ts`, `RetrievalOrchestrator.js`, `InternalKnowledgeFallbackService.js`, `WebComparisonService.js`, `request_pipeline.ts`, `universal_contract.ts` |
| `ZERO-LEAKAGE-RAG-TENANT-ISOLATION.md` | ✅ **Selesai Penuh & Live-Verified (2026-09-04)** (Audit kepemilikan 45 dokumen 2 akun, PostgREST inner join `documents!inner(user_id)` di `KnowledgeService.js`, guard `userId`, propagasi `userId` di seluruh runtime pipeline & Edge Function, serta live test desktop 100% pass) | `KnowledgeService.js`, `RetrievalOrchestrator.js`, `AssistantService.js`, `context_builder.ts`, `useDashboardData.js` |

| `PENDING-supabase-security-advisor-findings.md` | ✅ **Selesai Remediasi RPC (8/9) — 1 item deferred: upgrade plan** (8 fungsi `SECURITY DEFINER` aman via migrasi; Leaked Password ditunda keputusan Owner karena batasan Pro plan) | Supabase RPC Permissions & Security |
| `PENDING-tier3-web-search-chrome-cors-proxy-fix.md` | 📋 **PENDING / BACKLOG (Menunggu Keputusan Owner)** (Remediasi 404 dynamic import `supabase.js` pada browser Chrome/Vercel via static import / ServiceManager DI) | `WebComparisonService.js`, `proxy_fetch`, Tier 3 Web Search |
| `PENDING-live-verification-runtime-gaps.md` | ✅ **Selesai Remediasi Gap Runtime (5/5 — 100%)** (Trace ID, Match Memories schema, Escaped ilike, UUID storage target, CHECK_002/003 Source Trace) | `agent-process` Edge Function & RAG |
| `CHECK-P02-json-patch-schema-alignment.md` | ✅ **Selesai & Tervalidasi (Live Production Confirmed)** (Defensive Unwrap Layer di `_extractJSONPatch` + Standardisasi Prompt Engineer) | `verification_engine.ts`, `request_pipeline.ts` |
| `FIX-assistant-session-finalization-and-autosave-throttle.md` | ✅ **Selesai & Tervalidasi (Confirmed Desktop + Unit Test)** (Pemisahan `finalizeAssistantSession` dari auto-save loop & throttling DB I/O) | `AssistantService.js`, `ConversationEngine.jsx` |
| `TAHAP1-memory-system-finalization.md` | ✅ **Selesai Penuh & Live-Verified (Sub A + Sub B + Sub C — 2026-09-03)** (Integrasi Assistant Golden Memory, UI Conflict Resolution & Purge CP4b, Category Alignment) | `MemoryGovernorService.js`, `MemoryService.js`, `MemoryContextPanel.jsx`, `ConversationEngine.jsx` |
| `ROADMAP-DASHBOARD-OBSERVABILITY-REALTIME.md` | ✅ **Selesai (Diimplementasikan & Diverifikasi 2026-09-04)** | Status Liveness Zero-Token, Sanitasi [object Object], Auto-Load Trace, Metrik Realtime |
| `ROADMAP-KNOWLEDGE-GALAXY-COSMIC-ORBITS.md` | 🟡 **PROPOSED (Menunggu Review Owner)** | Visualisasi Galaksi: Orbit Lengkung (Cosmic Filaments) & Pijaran Bintang Aktif Chat (Live Thought Pulse) |
| `ROADMAP-RUNTIME-CHAT-SESSION-STABILITY-AND-HISTORY.md` | ✅ **COMPLETED, LIVE-ACCEPTED & VERIFIED (2026-09-04 — Kedipan 0, Riwayat Realtime & Terisolasi Antar Workspace)** | Stabilitas Reconciler React (0 Unmount), Isolasi Kunci Workspace Chat, & Realtime EventBus Sync ChatHistory |
| `ROADMAP-PR6-TOKEN-EFFICIENCY.md` | ✅ **COMPLETED & LIVE-VERIFIED (2026-09-04 — Cloud Confirmed)** | Prompt Caching Gemini (Implicit Caching via Static/Dynamic Split systemInstruction) + Web Search Summarization Guard (threshold 6.000 chars, maks 800 chars/artikel) + Token Metrics Logging across all adapters |
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
[SELESAI PENUH] PR#9 — Retrieval Tier Architecture (PR9-retrieval-tier-architecture.md)
    Menuntaskan gap PR#5 (Adaptive Retrieval Strategy) dan membangun 3 Tier berjenjang:
    - Tier 1 Lokal: KnowledgeService.js, RetrievalStrategyService.js, context_builder.ts (Edge Function)
    - Tier 2 Internal: InternalKnowledgeFallbackService.js, auto-switching di RetrievalOrchestrator.js, CHECK_002B di verification_engine.ts
    - Tier 3 Web: WebComparisonService.js, gerbang konfirmasi Owner (Human-in-Command), timeout 8s, penandaan sumber transparan di prompt
    ↓
[SELESAI] TAHAP 1 — Memory System Finalization (2026-09-03, Live-Verified)
    - Sub A: Integrasi penuh MemoryGovernorService ke Assistant Trigger (secure-by-default storeGoldenMemory)
    - Sub B (CP4b): UI Purge Lifecycle & Conflict Resolution + atomic metadata.conflict_info
    - Sub C (Backlog #7): Memory Context Panel Category Alignment (Display Layer terisolasi)
    ↓
[SELESAI] TAHAP 2 — SystemGovernorService.js (Opsi B, 2026-09-03)
    Pembangunan daemon Codebase Governance & File Integrity dari nol sesuai SPESIFIKASI-TEKNIS-MAMET-OS-v2.md.
    - Tangga Eskalasi 4 Level, Severity Classification 2D, Caching SHA-256, Session-Relative TTL (7 hari), No Silent State Transitions, MAEF Structural Validation Gate, 3-Mode Notification Strategy, Level 4 Approval Gate.
    - Didaftarkan resmi di Kernel Phase 3 & Session Digest terintegrasi di ObservabilityPanel.jsx.
    ↓
[SELESAI] TAHAP 3 — PR#9 Fase 3: Web Comparison (Opsi D, 2026-09-03, Live-Verified 2026-09-04)
    WebComparisonService.js + Tier 3 di RetrievalOrchestrator.js dengan gerbang konfirmasi Owner (Human-in-Command).
    - Timeout 8s (AbortController), atribusi sumber transparan ([Sumber: Web — {url}, akurasi tidak terverifikasi]), fallback jujur saat ditolak/gagal/timeout, didaftarkan di Kernel Phase 3, mitigasi CSP Chromium via Electron IPC bridge, multi-provider RSS fallback, pengangkatan dokumen web ke RAG first-class, serta standarisasi universal label status epistemik (format ringkas LOOKUP vs format penuh).
    ↓
[SELESAI] ZERO-LEAKAGE RAG TENANT ISOLATION & MULTI-ACCOUNT AUDIT (2026-09-04, Live-Verified by Owner)
    Audit kepemilikan 45 dokumen di Supabase RAG (29 milik akun andreanastasya798@gmail.com, 16 milik akun slametbro798@gmail.com).
    - Hardening KnowledgeService.js: PostgREST Resource Embedding Inner Join documents!inner(id, title, user_id, space_id) pada fallback content search, guard proteksi missing userId, dan penghapusan filter kolom user_id yang salah pada tabel document_chunks.
    - Penyambungan parameter userId di seluruh alur: RetrievalOrchestrator.js, AssistantService.js, dan Edge Function context_builder.ts.
    - Scoping useDashboardData.js ke currentUserId.
    - Teruji otomatis cross-tenant 0 kebocoran dan diverifikasi langsung lewat pengujian live desktop oleh Owner (skor kecukupan 0.832, Evidence Gate PASSED 100% Grade A, status [STATUS: VERIFIED]).
    ↓
[SELESAI / BUILD PASS] RUNTIME CHAT SESSION STABILITY & CHAT HISTORY PERSISTENCE (ROADMAP-RUNTIME-CHAT-SESSION-STABILITY-AND-HISTORY.md)
    AppRegistry.js: ModuleSuspenseWrapper statis + useRef → 0 Unmount React Reconciler.
    ConversationEngine.jsx: chatStorageKey per workspace (mamet_v4_${wsId}_current_chat_id) → 0 tabrakan antar 3 instance chat.
    AssistantService.js: emit Chat:Updated via EventBus setelah saveChatToDB berhasil.
    ChatHistory.jsx: subscribe EventBus Chat:Updated → fetchChats() realtime (menggantikan window.storage yang tidak efektif).
    useDashboardData.js: kolom timestamp pada verification_audit_logs → 0 HTTP 400 retry loop.
    Build: ✅ 2662 modul, 0 error. Live-Accepted by Owner: Kedipan 0, Sesi Utuh, Riwayat Realtime & Terisolasi Antar Workspace (2026-09-04).
    ↓
[SELESAI / LIVE-VERIFIED] PR#6 — EFISIENSI TOKEN (ROADMAP-PR6-TOKEN-EFFICIENCY.md)
    ai_adapter.ts: Static/Dynamic split — static ke systemInstruction (Implicit Caching aktif), dynamic (RAG, MEMORY) ke contents user pertama.
    context_builder.ts: Web Search Summarization Guard — threshold 6.000 chars total, maks 800 chars/artikel via runLLM() + fallback truncate.
    Token Metrics Logging: [PR#6 TOKEN] per request + [PR#6 TOKEN METRICS] across Gemini & OpenRouter adapters.
    Live Verified on Supabase Cloud: [PR#6] Web context total: 606 chars dari 2 artikel (trace 4ca4900f-a1e0-4c7f-9f2a-f6539dc623ff). Build pass (10.07s).
```

*Catatan Terpisah:* Opsi C (Remediasi Backlog Runtime — `ModuleDiscoveryService` refactor, React Warning render phase) dan item housekeeping lain di Bagian 6 tetap independen dari 3 tahap ini dan dapat disisipkan kapan saja tanpa mempengaruhi urutan arsitektural di atas (Referensi: Sesi audit dependensi 3 inisiatif besar, 2026-09-03).

**Catatan status MemoryGovernorService:**
File `MemoryGovernorService.js` sudah ada dan terdaftar di `Kernel.js`. Seluruh method core Golden Source (`storeGoldenMemory`, `verifyMemorySummary`, `verifyEngineeringSession`), Addendum (`retrieveMemory`, `detectAndMarkConflict`, `resolveConflict`, `archiveMemory`, `requestPurge`, `executePurge`, `restoreMemory`, `getActiveMemories`), serta integrasi menyeluruh **telah tuntas 100% dan Live-Verified pada database Supabase Cloud** per 2026-09-03 (lihat [`TAHAP1-memory-system-finalization.md`](./TAHAP1-memory-system-finalization.md) dan [`2026-09-03-tahap1-governance-audit-live-verification.md`](../project-memory/changelog/2026-09-03-tahap1-governance-audit-live-verification.md)):
1. `MemoryService.storeMemory()` secure-by-default selalu mendelegasikan ke `storeGoldenMemory` dengan auto-generated golden metadata jika opsi tidak disertakan.
2. UI Visual Side-by-Side Diff Conflict Resolution di `MemoryContextPanel.jsx` aktif dengan pengayaan atomik `metadata.conflict_info`.
3. UI Purge Lifecycle Manager (Soft-delete $\rightarrow$ Pending Purge $\rightarrow$ Hard Delete) aktif dengan modal konfirmasi aman di antarmuka Trash.
4. Category Alignment (Backlog #7) diselaraskan khusus untuk display layer panel tanpa mendistorsi heuristik retrieval backend LLM.

**Catatan status PR#9 (Retrieval Tier Architecture):**
Dokumen `PR9-retrieval-tier-architecture.md` telah **selesai penuh 100% untuk seluruh fase (Fase 1, 2, & 3) dan tervalidasi live di desktop & cloud** per 2026-09-04 (lihat changelog: [`2026-09-02-pr9-retrieval-tier-fase1-selesai.md`](../project-memory/changelog/2026-09-02-pr9-retrieval-tier-fase1-selesai.md), [`2026-09-02-pr9-retrieval-tier-fase2-selesai.md`](../project-memory/changelog/2026-09-02-pr9-retrieval-tier-fase2-selesai.md), [`2026-09-03-tahap3-web-comparison-service.md`](../project-memory/changelog/2026-09-03-tahap3-web-comparison-service.md), [`2026-09-04-pr9-web-comparison-live-hardening-and-epistemic-standardization.md`](../project-memory/changelog/2026-09-04-pr9-web-comparison-live-hardening-and-epistemic-standardization.md), dan [`2026-09-04-pr9-smart-title-aware-retrieval-and-stopwords.md`](../project-memory/changelog/2026-09-04-pr9-smart-title-aware-retrieval-and-stopwords.md)):
1. **Tier 1 (Lokal):** Aktif server-side via Edge Function `context_builder.ts` (Assistant & Engineer) serta facade `RetrievalOrchestrator.js` di client, timeout 5 detik, dan fallback tracking (`ctx.state.tier1Retrieval`).
2. **Tier 2 (Internal LLM Fallback):** Aktif via `InternalKnowledgeFallbackService.js` dengan auto-switching saat `sufficiency < 0.4`, timeout 20s, atribusi `[Sumber: Pengetahuan internal model]`, telemetri `traceId`, dan validasi `CHECK_002B`.
3. **Tier 3 (Web Comparison):** Aktif via `WebComparisonService.js` dengan gerbang konfirmasi Owner eksplisit (Human-in-Command), timeout 8s, penandaan sumber transparan, serta mitigasi CSP Chromium via Electron IPC fetch bridge (`electronAPI.fetchUrl`). Teruji live: penolakan Owner mengeksekusi fallback jujur (0 cost/latency).
4. **Resilience Multi-Provider:** Google News RSS via IPC bridge dengan User-Agent sanitization, fallback berita nasional sekunder (Antara News RSS, CNN Indonesia RSS), dan pemblokiran Wikipedia dari kueri bertipe temporal/berita.
5. **Demarkasi Memori vs Pengetahuan:** Dokumen web diangkat menjadi first-class RAG chunks di `ctx.state.ragArray` dengan identifikasi `[DOC-XXXX]`, memisahkan preferensi personal user di `[MEMORI & KONTEKS SISTEM]` dari dokumen pengetahuan faktual di `<RAG>` / `[BLOK 4: KNOWLEDGE]`.
6. **Dynamic Cutoff:** Batasan 2024 dikondisikan hanya saat pengetahuan live tidak disuntikkan (`!hasInjectedKnowledge`).
7. **Standarisasi Universal Label Status (Live Verified):** Penegasan format status kepastian pada penalaran dan blok penutup kontrak (`universal_contract.ts` / `request_pipeline.ts`). Terbukti live: mode `LOOKUP` mencetak format ringkas `[Pengetahuan umum AI — tidak diverifikasi dari dokumen Anda]` dan mode `CONVERSATION` mencetak format penuh `[STATUS: HYPOTHESIS - Rekomendasi AI]` saat dokumen tidak memuat data yang diminta (zero over-claiming).
8. **Smart Title-Aware Retrieval & Stopwords Enhancement:** Perluasan stopwords percakapan, batas kata kunci 8 kata, pencocokan judul dokumen prioritas (`documents.title`), dan keyword-density ranking di `KnowledgeService.js` untuk mencegah saturasi dokumen lain saat menanyakan dokumen spesifik (lihat changelog: [`2026-09-04-pr9-smart-title-aware-retrieval-and-stopwords.md`](../project-memory/changelog/2026-09-04-pr9-smart-title-aware-retrieval-and-stopwords.md)).


---

## 3. Catatan Disambiguasi Penting

**`CognitiveMemoryGovernorService.js` (PR#2, sudah aktif) ≠ `MemoryGovernorService.js` (Fase 1, pondasi siap).**
- `CognitiveMemoryGovernorService.js` (port dari `cognitiveMemoryGovernor.ts`) — beroperasi di level Assistant/percakapan: memfilter memori untuk prompt injection berdasarkan `truth_score`.
- `MemoryGovernorService.js` (Fase 1) — beroperasi di level database/knowledge base: menjaga integritas ringkasan vs raw content (Golden Source Rule), two-stage retrieval, conflict resolution, dan lifecycle tabel memori.

**Memory system ≠ RAG/Knowledge retrieval (klarifikasi PR#9):**
- **Memory** (`user_memories` table via `MemoryService`/`MemoryGovernorService`) — hal yang di-*remember* user secara eksplisit (preferensi, fakta personal). Bukan bagian dari desain PR#9.
- **RAG/Knowledge** (`document_chunks`/`documents` via `RetrievalStrategyService`/`context_builder.ts`) — dokumen pengetahuan, dicakup PR#9. Dua sistem ini independen, tidak boleh dicampur.

**Empat "governor/guard/orchestrator" service independen (Seluruhnya Aktif):**
- `SystemGovernorService.js` — monitoring/anomali integritas kode & eskalasi 4 level (aktif via Tahap 2, Kernel Phase 3)
- `MemoryGovernorService.js` — integritas data/ringkasan memori golden source, conflict resolution, & UI purge (aktif 100% via Tahap 1)
- `SkillGuardService.js` — validasi keamanan skill sebelum dieksekusi (aktif via Skill Implementation)
- `RetrievalOrchestrator.js` — orkestrasi 3 tier retrieval pengetahuan lokal→internal→web + penegakan isolasi tenant (aktif via PR#9 & Zero-Leakage Hardening)

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
   - **Status:** ✅ **Selesai Diimplementasikan (2026-09-04)** ([`2026-09-04-fix-backlog-module-discovery-and-react-render-warning.md`](../project-memory/changelog/2026-09-04-fix-backlog-module-discovery-and-react-render-warning.md)).
   - **Solusi:** Migrasi penuh dari `runTerminalCommand` ke API filesystem aman (`window.electronAPI.listFiles()` & `readFile()`) yang membaca berkas langsung via Node.js `fs` tanpa terminal prompt.
2. **React Warning Render Phase (`WorkspaceContext.jsx:12` & `WorkbenchZone.jsx:60`):**
   - **Isu:** Warning *"Cannot update a component while rendering"* dipicu dari `WorkbenchZone.jsx:60` via `EventBus`.
   - **Status:** ✅ **Selesai Diimplementasikan (2026-09-04)** ([`2026-09-04-fix-backlog-module-discovery-and-react-render-warning.md`](../project-memory/changelog/2026-09-04-fix-backlog-module-discovery-and-react-render-warning.md)).
   - **Solusi:** Pemisahan efek samping `onResize` dari callback updater `setDraftSize` di `WorkbenchZone.jsx` (menggunakan `currentSizeRef`), serta penundaan dispatch state subscriber di `WorkspaceContext.jsx` via `queueMicrotask` dengan proteksi `isMounted`.
3. **Bug Klasifikasi Intent Recall `RequestClassifier`:**
   - **Isu:** Pertanyaan recall (misal *"masih ingat nama saya?"*) tidak dijawab, melainkan disimpan sebagai memori baru dengan teks terpotong (*"ingat"* terhapus menjadi *"masih nama saya?"*).
   - **Status:** ✅ **Selesai & Tervalidasi Penuh (Live Desktop Confirmed — 4/4 Skenario Kunci)** ([`FIX-intent-classification-and-memory-store-unification.md`](./FIX-intent-classification-and-memory-store-unification.md)).
4. **CP4b Memory Governor — UI Purge Lifecycle & Conflict Resolution:**
   - **Status:** ✅ **Selesai Diimplementasikan (Tahap 1 Sub B — 2026-09-03)** ([`2026-09-03-tahap1-sub-b-ui-purge-and-conflict-resolution.md`](../project-memory/changelog/2026-09-03-tahap1-sub-b-ui-purge-and-conflict-resolution.md)).
   - **Cakupan Selesai:** Pengayaan atomik `metadata.conflict_info`, penurunan log level ke `console.log`, UI visual diff perbandingan versi lama vs baru di `MemoryContextPanel.jsx`, tombol aksi Owner resolusi konflik (`keep`/`discard`), dan antarmuka Trash Bin siklus 2-tahap (*Soft-delete $\rightarrow$ Pending Purge $\rightarrow$ Hard Delete* dengan konfirmasi modal aman).
5. **PR#9 Fase 3 — Tier 3 Web Comparison:**
   - **Status:** ✅ **Selesai Penuh & Live-Verified (2026-09-04)** (Service `WebComparisonService.js` + IPC fetch bridge + multi-provider RSS/HTML + integrasi Human-in-Command UI Approval + Server-side RAG Evidence Gate).

6. **Audit & Penyelarasan Persona Kesadaran Memori pada System Prompt:**
   - **Isu:** Respons LLM untuk kalimat negasi (misal *"jangan simpan info ini ya"*) mengklaim *"saya tidak menyimpan informasi pribadi... bersifat sementara"* — bertentangan dengan arsitektur sistem yang memiliki `MemoryGovernorService` aktif.
   - **Status:** ✅ **Selesai Diimplementasikan** ([`2026-09-03-fix-persona-memory-awareness-wording.md`](../project-memory/changelog/2026-09-03-fix-persona-memory-awareness-wording.md)) via penambahan blok `KESADARAN SISTEM MEMORI` di `request_pipeline.ts`.
7. **Fase 2 — Memory Context Panel Category Alignment (Backlog #7):**
   - **Status:** ✅ **Selesai Diimplementasikan (Tahap 1 Sub C — 2026-09-03)** ([`2026-09-03-tahap1-sub-c-memory-context-panel-category-alignment.md`](../project-memory/changelog/2026-09-03-tahap1-sub-c-memory-context-panel-category-alignment.md)).
   - **Solusi Terisolasi:** Menambahkan `getActiveMemories` di `MemoryGovernorService.js` khusus untuk tampilan panel UI tanpa menyentuh heuristik retrieval backend `MemoryService._inferCategories()`. Panel kini menampilkan seluruh memori aktif lintas kategori saat idle/generik dan tidak lagi keliru menampilkan "0 memori aktif".
8. **Mekanisme Deteksi Deployment Drift (Edge Function vs Git Local/Remote):**
   - **Isu:** Inkonsistensi antara status commit lokal/remote di git dengan build/runtime yang aktif dieksekusi di Supabase Cloud Edge Function (`agent-process`), sehingga keterlambatan deployment hanya dapat dideteksi lewat penelusuran manual isi teks konteks sistem di console log.
   - **Rencana Solusi:** Penyediaan metadata versi/commit SHA pada respon health check atau header response (`x-deployed-commit-sha`), disertai script verifikasi otomatis pasca-deploy untuk memvalidasi sinkronisasi runtime terhadap `git rev-parse HEAD`.
9. **Runtime Chat Session Stability & Chat History Realtime Persistence (`ROADMAP-RUNTIME-CHAT-SESSION-STABILITY-AND-HISTORY.md`):**
   - **Isu:** Seluruh kolom chat mengalami kedipan/refresh periodik dan penghapusan sesi aktif (akibat unmount loop komponen anonim `mainPanel` di `AppRegistry.js`), tabrakan kunci `mamet_v4_current_chat_id` di `localStorage` antar 3 workspace, pembatalan auto-save 1 detik oleh unmount mendadak, serta bilah samping `ChatHistory` tidak menampilkan chat baru (karena keterbatasan listener Web API `storage`, ketiadaan event bus di `saveChatToDB`, dan `setChats` yang hanya memetakan memori lama).
   - **Status:** ✅ **Selesai Diimplementasikan & Live-Accepted (2026-09-04 — Build Pass 2662 modul, 0 error)** ([`ROADMAP-RUNTIME-CHAT-SESSION-STABILITY-AND-HISTORY.md`](./ROADMAP-RUNTIME-CHAT-SESSION-STABILITY-AND-HISTORY.md)). Terverifikasi live desktop oleh Owner: kedipan 0, sesi obrolan utuh, riwayat realtime dan terisolasi antar-workspace.
   - **Rencana Solusi:**
     1. Stabilisasi referensial React Reconciler pada `AppRegistry.js` menggunakan komponen pembungkus statis (0 unmount, 0 flicker, memori chat utuh).
     2. Isolasi kunci `localStorage` per workspace (`mamet_v4_${workspaceId}_current_chat_id`).
     3. Pemancaran event `Chat:Updated` via `EventBus` saat `saveChatToDB` di `AssistantService.js` selesai.
     4. Integrasi listener `EventBus` di `ChatHistory.jsx` untuk auto-refresh real-time seketika saat percakapan baru dibuat.
     5. Remediasi kolom query `verification_audit_logs` di `useDashboardData.js` untuk mengeliminasi siklus error HTTP 400 di background.
10. **Tier 3 Web Search pada Web Browser (Chrome/Vercel) — Dynamic Import 404 (`supabase.js`) & CORS Fallback (`PENDING-tier3-web-search-chrome-cors-proxy-fix.md`):**
    - **Isu:** Pada desktop Electron, Tier 3 Web Comparison berfungsi 100% via native IPC bridge (`window.electronAPI.fetchWeb`). Namun pada browser web Google Chrome (deployment Vercel), pencarian web gagal total karena baris `const { supabase } = await import('../../../supabase.js')` di `WebComparisonService.js:359` memicu browser request ke `https://mamet-ecosystem.vercel.app/supabase.js` yang menghasilkan HTTP 404 Not Found. Kegagalan import memicu exception sebelum Edge Function `proxy_fetch` terpanggil, dan fallback `fetch()` langsung browser diblokir oleh kebijakan CORS Chromium (`No 'Access-Control-Allow-Origin' header`).
    - **Status:** 📋 **PENDING / BACKLOG (Menunggu Keputusan Owner)** ([`PENDING-tier3-web-search-chrome-cors-proxy-fix.md`](./PENDING-tier3-web-search-chrome-cors-proxy-fix.md)).
    - **Rencana Solusi:**
      1. Ubah dynamic import menjadi static import di header `WebComparisonService.js` (`import { supabase } from '../../../supabase.js'`) agar terdaftar dalam bundle graph Vite dan tidak memicu URL 404 pada browser runtime.
      2. Atau gunakan pola Dependency Injection via `ServiceManager` (`this.serviceManager.get('supabaseClient')`) saat bootstrap kernel.
      3. Verifikasi ketersediaan CORS headers pada Edge Function `proxy_fetch` di Supabase Cloud.
