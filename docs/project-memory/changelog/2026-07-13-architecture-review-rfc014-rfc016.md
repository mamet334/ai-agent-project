# CHANGELOG: Architecture Review RFC-014 & RFC-016

**Tanggal:** 2026-07-13
**Tipe Entry:** RFC Review, Owner Decision, Security Decision
**Gaps Terkait:** GAP-NEW-009, GAP-NEW-019

## 1. Ringkasan Eksekutif
Telah dilakukan *Architecture Review* untuk mengevaluasi kesiapan transisi dari sistem *Desktop Authority* (eksekusi dari klien Svelte) menuju *Backend Authority* (eksekusi dikontrol ketat oleh Backend), serta implementasi *Self Engineering Lifecycle*. Keputusan Owner telah diambil untuk menjaga stabilitas ekosistem.

## 2. Keputusan Otoritas Eksekusi (RFC-016)
**Topik:** RFC-016 (Backend Authoritative Execution Architecture / Signed Execution Token)
**Status:** **FROZEN (PROPOSED)**
**Keputusan Owner:** Implementasi *Hard Enforcement* (Phase 4) ditangguhkan.
**Alasan Teknis & Keamanan:** 
- Berpegang teguh pada prinsip *Observability before Enforcement*. 
- Metrik *False Positive* dari telemetri `ToolDispatcher` (RFC-015 Shadow Mode) belum cukup solid dan memadai untuk melegitimasi *Hard Gate*. 
- Memaksakan eksekusi saat ini berisiko menyebabkan pemblokiran yang salah (*false positives*) dan rusaknya *workflow* pengguna.
- Menunggu kematangan telemetri dari fase 1-3.

## 3. Keputusan Siklus Rekayasa (RFC-014)
**Topik:** RFC-014 (EngineeringLifecycleManager / GAP-NEW-009)
**Status:** **APPROVED_FOR_DESIGN**, **IMPLEMENTATION_PENDING**
**Keputusan Owner:** Konsep *State Machine Lifecycle* (4 State: `OBSERVE_ANALYZE`, `PROPOSAL`, `IMPLEMENTATION`, `VERIFICATION_DOCS`) disetujui secara arsitektural.
**Alasan Penangguhan Implementasi:**
- Implementasi fisik baru akan dikerjakan setelah *Shadow Mode* RFC-015 mengumpulkan data yang cukup.
- Harus selaras dan tidak boleh bertabrakan dengan kesiapan *Backend Authoritative Architecture* (RFC-016).
**Fitur Desain Final:**
- *Deterministic Transition* (dikendalikan via eksplisit *intent* seperti `ENGINEER:APPROVE`).
- Matriks kemampuan *least-privilege* yang terintegrasi dengan `ToolDispatcher`.
- Validasi wajib ke `Project Memory` di akhir *lifecycle* (fase dokumentasi).

## 4. Langkah Selanjutnya (Next Actions)
1. Terus memantau *log* telemetri `agent_logs` dari *Shadow Mode* RFC-015 hingga nilai ambang batas deviasi *false positive* dapat diterima.
2. Mempertahankan status *Transitioning* pada GAP-NEW-019 (Tool Dispatcher & Hard Gate Implementation) dan *In Progress/Pending* pada GAP-NEW-009 (Self Engineering Lifecycle).
