# ADR-0016: Terminal Command Isolation — Roadmap Bertahap (Belum Diimplementasi)

**Date:** 2026-08-23
**Status:** Proposed (dokumentasi niat, bukan kode aktif)
**Phase:** Pra-Fase — dicatat untuk referensi masa depan

## Context

`run-terminal-command` (di `frontend/electron/main.cjs`) mengeksekusi command lewat `exec()` langsung ke sistem host, dengan proteksi berlapis: blocklist pattern (Windows + Unix), deteksi command chaining sederhana, dan approval dialog native OS. Ini **filter di pintu masuk** — command yang lolos filter tetap punya akses penuh ke filesystem/proses host, karena tidak berjalan di lingkungan terisolasi (sandbox/container).

Pertanyaan yang muncul saat diskusi arsitektur: apakah perlu menambah lapisan isolasi eksekusi (Docker, VM ringan seperti Firecracker, atau OS-level sandboxing seperti bubblewrap/firejail) supaya command yang lolos filter tetap tidak bisa merusak sistem host secara luas?

**Fase pengembangan saat ini:** kemampuan command execution di Mode Asisten/Engineer masih tahap desain, belum punya data pemakaian nyata (belum ada riwayat command yang benar-benar sering dijalankan user). Membangun sandbox penuh sekarang berarti mendesain untuk asumsi, bukan kebutuhan terverifikasi.

## Decision

**Tidak membangun sandbox (Docker/VM/OS-level isolation) sekarang.** Alasan:

1. **Architecture over Implementation** — sandbox penuh adalah investasi besar (kompleksitas setup, dependency tambahan seperti Docker Desktop, beban device) untuk problem yang belum terbukti terjadi di praktik. Ini pola yang sama dengan keputusan menunda MessageCarrier/multi-agent orchestrator (ADR terkait — ditunda sampai kebutuhan nyata muncul).
2. **Bertentangan dengan Borrowed CPU Principle & minimal-friction** — Docker/VM menambah beban instalasi signifikan, terutama untuk target device terbatas (device kosong/Raspberry Pi yang sedang dieksplorasi untuk deployment Mamet Ecosystem). Menambah dependency berat sekarang mengorbankan fleksibilitas instalasi untuk semua user, demi kasus yang belum tentu sering terjadi.
3. **Proteksi lapis pertama sudah memadai untuk fase ini** — blocklist (Windows + Unix), deteksi chaining, dan approval dialog eksplisit sudah menutup risiko paling umum (command destruktif yang dikenali, eksekusi tanpa sepengetahuan user).

**Yang dilakukan sebagai gantinya:** menjaga titik ekstensi tetap terbuka, supaya sandbox bisa ditambahkan nanti tanpa breaking change:
- `run-terminal-command` menerima parameter `reasoning` opsional (kontrak sudah dirancang bisa diperluas, misal `sandboxMode` di masa depan, tanpa mengubah pemanggil yang sudah ada).
- `checkBlockedCommand()` sebagai titik ekstensi terpisah dari eksekusi — layer sandbox nanti bisa ditambahkan **setelah** blocklist check, bukan menggantikan seluruh alur.

## Roadmap bertahap (dicatat, bukan dijadwalkan)

| Tahap | Trigger untuk lanjut | Opsi teknis |
|---|---|---|
| **1 — Sekarang** | Berlaku selama belum ada bukti kebutuhan lebih | Blocklist pattern + chaining detection + approval dialog (sudah berjalan) |
| **2 — Kalau ada pola pemakaian nyata** | Setelah Mode Engineer/Asisten dipakai reguler, terlihat command apa saja yang sering dijalankan | Evaluasi ulang: apakah 90%+ command tetap command ringan (git, npm, baca file)? Jika ya, Tahap 1 tetap cukup. |
| **3 — Kalau terbukti perlu isolasi** | Command kompleks/berisiko jadi pola reguler, bukan kasus jarang | Docker container per-eksekusi (opsional, tergantung kapasitas device); atau OS-level sandboxing (bubblewrap/firejail di Linux) sebagai alternatif lebih ringan dari container penuh |
| **4 — Kalau target device beragam (device kuat vs device kosong/Pi)** | Setelah roadmap OS mini (Buildroot) berjalan | Sandbox dibuat **opsional per-device** — device kuat pakai isolasi penuh, device terbatas tetap pakai proteksi ringan Tahap 1 |

## Consequences

- Command terminal tetap berjalan di host langsung untuk saat ini — proteksi mengandalkan blocklist + approval user, bukan isolasi teknis.
- Keputusan ini **wajib ditinjau ulang** begitu ada data pemakaian nyata (bukan berdasarkan waktu, tapi berdasarkan bukti kebutuhan).
- Tidak ada dependency baru (Docker dll) yang ditambahkan ke persyaratan instalasi Mamet Ecosystem akibat keputusan ini.
- ADR ini didokumentasikan sebagai catatan arsitektur murni — tidak ada kode sandbox yang perlu di-maintain sampai Tahap 3 benar-benar dimulai.
