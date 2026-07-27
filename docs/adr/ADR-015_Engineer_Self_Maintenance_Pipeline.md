# ADR-015: Engineer Self-Maintenance Pipeline Architecture

**Status:** ACCEPTED  
**Date:** 28 Juli 2026  
**Author:** Mamet OS Engineering Team + AI Co-Pilot  
**Supersedes:** ADR-0005 (Engineer Implementer Safety Flow)  
**Amended:** 28 Juli 2026 (Cost Safety Guardrails)

---

## 1. Context

### 1.1 Business Need

Mamet OS membutuhkan capability **Self-Maintenance** untuk mencapai visi kemandirian penuh dari AI coding eksternal (Cursor, Windsurf, dll). Engineer harus bisa:

1. Menganalisis repository lokal untuk memahami codebase
2. Menghasilkan patch kode via LLM untuk menyelesaikan task
3. Memverifikasi kepatuhan terhadap konstitusi MAEF sebelum eksekusi
4. Meminta approval Owner (Human-in-the-Loop) sebelum menerapkan perubahan
5. Melindungi file core (Kernel, EventBus, dll) dari modifikasi tidak sah
6. Mendukung granular approval (file-by-file) untuk kendali Owner maksimal

### 1.2 Technical Challenges

Selama implementasi, kami menghadapi 4 tantangan utama:

1. **LLM Refusal Pattern** — LLM sering menolak generate patch karena Evidence Gate yang terlalu membatasi di backend
2. **Environment Mismatch** — Engineer butuh file system access yang hanya tersedia di Desktop Electron, bukan Web Browser
3. **Output Non-Deterministic** — LLM mengembalikan response dalam berbagai format (JSON murni, markdown code block, atau refusal)
4. **Core Modification Risk** — Engineer berpotensi memodifikasi file core yang seharusnya immutable

### 1.3 Constraints

- **MAEF 4.1 (Owner Sovereignty)** — Owner harus punya kendali penuh
- **MAEF 4.2 (Kernel First)** — Kernel harus immutable
- **MAEF 4.5 (Verification Before Trust)** — Semua output harus diverifikasi
- **Owner-First Economics** — TIDAK ADA pengeluaran LLM tanpa sepengetahuan Owner (amendment 28 Juli 2026)

---

## 2. Decision

Kami memutuskan arsitektur **Engineer-First Pipeline with Multi-Profile Verification** dengan 5 prinsip utama:

### 2.1 Separation of Concerns via Multi-Profile Verification

Membuat 3 verification profile yang berbeda untuk 3 capability modes:

| Profile | Dipakai Oleh | Checks | Purpose |
|---------|--------------|--------|---------|
| **ENGINEERING** | Mode ASSISTANT | 8 checks | Validasi chat natural dengan ADR trace |
| **PERSONAL** | Mode LITE | 5 checks | Validasi assistant ringan |
| **PATCH_ENGINEERING** | Mode ENGINEER | 5 checks | Validasi JSON patch kode |

Routing dilakukan via helper method deterministik `VerificationEngine.verify(mode, context)` berdasarkan `ctx.mode`.

### 2.2 Frontend-First Delegation untuk Engineer Mode

Mode ENGINEER **tidak lagi lewat backend Supabase**. Request didelegasikan ke `Engineer.js` di frontend via EventBus karena:

- Bypass Evidence Gate yang terlalu membatasi di backend
- Gunakan prompt STRICT JSON (7 aturan eksplisit) tanpa RAG constraint
- Panggil BrainService lokal dengan model pilihan Owner (transparansi terjaga)
- Hindari double processing (backend + frontend)

**Alur:**
ConversationEngine.jsx
→ detect mode ENGINEER
→ EventBus.emit('Engineer:GeneratePatch')
→ Engineer.js (frontend)
→ BrainService (lokal, model pilihan Owner)
→ JSON patch

### 2.3 Multi-Layer Protection Architecture

4 lapisan pertahanan untuk mencegah chaos:

1. **Core Protection Layer** — 12 immutable patterns (Kernel, EventBus, Constitution, dll) + circuit breaker (3x percobaan = OBSERVER mode)
2. **Verification Hard Gate** — 5 checks untuk PATCH_ENGINEERING (JSON valid, no dangerous patterns, MAEF compliance)
3. **Granular Approval** — Owner approve file-by-file, bukan all-or-nothing
4. **Executive Command Center UI** — Confidence badge, Coverage bar, Evidence score, MAEF Compliance Shield

### 2.4 Desktop-First Infrastructure

Engineer hanya bekerja penuh di Electron Desktop karena butuh file system access:

- `DiscoveryManager`: Detect Electron via `window.electronAPI` DULU, fallback ke userAgent
- `StorageManager`: Route ke Electron IPC (`window.electronAPI.readFile`) jika tersedia
- LLM Context: Sistem tahu punya file system access → LLM tidak refusal

### 2.5 Owner-First Economics (Amendment 28 Juli 2026)

**Prinsip non-negotiable:** "TIDAK ADA PENGELUARAN TANPA SEPENGETAHUAN OWNER"

6 Cost Safety Guardrails wajib:
1. Daily Hard Budget Cap (default $0.50/hari)
2. Per-Request Cost Cap (default $0.02/request)
3. Owner-Triggered Only (TIDAK ADA cron otomatis yang memanggil LLM)
4. Real-Time Cost Dashboard
5. Kill Switch (1 klik stop semua LLM call)
6. Cost Audit Trail (`cost_ledger` table)

