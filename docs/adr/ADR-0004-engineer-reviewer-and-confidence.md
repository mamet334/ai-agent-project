# ADR-0004: Engineer as Reviewer & Engineering Confidence

**Date:** 2026-06-27
**Status:** Accepted
**Phase:** Phase 6

## Context

Dalam mewujudkan Visi "AI Operating System", Mamet Engineer harus bisa bertindak tidak hanya sebagai asisten yang pasif, melainkan sebagai **Reviewer** yang memahami secara holistik kode dan keputusan proyek (ADR, Aturan, Bug History). Selain itu, untuk mencegah halusinasi AI atau *"blind compliance"* (kepatuhan membabi-buta), Engineer memerlukan parameter penilai kejujuran dalam beropini.

## Decision

1. **Phase 6 - Engineer Reviewer:**
   Mamet Engineer akan diekstensi kemampuannya untuk melakukan *Code Review*. Namun, tidak seperti AI checker biasa yang hanya melihat `git diff`, Mamet Engineer diwajibkan untuk mengumpulkan empat pilar konteks sebelum memberikan tinjauan:
   *   **Task:** Apa tujuan perubahan?
   *   **Git Diff:** Apa yang berubah?
   *   **ADR Terkait:** Keputusan arsitektur apa yang menaungi perubahan ini?
   *   **Coding Rules:** Apakah melanggar aturan sintaks atau pola yang telah disepakati?

2. **Engineering Confidence (Filter Kejujuran):**
   Setiap kali Engineer memberikan rekomendasi (review, solusi, atau usulan tugas), ia **wajib** mendeklarasikan skor *Confidence* (Misal: 95%). 
   *   Skor ini harus dijustifikasi berdasarkan kelengkapan konteks yang dibaca (seperti: "Membaca TASK", "Membaca ADR", "Membaca Repository").
   *   Jika data tidak cukup, Engineer wajib memberikan *Confidence* rendah (Misal: 42%) dengan alasan ketidaktahuan, bukan mencoba menebak.

## Consequences

*   **Pencegahan Overengineering:** Tidak memerlukan CI/CD pipeline server-side yang berat. Cukup dieksekusi secara lokal atau via *Edge Function* menggunakan `appSource: engineer` yang telah otomatis memuat *Project Memory*.
*   **Transparansi Tingkat Tinggi:** User selalu tahu dari mana AI mengambil referensi untuk jawabannya.
*   **Prompt Modification:** Memerlukan pembaruan pada `system_prompt` atau *SOP* Mamet Engineer untuk mengeksplisitkan kewajiban melampirkan skor *Confidence* dan mengonsolidasi 4 pilar konteks saat diminta melakukan review.
