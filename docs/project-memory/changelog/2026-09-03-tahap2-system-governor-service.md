# Changelog: Tahap 2 — Pembangunan SystemGovernorService.js (Opsi B)

**Tanggal:** 2026-09-03  
**Tipe:** Architecture Implementation & Security Daemon (Tahap 2 Opsi B)  
**Scope:** `frontend/src/core/runtime/services/SystemGovernorService.js`, `frontend/src/core/runtime/Kernel.js`, `frontend/src/components/dashboard/ObservabilityPanel.jsx`  
**Author:** Antigravity (AI Partner)  
**Status:** ✅ Selesai Diimplementasikan, Teruji Penuh (17/17 Tests Pass), dan Terdaftar di Kernel Phase 3

---

## 1. Konteks & Rasional Arsitektur (SPESIFIKASI-TEKNIS-MAMET-OS-v2.md Bagian 0)
1. **Pemisahan Struktural dari `engineer.js`:**  
   `engineer.js` adalah agent self-modifying internal. Agent yang mengevaluasi dan memodifikasi kodenya sendiri tidak boleh menjadi hakim atas keputusannya sendiri. `SystemGovernorService.js` dibangun sebagai daemon pengawas pasif yang mandiri dan independen dari `engineer.js`.
2. **Owner Sovereignty:**  
   Menerapkan eskalasi bertingkat 4 level dan strategi notifikasi 3 mode agar Owner tidak mengalami *approval fatigue* maupun *silent bypass*.
3. **No Silent State Transitions:**  
   Setiap keputusan otomatis yang mempengaruhi kode atau state antrean (auto-reject, TTL expiry, allowlist bypass) wajib menulis entry ke changelog file markdown di disk (`docs/project-memory/changelog/`).
4. **Approval Gate Level 4:**  
   Setiap pemanggilan LLM (token cost) wajib meminta persetujuan Owner melalui event `SystemGovernor:RequestApproval`. Jika ditolak, eksekusi LLM 100% dibatalkan (0 token cost).

---

## 2. Rincian Fitur & Implementasi

### A. Tangga Eskalasi 4 Level (Bagian 3.2):
* **Level 1 (Deterministic, 0 token):**
  * Regex match `IMMUTABLE_PATTERNS` (`constitution/**`, `AGENTS.md`, `Kernel.js`, `EventBus.js`, dll) $\rightarrow$ Hard Block / `CRITICAL_VIOLATION`.
  * Regex match `PROTECTED_PATTERNS` (auth, payment, `.env*`, dll) $\rightarrow$ Tagging severity HIGH.
  * **Gate Validasi Struktural MAEF (Bagian 4.2):** Khusus kandidat allowlist `*Adapter.js`/`*Provider.js`, dilakukan validasi apakah $>80\%$ baris adalah vendor import/export dan maks 2–3 branch kondisional. Jika gagal validasi, berkas tetap diaudit penuh sebagai kode biasa.
* **Level 2 (Heuristik, 0 token):**
  * `trackError()`: Melacak frekuensi error identik dalam sliding window 5 menit ($\ge 3$ error memicu `SystemGovernor:Warning`).
  * `checkIdleFiles()`: Memeriksa berkas idle di folder `scratch/` ($>24$ jam).
* **Level 3 (Ambiguity Queue & Relative TTL, 0 token):**
  * `ambiguityQueue`: Menampung anomali struktural (misal file utilitas $>500$ baris) dengan field `severity` dan `enqueuedAt`.
  * **Session-Relative TTL (Bagian 3.3):** TTL 7 hari dihitung relatif terhadap waktu aktif Owner (`lastActiveSessionAt`), bukan jam absolut.
  * **Pre-Expiry Auto-Escalation:** Item yang mendekati TTL ($H-1$ / hari ke-6) otomatis dinaikkan ke severity HIGH dan memicu notifikasi push.
  * **Changelog on Expiry:** Item yang kedaluwarsa dicatat otomatis ke changelog markdown sebelum dihapus dari antrean.
  * **SHA-256 Hash Cache:** Menghindari audit ulang untuk file yang kontennya tidak berubah.
* **Level 4 (On-Demand AI Triage & Approval Gate, Token Cost):**
  * `requestDeepAudit()`: Memancarkan `SystemGovernor:RequestApproval` dengan estimasi token dan estimasi biaya USD.
  * `resolveApproval()`: Menangani persetujuan Owner. Jika ditolak $\rightarrow$ batal tanpa biaya; jika disetujui $\rightarrow$ panggil Local AI / Cloud fallback (`BrainService.executeLLM()`) dengan micro-prompt output JSON `{ anomaly: boolean, reason: string }`.

### B. Notification Strategy 3 Mode (Bagian 6):
1. **Mode 1 (Real-time Blocking):** Hard block otomatis untuk Level 1 immutable violation.
2. **Mode 2 (Session Digest):** Ringkasan anomali LOW–MEDIUM, item mendekati TTL, dan `FAILED_DETERMINISTIC` yang dirender di `ObservabilityPanel.jsx` saat Owner membuka HomeDashboard.
3. **Mode 3 (OS Push Notification):** Dijatah ketat via Electron/Web Notification API hanya untuk severity HIGH dan item $H-1$ expiry.

---

## 3. Hasil Pengujian & Verifikasi Menyeluruh

Matrix pengujian mandiri dijalankan pada `scratch/test_system_governor_service.mjs`:
1. **Group 1 (Level 1 Deterministic & MAEF Gate):** 6/6 PASS (Immutable blocked, valid adapter allowlisted, complex adapter reverted to full audit).
2. **Group 2 (Level 2 Heuristics):** 2/2 PASS (Error frequency windowing, idle scratch detection).
3. **Group 3 (Level 3 Queue, Relative TTL & Changelog Logging):** 4/4 PASS (Queueing anomaly, SHA-256 cache, $H-1$ escalation, TTL expiry markdown write).
4. **Group 4 (Level 4 Approval Gate & Triage):** 3/3 PASS (Event emit, reject aborts LLM call, approve executes triage).
5. **Group 5 (Notification Strategy & Digest):** 2/2 PASS (Session digest metrics, push throttling).

**Total Hasil Test:** ✅ **17/17 TESTS PASSED (100%)**  
**Build Frontend:** ✅ **`npm run build` Sukses 100% (2661 modules transformed, 0 error)**

---

## 4. Status Integrasi Kernel & UI
* Didaftarkan resmi di `Kernel.js` Phase 3 (`_phase3_AdapterRegistryInit`) sebagai `'SystemGovernorService'`.
* UI Observability Panel diperkaya dengan section *System Governor Digest* dan banner interaktif *Level 4 Approval Gate*.