**Pola DILARANG:**
- ❌ Cron job yang auto-call LLM
- ❌ Background task tanpa sepengetahuan Owner
- ❌ Silent embedding generation
- ❌ Auto-scaling model tanpa notifikasi

**Pola DIIZINKAN:**
- ✅ Owner-triggered analysis dengan cost preview
- ✅ Scheduled REMINDER (bukan execute) dengan manual approval
- ✅ Learning capture (hanya tulis DB, tidak call LLM)

---

## 3. Consequences

### 3.1 Positive Consequences

- ✅ Self-maintenance loop bekerja end-to-end di Desktop Electron
- ✅ LLM generate JSON patch (bukan refusal) karena prompt engineering-grade
- ✅ Core files terlindungi dari modifikasi tidak sah via Core Protection Layer
- ✅ Owner punya kontrol granular per file (bukan all-or-nothing)
- ✅ Biaya OpenRouter lebih efisien (tidak ada double processing backend+frontend)
- ✅ Transparansi penuh: Owner selalu tahu model apa yang dipakai
- ✅ Cost safety guardrails mencegah silent cost leak
- ✅ Audit trail lengkap di `cost_ledger` untuk forensik

### 3.2 Negative Consequences

- ⚠️ Engineer tidak bekerja di Web Browser (by design — butuh file system access)
- ⚠️ Perlu restart Electron setelah update `engineer.js`
- ⚠️ Learning capability belum ada (direncanakan FASE 2)
- ⚠️ On-demand analysis belum ada (direncanakan FASE 3)
- ⚠️ Owner harus manual approve semua patches (belum ada auto-approval)

### 3.3 Neutral Consequences

- 🔄 Engineer masih reactive (belum proactive)
- 🔄 Approval 100% manual (belum ada confidence-based auto-approval)
- 🔄 Self-improvement capability belum ada (direncanakan FASE 5)

---

## 4. Compliance

Arsitektur ini mematuhi prinsip MAEF berikut:

| Principle | Implementation |
|-----------|----------------|
| **MAEF 4.1** (Owner Sovereignty) | Granular approval, model transparency, cost dashboard |
| **MAEF 4.2** (Kernel First) | Core Protection Layer dengan 12 immutable patterns |
| **MAEF 4.5** (Verification Before Trust) | Multi-profile verification dengan 5 checks per profile |
| **MAEF 4.6** (Event-Driven) | EventBus namespace compliance check (P04) |
| **MAEF 4.7** (Adapter Isolation) | Dangerous pattern check blokir direct vendor calls (P03) |
| **MAEF 4.10** (Evolution Without Chaos) | 5-fase evolution roadmap + ADR ini |

---

## 5. Evolution Roadmap

Engineer akan berevolusi melalui 5 fase (detail di Changelog):

| Fase | Nama | Target | Status |
|------|------|--------|--------|
| **1** | Reactive Junior Engineer | Patch generation works | ✅ CURRENT |
| **2** | Learning Engineer | Belajar dari rejection | 🔜 3-6 bulan |
| **3** | On-Demand Proactive Analysis | Analisis proaktif dengan cost preview | 📋 6-12 bulan |
| **4** | Autonomous Engineer | Confidence-based auto-approval | 📅 1-2 tahun |
| **5** | Self-Improving Engineer | Self-modification dengan supervisi | 📅 2+ tahun |

**Prinsip evolusi:** Trust dibangun bertahap. Tidak boleh skip fase.

---

## 6. Related ADRs

### 6.1 Superseded
- **ADR-0005:** Engineer Implementer Safety Flow (digantikan oleh arsitektur ini)

### 6.2 Complementary
- **ADR-0004:** Engineer Reviewer & Confidence — dasar confidence scoring
- **ADR-0007:** Engineering Metrics Derived — metrics yang digunakan
- **ADR-0011:** Project Memory Canonical Source — memory integration
- **ADR-0012:** Verification Engine Hard Gates — pattern untuk verification
- **ADR-0013:** Multi-Profile Verification Architecture — **BARU di sesi ini**

### 6.3 Planned
- **ADR-0016:** Learning Database Schema (FASE 2)
- **ADR-0017:** On-Demand Proactive Analysis (FASE 3)
- **ADR-0018:** Auto-Approval Risk Tiers (FASE 4)
- **ADR-0019:** Self-Modifiable Components (FASE 5)
- **ADR-0020:** Knowledge Synthesis to ADR (FASE 5)

---

## 7. Implementation Reference

Detail implementasi (code, timeline, bug fixes, metrics) tercatat di:

📄 **[CHANGELOG: Engineer Self-Maintenance Pipeline](../CHANGELOG_Engineer_Pipeline.md)**

Dokumen CHANGELOG adalah **living document** yang akan terus diupdate setiap milestone tercapai. ADR ini bersifat **immutable** setelah ACCEPTED.

---

## 8. Amendment History

| Date | Version | Changes | Reason |
|------|---------|---------|--------|
| 28 Juli 2026 | 1.0.0 | Initial ADR | Sesi development 27-28 Juli 2026 |
| 28 Juli 2026 | 1.1.0 | Tambah Section 2.5 (Cost Safety Guardrails) | Insiden silent cost leak dari cron job |

---

## 9. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| **Owner** | Mamet | 28 Juli 2026 | ✅ |
| **Engineering Lead** | Mamet OS Team | 28 Juli 2026 | ✅ |
| **AI Co-Pilot** | Qwen | 28 Juli 2026 | ✅ |

---

**End of ADR-015**  
**Next Review:** Tidak perlu (ADR immutable). Evolution tercatat di ADR-0016 s/d ADR-0020.