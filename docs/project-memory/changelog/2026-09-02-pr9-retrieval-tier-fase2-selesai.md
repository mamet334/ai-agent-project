# CHANGELOG — PR#9 Fase 2: Implementasi Tier 2 Internal LLM Fallback

**Tanggal:** 2026-09-02  
**Kategori:** Feature / Knowledge Retrieval / Verification  
**Tipe:** Implementation & Architecture Integration  
**Status:** ✅ Selesai & Terverifikasi (`npm run build` pass 2659 modul)

---

## 1. Latar Belakang & Masalah Arsitektur

Pada PR#9 Fase 1, `RetrievalOrchestrator.js` dibangun sebagai kerangka orkestrasi berjenjang (3-Tier), namun saat itu baru Tier 1 (Lokal) yang diaktifkan. Ketika dokumen lokal tidak ditemukan atau tidak mencukupi (`sufficiency < 0.4`), sistem belum memiliki modul resmi untuk menangani fallback ke pengetahuan internal bawaan LLM secara terstruktur, jujur, dan terobservasi.

---

## 2. Rincian Perubahan Kode

### A. Modul Baru `InternalKnowledgeFallbackService.js` (PR#9 Fase 2)
* File: `frontend/src/core/runtime/services/InternalKnowledgeFallbackService.js`
* Bertanggung jawab tunggal (One File One Responsibility) untuk membangun payload fallback Tier 2.
* Menyusun direktif sistem yang mewajibkan LLM mengakui bahwa jawaban bersumber dari pengetahuan umum/internal model (bukan data lokal repositori).
* Memancarkan event telemetri `Retrieval:Tier2Fallback` lengkap dengan `traceId`, `query`, dan `sufficiency` Tier 1.
* Menetapkan batas timeout standar 20 detik (`TIER2_FALLBACK_TIMEOUT_MS`) dengan disclaimer fallback jika inferensi gagal.

### B. Integrasi Transisi di `RetrievalOrchestrator.js`
* File: `frontend/src/core/runtime/services/RetrievalOrchestrator.js`
* Mengaktifkan percabangan otomatis: jika `tier1Result.sufficiency < 0.4`, 0 chunks, atau error/timeout, orkestrator secara mulus beralih ke `InternalKnowledgeFallbackService`.
* Memperbarui `formatAsContext()` agar merender header konteks sesuai jenis sumber secara transparan:
  * Tier 1: `--- Konteks {i+1} [Sumber: Lokal — {source_url}] ---`
  * Tier 2: `--- Konteks {i+1} [Sumber: Pengetahuan internal model] ---`
  * Tier 3: `--- Konteks {i+1} [Sumber: Web — {source_url}, akurasi tidak terverifikasi] ---`

### C. Registrasi Runtime di `Kernel.js`
* File: `frontend/src/core/runtime/Kernel.js`
* Mendaftarkan `InternalKnowledgeFallbackService` pada Phase 3 sequence bootstrap sebelum `RetrievalOrchestrator`.

### D. Penyelarasan Verification Engine (`CHECK_002B`)
* File: `supabase/functions/agent-process/lib/verification/verification_engine.ts`
* Menambahkan `CHECK_002B_INTERNAL_KNOWLEDGE_DISCLAIMER` pada profile ENGINEERING dan PERSONAL.
* Memvalidasi kehadiran frasa pengakuan (`/pengetahuan umum|pengetahuan internal|tidak ditemukan di dokumen|bawaan model/i`) ketika `source_type === 'llm_internal'` aktif. Jika pengakuan absen, verifikasi mengeluarkan `WARN` (non-blocking) untuk menjaga transparansi faktual.

---

## 3. Hasil Verifikasi

1. **Frontend Build:** `npm run build` berhasil 100% (`✓ 2659 modules transformed`, `exit code 0`).
2. **Kontrak Data Seragam:** Objek kembalian Tier 2 memenuhi format standar `chunks`, `strategy: 'llm_internal_fallback'`, `sufficiency: 0.35`, `tier: 2`.
3. **Observabilitas:** `traceId` dari request diteruskan ke event `Retrieval:Tier2Fallback` dan `cost_ledger`.
