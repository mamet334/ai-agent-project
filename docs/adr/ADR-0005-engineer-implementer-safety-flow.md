# ADR-0005: Engineer as Implementer & Safety Flow

**Date:** 2026-06-27
**Status:** Accepted
**Phase:** Phase 7

## Context

Dalam peran sebagai **Implementer**, Engineer tidak hanya menganalisis masalah melainkan mengubah *source code*. Jika AI diberikan kewenangan menulis (*apply*) kode secara otomatis tanpa verifikasi, risiko terjadinya kemunduran (regressions), pelanggaran arsitektur, atau rusaknya ketergantungan (dependencies) menjadi sangat tinggi.

## Decision

Mamet Engineer akan mengadopsi alur keselamatan (*Safety Flow*) ketat sebelum kode benar-benar ditulis ke sistem. Alur ini terdiri dari 4 langkah berurutan:

1. **Generate Patch:** AI membuat blok kode perubahan berdasarkan konteks (Task & ADR).
2. **Self Verification:** AI WAJIB memverifikasi blok kode yang dibuatnya sendiri secara eksplisit di dalam tanggapan (response), mencakup 4 aspek:
   *   *Syntax Check*
   *   *Architecture Check* (Sesuai MAEF?)
   *   *Coding Rules Check*
   *   *Dependency Check*
3. **User Review:** AI berhenti di titik ini dan memberikan hasil ke pengguna.
4. **Apply:** Kode hanya dieksekusi (ditulis ke file) oleh lingkungan pengguna (mis. Desktop app / pengguna langsung) *setelah* tinjauan tuntas.

## Consequences

*   AI dalam Edge Function dilarang keras mencoba mengeksekusi *write file* sendiri tanpa konfirmasi berlapis, sekalipun ia memiliki alat (tools) untuk itu. AI bertindak sebagai *generator* dan *verifier*.
*   Output dari AI akan selalu transparan; setiap blok kode selalu diikuti oleh ceklis verifikasi internalnya sendiri sebelum pengguna mengimplementasikannya.
*   Penerapan (Apply) dikembalikan sepenuhnya kepada kendali antarmuka klien atau sistem OS pengguna.
