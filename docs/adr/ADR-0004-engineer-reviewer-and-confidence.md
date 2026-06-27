# ADR-0004: Engineer as Reviewer & Engineering Confidence

**Date:** 2026-06-27
**Status:** Accepted
**Phase:** Phase 6

## Context

Dalam mewujudkan Visi "AI Operating System", Mamet Engineer harus bisa bertindak tidak hanya sebagai asisten yang pasif, melainkan sebagai **Reviewer** yang memahami secara holistik kode dan keputusan proyek (ADR, Aturan, Bug History). Selain itu, untuk mencegah halusinasi AI atau *"blind compliance"* (kepatuhan membabi-buta), Engineer memerlukan parameter penilai kejujuran dalam beropini.

## Decision

1. **Phase 6 - Scoped Engineer Review:**
   Review bukan sekadar membaca keseluruhan Project Memory. Engineer menggunakan alur berbasis ruang lingkup:
   ```
   Task → Affected Files → Git Diff → Relevant ADR → Relevant Coding Rules
   ```
   Empat pilar wajib — jika salah satu tidak ada, Engineer **harus meminta** sebelum melanjutkan:
   *   **[1] Task:** Apa tujuan perubahan ini?
   *   **[2] Git Diff:** Apa yang berubah secara konkret? (diberikan oleh user)
   *   **[3] ADR terkait scope:** Keputusan arsitektur mana yang mengatur scope perubahan ini?
   *   **[4] Coding Rules:** Apakah melanggar pola yang telah disepakati?

2. **Engineering Confidence — Dua Dimensi:**
   Confidence bukan skor angka tunggal. Confidence memiliki dua dimensi terpisah:
   *   **Coverage:** Sumber apa saja yang tersedia (checklist `✓/✗`).
   *   **Evidence Strength:** Seberapa kuat bukti dari sumber tersebut (`STRONG / MODERATE / WEAK`) — dengan penjelasan *mengapa*.
   
   Contoh STRONG: *"diff selaras dengan TASK-0014, diatur ADR-0004, tidak ada pelanggaran aturan."*
   Contoh WEAK: *"diff tersedia tetapi tidak ada ADR yang mengatur modul ini. Penilaian hanya berdasarkan pola umum."*
   
   Engineer wajib menyertakan blok Confidence ini **sebelum** memberikan rekomendasi apapun.

## Consequences

*   **Pencegahan Overengineering:** Tidak memerlukan CI/CD pipeline server-side yang berat. Cukup dieksekusi secara lokal atau via *Edge Function* menggunakan `appSource: engineer` yang telah otomatis memuat *Project Memory*.
*   **Transparansi Tingkat Tinggi:** User selalu tahu dari mana AI mengambil referensi untuk jawabannya.
*   **Prompt Modification:** Memerlukan pembaruan pada `system_prompt` atau *SOP* Mamet Engineer untuk mengeksplisitkan kewajiban melampirkan skor *Confidence* dan mengonsolidasi 4 pilar konteks saat diminta melakukan review.
