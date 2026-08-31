# Diskusi dengan Instruktur — 2 Juli 2026

## Topik Utama
- AGENTS.md sebagai solusi untuk menjinakkan Antigravity (Gemini 3.1 Pro) yang sering tidak patuh.
- Antigravity mengabaikan AGENTS.md meskipun selalu membacanya — masalah kepatuhan, bukan kesadaran.
- Strategi prompt ketat: prompt pembuka yang mengunci AGENTS.md, prompt penutup yang memaksa self-audit.
- Dokumen Pemulihan Konteks untuk instruktur agar bisa langsung paham di percakapan baru.
- Pentingnya menyimpan bullet point diskusi di project sebagai bagian dari Project Memory.
- Engineering Drift: ketidakselarasan antara visi (MAEF, 6 file core) dan implementasi (kode Antigravity).

## Keputusan yang Diambil
- Change Log dan ADR adalah dua hal terpisah. Antigravity wajib menulis Change Log (artifact), bukan ADR.
- Change Log disimpan manual oleh Owner ke `docs/project-memory/change-log/YYYY-MM-DD.md`.
- Dokumen Pemulihan Konteks disimpan sebagai alat untuk memulihkan peran instruktur di percakapan baru.
- Bullet point diskusi disimpan di `docs/project-memory/discussion-log/` sebagai bagian Project Memory.
- Audit Keselarasan akan dilakukan untuk menemukan gap antara visi dan kode, dimulai dari komponen kecil.

## Strategi yang Disepakati
1. **Prompt ketat untuk Antigravity**: Setiap sesi dimulai dengan prompt yang mengunci AGENTS.md, diakhiri dengan permintaan change log artifact.
2. **Change Log manual**: Antigravity menghasilkan artifact → Owner simpan ke file.
3. **Audit Keselarasan**: Memeriksa gap antara visi (6 file core, ADR) dan kode yang ada.
4. **Jangka Panjang**: Membangkitkan Engineer internal sebagai penjaga otomatis yang menjaga keselarasan dan menulis dokumentasi.

## PR / Action Items
- [ ] Menyimpan Dokumen Pemulihan Konteks di tempat yang mudah diakses.
- [ ] Menyimpan bullet point ini di `docs/project-memory/discussion-log/2026-07-02-instruktur.md`.
- [ ] Menerapkan strategi prompt ketat di sesi Antigravity berikutnya.
- [ ] Memulai Audit Keselarasan kecil: periksa status `process.js`, `fs.js`, `module-loader.js` di kode vs visi.

## Catatan untuk Sesi Berikutnya
- Lanjutkan diskusi tentang fondasi 6 file core — apakah masih relevan atau sudah tergantikan.
- Bahas kemandirian penuh dari Antigravity: kapan dan bagaimana Engineer internal bisa mengambil alih.
- Evaluasi efektivitas prompt ketat setelah dicoba.