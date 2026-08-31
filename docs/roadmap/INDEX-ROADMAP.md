# INDEX — Peta Dokumen Roadmap Mamet OS Ecosystem

**Tujuan dokumen ini:** Titik masuk pertama untuk Antigravity (atau AI mana pun) sebelum membaca dokumen lain di folder `docs/roadmap/`. Berisi status, urutan pengerjaan, dan ringkasan tiap dokumen — bukan pengganti isi dokumen aslinya.

**Update terakhir:** 2026-08-28
**Prinsip folder ini:** Satu file, satu tanggung jawab. Dokumen ini HANYA index — jangan tambahkan detail teknis di sini, cukup rujukan ke file terkait.

---

## 1. Status Ringkas

| Dokumen | Status | Scope |
|---|---|---|
| `ASSISTANT-CAPABILITY-ROADMAP.md` | ✅ Selesai (PR#1, #2, #3, #4, #6, #7 Fase 1) — ⚠️ PR#5 parsial, PR#8 belum dikerjakan | Assistant capability, 8 PR |
| `raodmap memory governor.md` | 🔜 Siap dikerjakan — belum mulai | `MemoryGovernorService.js` (data/knowledge layer) |
| `teknis-skil-implementasi.md` | 🔜 Siap dikerjakan — menunggu PR#8 selesai dulu | `SkillGuardService`, skill loading system |
| `SPESIFIKASI-TEKNIS-MAMET-OS-v2.md` | 📋 Referensi — `SystemGovernorService.js` belum dikerjakan | Monitoring/observability daemon |
| `MAMET-AI-ROADMAP.md`, `engineer-autonomous-mode.md`, `engineer-chat-upgrade.md`, `fix-log.md`, `rencana.md`, `roadmap-lanjutan.md` | 📋 Belum direview ulang dalam sesi ini | — |

---

## 2. Urutan Pengerjaan yang Disepakati

```
[SELESAI] PR#1, PR#2, PR#3, PR#4, PR#6, PR#7 Fase 1 (Assistant Capability)
    ↓
[BERIKUTNYA] MemoryGovernorService — Fase 1 (raodmap memory governor.md)
    ↓
[LALU] PR#8 — Linux-style Dispatch (RequestClassifierService, LookupHandler, ConversationHandler)
    → belum ada dokumen TECH-SPEC terpisah untuk PR#8, masih perlu disusun
    ↓
[LALU] Skill Implementation (teknis-skil-implementasi.md)
    → bergantung pada RequestClassifierService dari PR#8 (lihat Section 3.2 dokumen tsb)
    ↓
[BELUM DIJADWALKAN] SystemGovernorService (SPESIFIKASI-TEKNIS-MAMET-OS-v2.md)
    → independen, bisa disisipkan kapan saja karena tidak bergantung pada item di atas,
      tapi didahulukan yang lain karena urgensi lebih tinggi (fondasi Assistant & Memory dulu)
```

**Alasan urutan:** MemoryGovernorService paling independen sehingga dikerjakan lebih dulu. PR#8 harus ada sebelum Skill Implementation karena skill matching (Stage 2) secara eksplisit bergantung pada `RequestClassifierService`. Mengerjakan Skill Implementation sebelum PR#8 akan memaksa asumsi/stub yang berisiko rombak ulang.

---

## 3. Catatan Disambiguasi Penting

**`cognitiveMemoryGovernor.ts` (PR#2, sudah aktif) ≠ `MemoryGovernorService.js` (Fase 1, belum dibuat).**
Nama mirip, tujuan beda. Detail lengkap ada di catatan disambiguasi di awal file `raodmap memory governor.md` — WAJIB dibaca sebelum eksekusi Fase 1 memory governor, supaya tidak dianggap sudah selesai atau tumpang tindih.

**Tiga "governor/guard" service berbeda, saling independen tapi saling mereferensikan pola desain:**
- `SystemGovernorService.js` — monitoring/anomali kode (escalation ladder 4 level)
- `MemoryGovernorService.js` — integritas data/ringkasan (Golden Source, retrieval 2-tahap)
- `SkillGuardService` (rencana) — validasi keamanan skill sebelum aktif

Jangan gabungkan ketiganya jadi satu file. One file, one responsibility.

---

## 4. Prinsip Payung yang Berlaku di Semua Dokumen

- **Owner Sovereignty** — semua aksi otomatis yang berdampak signifikan wajib eskalasi/konfirmasi eksplisit ke Owner, tidak ada auto-resolve/auto-approve untuk keputusan berisiko.
- **No Silent State Transition** — setiap perubahan status otomatis (approve, reject, expire, archive) wajib tercatat di changelog/audit log.
- **One File, One Responsibility** — berlaku untuk kode maupun dokumen (termasuk dokumen ini sendiri).
- **Soft-delete sebelum hard-delete** — pola trash bin konsisten dipakai di MemoryGovernorService dan Skill retention; hard-delete hanya via command eksplisit Owner.

---

## 5. Cara Update Dokumen Ini

Setiap kali sebuah dokumen di folder ini selesai dikerjakan (Exit Criteria terpenuhi) atau status berubah, update tabel di Bagian 1 dan pindahkan progress marker di Bagian 2. Jangan biarkan index ini basi — index yang salah lebih berbahaya daripada tidak ada index.
