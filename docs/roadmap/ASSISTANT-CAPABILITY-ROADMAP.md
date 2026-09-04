# Roadmap: Mamet AI — Assistant Capability Hardening & Modularization

Status: PR#1–#5, PR#7 Fase 1 ✅ Selesai — PR#6 ⚡ Implemented (Build Pass, Menunggu Live Verification) — PR#7 Fase 2 Ditunda
Owner: Mamet AI Project
Scope: Assistant Capability (bukan Engineer Capability)
Prinsip Payung: Linux-Inspired Architecture — "Ringan, Bebas, dan Tangguh seperti Linux"
Tanggal Disusun: 2026-08-24

---

## 0. Latar Belakang

Dokumen ini merangkum hasil diskusi desain antara Owner dan Claude (Anthropic) mengenai
penguatan kapabilitas **Assistant** di Mamet OS Ecosystem. Berbeda dengan kapabilitas
**Engineer** (yang sudah punya `engineer.js` dan proses kerja terdefinisi), kapabilitas
Assistant saat ini **belum punya rumah arsitektur formal** — logikanya masih tersebar di:

- `frontend/src/components/workbench/ConversationEngine.jsx` (1443 baris, mencampur UI + business logic)
- `frontend/src/components/AIAgent/hooks/useDesktopPreExec.js`
- `frontend/src/components/AIAgent/hooks/useDesktopInterceptor.js`
- `lib/shortTermMemory.ts`, `lib/contextUnifier.ts`, `lib/cognitiveMemoryGovernor.ts`
- `supabase/functions/rag-process/index.ts`

Ditemukan juga bahwa `cognitiveMemoryGovernor.ts` saat ini **dinonaktifkan**
(`LEGACY_COGNITION_ENABLED = false`) karena proyek sempat pindah fokus ke Engineer
self-maintenance sebelum sistem `truth_score`-nya sempat diselesaikan.

Dokumen ini adalah **spesifikasi desain**, bukan kode. Tujuannya jadi dasar kerja
sebelum implementasi (patch/PR) dimulai, sesuai pola kerja proyek ini (ADR → Task →
Implementasi → Project Memory).

## 0.1 Prinsip Payung — Linux-Inspired Architecture

Semua PR dalam dokumen ini tunduk pada satu prinsip desain:

> **Satu file, satu tanggung jawab (Single Responsibility).** Konsisten dari level
> fungsi kecil sampai level service besar. Modul harus ringan, mudah diuji terpisah,
> dan mudah di-maintain tanpa merembet ke bagian lain.

Padanan konsep dengan Linux:
- `Kernel.js` = init/systemd (boot berjenjang per-Phase)
- Service terdaftar (`Engineer`, `MemoryService`, dst) = daemon
- `AssistantService` (PR#3) = daemon baru yang perlu ditambahkan
- Workspace boundary (PR#1) = permission model (mirip user/group Linux)
- Audit log (PR#1) = syslog

## 0.2 Prinsip Owner Sovereignty

Seluruh desain keamanan dalam dokumen ini berpegang pada prinsip bahwa **keputusan
akhir selalu ada di tangan Owner**, bukan diserahkan ke penilaian otonom AI. Ini
prinsip yang disengaja membedakan arah Mamet AI dari agent yang bersifat lebih
otonom (misalnya Hermes Agent) — Mamet AI dirancang untuk **dipercaya bertahap**
lewat kontrol eksplisit, bukan otonomi penuh sejak awal.

## 0.3 Daftar Ringkas PR

| # | Judul | Prioritas | Prasyarat |
|---|---|---|---|
| PR#3 | Ekstraksi `AssistantService` | **Fondasi — dikerjakan pertama** | - |
| PR#1 | Safe Command Execution (Whitelist + Workspace Boundary + Audit Log) | Tinggi | PR#3 |
| PR#2 | Reaktivasi Cognitive Memory Governor | Menengah | PR#3 |
| PR#4 | Atribusi Sumber di RAG (`source_url`, `source_type`) | Menengah | - |
| PR#5 | Adaptive Retrieval Strategy | Menengah | PR#4 |
| PR#6 | Efisiensi Token (Prompt Caching + Delegasi Context) — ⚡ **IMPLEMENTED** | Menengah | PR#3 |
| PR#7 | Module Discovery Bertahap | Rendah (Fase 2 ditunda) | - |

Urutan pengerjaan yang disarankan: **PR#3 → PR#1 → PR#4 → PR#5 → PR#2 → PR#6 → PR#7 (Fase 1 saja)**.
PR#3 didahulukan karena PR#1, PR#2, dan PR#6 butuh "rumah" resmi untuk hidup di dalamnya.

---

## PR#3 — Ekstraksi `AssistantService`

### Masalah
`ConversationEngine.jsx` (1443 baris) adalah *God Component* — mencampur:
- State management (20+ `useState`)
- Business logic (`handleSend` ±420 baris, `handleRunCommand`, `saveChatToDB`, `handleRollback`)
- Rendering UI (JSX)
- Akses langsung ke `kernel` dan `supabase` dari dalam komponen React

Ini membuat logic Assistant tidak bisa diuji terpisah, sulit dipelihara, dan setiap
perubahan kecil berisiko merembet ke bagian lain.

### Tujuan
Memisahkan seluruh **logic** (bukan UI) dari `ConversationEngine.jsx` ke dalam
`AssistantService` baru, mengikuti pola `Engineer` (`frontend/src/core/runtime/services/engineer.js`)
yang sudah terdaftar resmi di `Kernel.js`.

### Cakupan Tanggung Jawab `AssistantService`

| Fungsi lama di `ConversationEngine.jsx` | Pindah ke |
|---|---|
| `handleSend` (proses pesan, panggil AI, urus memory) | `AssistantService.processMessage()` |
| `handleRunCommand` (eksekusi command) | `AssistantService` + safe command layer (PR#1) |
| `saveChatToDB` (simpan riwayat) | `AssistantService` / `MemoryService` |
| Memory retrieval (activeMemories, lastMemoryQuery) | Panggil `contextUnifier.ts` + `cognitiveMemoryGovernor.ts` (PR#2) |
| Sisa di komponen | `useState` untuk render UI, JSX saja — jadi "tipis", cuma panggil `AssistantService` dan tampilkan hasil |

### Integrasi ke Kernel
`AssistantService` didaftarkan sebagai service resmi di `Kernel.js`, konsisten dengan
Phase boot yang sudah ada (Phase 3: Core Capability Services Init), sejajar dengan
`Engineer`, `MemoryService`, `AgentOrchestratorService`.

### Exit Criteria
- `ConversationEngine.jsx` tidak lagi memanggil `kernel`/`supabase` secara langsung untuk logic bisnis.
- Semua fungsi bisnis di atas berpindah dan bisa dipanggil/diuji independen dari komponen React.
- `AssistantService` terdaftar dan ter-boot di `Kernel.js` tanpa mengganggu Phase lain.
- Tidak ada regresi fungsional pada chat yang sudah berjalan saat ini.

### Catatan
Ini adalah **prasyarat arsitektur** untuk PR#1, PR#2, dan PR#6 — ketiganya butuh
tempat resmi untuk terintegrasi, bukan ditempel lagi ke komponen UI.

---

## PR#1 — Safe Command Execution

### Masalah
Sistem eksekusi command saat ini (`main.cjs`, handler `run-terminal-command`) memakai
pendekatan **blocklist** (menolak pattern tertentu seperti `format`, `del /s`, dsb).
Blocklist mudah di-bypass — misalnya `Remove-Item -Recurse` (PowerShell) tidak
tertangkap regex yang menyasar `del /s` versi CMD. Selain itu:
- Belum ada pembatasan **workspace** — command berpotensi menjangkau seluruh sistem file.
- Belum ada **audit trail** terstruktur untuk aksi yang dijalankan AI.

### Tujuan
Mengganti/memperkuat pendekatan menjadi **whitelist-first**, dengan batas ruang gerak
yang jelas (workspace), dan setiap aksi berisiko tercatat sebagai jejak audit.

### Desain yang Disepakati

**1. Eksekusi command**
- Tetap **selalu minta konfirmasi user** sebelum eksekusi (mempertahankan pola dialog konfirmasi yang sudah ada di `main.cjs`).
- Command destruktif (`delete`, `overwrite`, dsb) memakai **dialog yang berbeda dan lebih tegas** dibanding command biasa — secara visual/interaksi harus terasa berbeda tingkat risikonya (misal butuh langkah konfirmasi tambahan).

**2. Scope / Workspace Boundary**
- Ruang gerak utama dibatasi ke **satu folder workspace** yang dipilih user (lewat mekanisme `select-folder` yang sudah ada).
- Operasi baca/tulis/hapus **di dalam workspace** → tunduk pada dialog konfirmasi standar.
- Operasi baca/tulis/hapus **di luar workspace** → wajib dialog **"izinkan sekali"**, berlaku hanya untuk instance request itu saja — **tidak di-cache**, tidak berlaku otomatis untuk request berikutnya meski ke folder yang sama.

**3. Scan / Pencarian File (Read-only)**
- Operasi **list/scan nama file** (bukan baca isi, bukan ubah, bukan hapus) diperbolehkan **lebih luas** dari batas workspace, **tanpa perlu dialog konfirmasi** — karena risikonya rendah (tidak mengubah apa pun).
- Jika hasil scan menemukan beberapa file dengan nama serupa di lokasi berbeda, sistem **menampilkan semua kandidat** (bukan menebak/memilih otomatis yang "paling relevan"). Setiap kandidat wajib menyertakan minimal:
  - Nama file
  - Path lengkap
  - Ukuran file
  - Tanggal modifikasi terakhir
- User yang memilih secara manual file mana yang dimaksud.

**4. Command Registry (bukan raw shell string)**
Alih-alih AI mengirim string command bebas untuk di-`exec()` langsung, operasi dasar
sebaiknya berupa **daftar operasi terdaftar** (command registry) yang masing-masing
sudah aman secara desain, contoh kebutuhan dasar seorang asisten kerja:
- `createFolder`, `deleteFolder` (dengan konfirmasi tegas)
- `listFiles`, `readFile`, `writeFile`
- `moveFile`, `copyFile`, `renameFile`
- `zipFolder`, `unzip`
- (Opsional, dibatasi ketat) `runScript` — hanya untuk script yang sudah melalui validasi, bukan command shell bebas

Pendekatan ini secara struktural lebih aman dibanding blocklist karena defaultnya
**menolak semua, kecuali yang terdaftar** — bukan **mengizinkan semua, kecuali yang dilarang**.

**5. Audit Trail (Log Aksi)**

Disimpan di **Supabase**, mengikuti pola `docs/project-memory/changelog/` yang sudah
ada di proyek ini (bukan sistem log terpisah). Formatnya **naratif**, bukan sekadar
baris teknis — tujuannya supaya log ini bisa "dimengerti" kalau dibaca ulang oleh AI
di masa depan, bukan cuma data mentah untuk manusia.

Field minimal yang wajib dicatat per entri log:
- **Konteks permintaan** — apa yang diminta user
- **Keputusan yang diambil AI** — alasan aksi ini dipilih (misal: "ditemukan 3 file mirip, user pilih yang di Downloads")
- **Aksi teknis** — command/operasi persis yang dijalankan, target path, timestamp
- **Hasil** — berhasil / gagal / ditolak user, beserta alasan jika gagal/ditolak
- **Status keamanan** — di dalam/luar workspace, destruktif atau tidak

Wajib dicatat untuk: semua aksi di luar workspace, dan semua aksi destruktif (delete/overwrite).
Operasi read-only ringan (list/scan) tidak wajib dicatat detail, cukup ringkas jika perlu.

Level ambisi: log kronologis terstruktur dulu — **bukan** sistem semantic search/embedding
di tahap awal ini (lihat bagian "Catatan Desain" di bawah).

### Exit Criteria
- Tidak ada lagi eksekusi command dari string mentah AI langsung ke `exec()` tanpa melalui command registry.
- Command di luar workspace tidak bisa berjalan tanpa dialog "izinkan sekali" yang eksplisit.
- Command destruktif memiliki dialog yang jelas berbeda dari command biasa.
- Setiap aksi di luar workspace / destruktif tercatat di Supabase dengan field lengkap di atas.

### Catatan Desain (Bertahap, Anti Over-Engineering)
Disepakati untuk **tidak** membangun sistem semantic search/embedding atas log ini
di tahap awal — cukup log kronologis yang solid dan mudah dibaca dulu. Peningkatan
(misal AI membaca pola log lama sebelum bertindak, atau ringkasan mingguan otomatis)
baru dipertimbangkan **setelah** pola pemakaian nyata terlihat, bukan dibangun di muka
tanpa bukti kebutuhan.

---

## PR#2 — Reaktivasi Cognitive Memory Governor

### Status Saat Ini
`lib/cognitiveMemoryGovernor.ts` (97 baris) sudah punya kerangka logika validasi
memory yang cukup matang secara desain:
- **`truth_score`** — skor kebenaran per memory
- **Hallucination risk detection** — threshold (`truth_score < 0.5` → reject)
- **Conflict resolution** — aturan tegas "NO STRING MERGING" saat dua memory bertentangan; salah satu jadi "aktif", lainnya "latent"
- **Behavior mismatch penalty** — mempertimbangkan kecocokan gaya respons dengan preferensi user

Namun saat ini **seluruh logika ini di-bypass**:

```typescript
export const LEGACY_COGNITION_ENABLED = false;
```

Ketika `false`, fungsi langsung mengembalikan `{ status: "ALLOW", ... }` apa pun
kondisinya — sehingga secara efektif **tidak ada validasi kebenaran memory yang
benar-benar berjalan** saat ini.

### Akar Masalah
`truth_score` — variabel paling penting dalam sistem ini — **belum punya sumber
logika yang jelas**. Governor sempat dibangun untuk tujuan agar Assistant benar-benar
"paham makna" dari memory yang dipakai (bukan sekadar menyimpan data mentah tanpa
validasi), tapi pekerjaan ini terhenti saat fokus proyek berpindah ke Engineer
self-maintenance sebelum logika pengisian `truth_score` sempat diselesaikan.

### Tujuan
1. Menentukan **dari mana `truth_score` dihitung/diperoleh** — ini prasyarat mutlak sebelum governor bisa diaktifkan ulang dengan aman. Opsi yang perlu dievaluasi saat implementasi:
   - Dihitung otomatis dari sumber memory (misal: pernyataan langsung dari user vs kesimpulan AI vs hasil web search)
   - Dipengaruhi oleh frekuensi konfirmasi/pengulangan suatu fakta
   - Kombinasi keduanya
2. Mengaktifkan kembali `LEGACY_COGNITION_ENABLED` **secara bertahap** — disarankan mulai dengan threshold yang lebih longgar terlebih dahulu, baru diperketat setelah teruji, bukan langsung dinyalakan penuh di awal (selaras dengan prinsip anti over-engineering yang sama seperti PR#1).

### Ketergantungan
- Membutuhkan `AssistantService` (PR#3) sebagai tempat governor ini dipanggil dalam alur pemrosesan pesan.

### Exit Criteria
- `truth_score` memiliki sumber logika yang terdefinisi dan terdokumentasi (bukan placeholder).
- `LEGACY_COGNITION_ENABLED` diaktifkan dengan threshold awal yang telah diuji tidak mengganggu alur percakapan wajar secara berlebihan (tidak banyak false-reject).
- Ada mekanisme observasi (log/metric) untuk memantau seberapa sering REJECT/REWRITE terjadi setelah diaktifkan, agar threshold bisa disesuaikan berdasarkan data nyata.

---

## PR#4 — Atribusi Sumber di RAG

### Masalah
Skema RAG saat ini (`supabase/functions/rag-process/index.ts`, tabel `documents` /
`document_chunks`) sudah memiliki chunking semantik-aware yang baik (potong di batas
kalimat/baris, dengan overlap 250 karakter — lihat `vector_utils.ts`), namun **tidak
memiliki field untuk menyimpan sumber asal** (URL/referensi) dari suatu dokumen.

Ini menjadi masalah khusus untuk alur kerja `webSearchTool` (lihat juga bagian
"Fitur Kerja Assistant" di dokumen roadmap terkait) yang disepakati sebagai berikut:

- Hasil web search **default dipakai untuk menjawab saat itu saja** ("jawab lalu
  selesai") — tidak otomatis disimpan ke RAG, karena LLM sudah punya basis pengetahuan
  luas dari training; web search hanya pelengkap referensi terkini.
- **Hanya atas perintah eksplisit user** (misal: "catat ke pengetahuan") hasil tersebut
  disimpan permanen ke Knowledge RAG — user adalah gerbang validasi, bukan sistem yang
  menilai sendiri kelayakan suatu informasi.
- Ketika disimpan, yang tercatat adalah **keduanya sekaligus**: (a) sumber asli
  (link + kutipan relevan) dan (b) ringkasan. Ini untuk mencegah *lossy compounding*
  ("ringkasan dari ringkasan") — setiap ringkasan baru harus selalu dibuat dari sumber
  asli, bukan dari ringkasan sebelumnya yang sudah terproses berulang kali, agar makna
  tidak terdistorsi secara bertahap seperti efek "telepon rusak".

### Tujuan
Menambahkan kolom atribusi sumber ke skema `documents` dan/atau `document_chunks`:
- `source_url` — tautan asal informasi (nullable, untuk dokumen yang memang tidak berasal dari web)
- `source_type` — enum sederhana, misal: `web_search`, `user_upload`, `manual_entry`, dll
- (Opsional, dipertimbangkan saat implementasi) `retrieved_at` — kapan informasi ini diambil, penting untuk topik yang sifatnya cepat basi (harga, berita) dibanding topik stabil (definisi, konsep dasar)

### Exit Criteria
- Skema `documents`/`document_chunks` memiliki field atribusi sumber di atas.
- Alur `rag-process` yang sudah ada tetap berfungsi tanpa regresi untuk dokumen yang tidak memiliki `source_url` (misal upload manual).
- Dokumen yang berasal dari `webSearchTool` dan disimpan atas perintah user, tercatat lengkap dengan sumber aslinya.

### Ketergantungan
Menjadi prasyarat untuk PR#5, karena strategi retrieval adaptif butuh cara membedakan
chunk-chunk yang berasal dari dokumen/sumber yang sama.

---

## PR#5 — Adaptive Retrieval Strategy

### Masalah
Berdasarkan pengalaman langsung Owner: ketika sumber dokumen berukuran besar, retrieval
RAG saat ini hanya mengambil sepotong chunk (top-K berdasarkan similarity vektor),
sehingga jawaban yang dihasilkan **tidak lengkap** — bagian penting yang seharusnya
melengkapi jawaban bisa saja berada di chunk lain yang skornya tidak masuk top-K.

Ini adalah masalah retrieval strategy, bukan masalah kualitas embedding (embedding dan
chunking yang ada saat ini sudah cukup baik).

Kasus yang perlu ditangani ada **dua jenis**, dan keduanya sama-sama relevan untuk
beban kerja Assistant ke depan:
- **Kasus A** — satu dokumen berukuran besar (misal satu artikel panjang)
- **Kasus B** — banyak dokumen berbeda tentang topik yang sama (misal gabungan beberapa hasil web search)

### Desain yang Disepakati

**Deteksi otomatis Kasus A vs B**, berdasarkan hasil similarity search awal:
- Jika top-K hasil didominasi banyak chunk dari **satu dokumen yang sama** → perlakukan sebagai Kasus A.
- Jika top-K hasil tersebar dari **banyak dokumen berbeda** → perlakukan sebagai Kasus B.

**Penanganan Kasus A (dokumen besar):**
1. **Neighbor expansion** — ketika sebuah chunk terpilih relevan, otomatis ikut ambil chunk-chunk tetangganya (sebelum/sesudah) dari dokumen yang sama, bukan hanya potongan yang berdiri sendiri.
2. **Fallback full-read** — jika setelah neighbor expansion jawaban masih terasa tidak lengkap, sistem kembali membaca dokumen sumber secara utuh dari tabel `documents` (bukan hanya `document_chunks`) — mirip prinsip yang sudah diterapkan Engineer lewat `RepositoryReaderService` yang membaca file lengkap, bukan cuma potongan.

**Penanganan Kasus B (multi-dokumen):**
1. Ambil top-K chunk lintas dokumen, dengan **pembatasan maksimal N chunk per dokumen** — mencegah satu sumber mendominasi hasil hanya karena skor similarity-nya kebetulan tinggi berkali-kali.
2. Prioritaskan **keberagaman sumber** dibanding similarity tertinggi semata, supaya Assistant mendapat sudut pandang dari beberapa referensi berbeda.

### Exit Criteria
- Ada layer retrieval (disarankan sebagai service/modul terpisah, konsisten dengan prinsip Linux-inspired — misal `RetrievalStrategyService`) yang dijalankan sebelum context dikirim ke reasoning engine.
- Kasus A dan B terdeteksi otomatis dan diberi perlakuan berbeda sesuai desain di atas.
- Kasus uji nyata (dokumen besar tunggal vs kumpulan hasil web search) menunjukkan jawaban yang lebih lengkap dibanding retrieval top-K polos saat ini.

### Ketergantungan
Membutuhkan PR#4 (atribusi sumber) agar sistem bisa mengenali chunk mana berasal dari dokumen/sumber yang sama.

---

## PR#6 — Efisiensi Token

### Latar Belakang
Dari studi banding terhadap Hermes Agent (Nous Research), ditemukan beberapa teknik
efisiensi token yang terbukti berdampak besar, dan **sejalan** dengan prinsip kontrol
ketat Mamet AI (murni teknik efisiensi biaya, tidak berkaitan dengan otonomi
keputusan, sehingga aman diadopsi tanpa mengubah filosofi Owner Sovereignty):

1. **Progressive disclosure** pada instruksi/skill — informasi dimuat bertingkat (nama+deskripsi singkat dulu, baru detail penuh saat benar-benar relevan), bukan memuat seluruh instruksi sekaligus ke context.
2. **Kompresi context cerdas** — histori percakapan lama diringkas secara bermakna, bukan sekadar dipotong/dibuang mentah.
3. **Prompt caching** — bagian context yang stabil (system prompt, instruksi dasar) ditandai untuk tidak diproses ulang dari nol setiap giliran bicara.
4. **Delegasi operasi berat ke context terpisah** — operasi yang menghasilkan data besar (misal scraping/web search mentah) dijalankan di luar sesi utama; hanya hasil olahan/ringkasannya yang masuk ke context utama.
5. **Retrieval selektif** — memory untuk fakta, skill untuk prosedur, dipisah jelas; buang yang duplikat/usang/tidak relevan.

### Tujuan (Scope untuk Mamet AI)
Mengadopsi poin **3** dan **4** sebagai prioritas awal, karena keduanya murni soal
efisiensi biaya/performa tanpa menyentuh keputusan otonom:

**(a) Prompt Caching**
Menandai bagian context yang tidak berubah antar giliran (system prompt, instruksi
dasar `AssistantService`) agar tidak diproses ulang penuh setiap kali — memanfaatkan
mekanisme cache breakpoint yang tersedia di provider LLM yang dipakai.

**(b) Delegasi Operasi Berat**
`webSearchTool` dan operasi berat sejenis (misal scan/analisis dokumen besar) dijalankan
di proses/context terpisah dari sesi percakapan utama. Hanya hasil ringkasan/olahan
yang dikembalikan ke `AssistantService`, bukan data mentah (misal HTML penuh hasil
scraping) yang bisa membengkakkan context secara tidak perlu.

Poin 1, 2, dan 5 dicatat sebagai referensi desain jangka panjang, tidak menjadi
prioritas implementasi awal — mengingat sebagian sudah tersentuh secara konsep oleh
PR#2 (memory vs fakta) dan `shortTermMemory.ts` yang sudah berjalan.

### Exit Criteria
- Prompt/instruksi dasar `AssistantService` memanfaatkan cache breakpoint pada provider LLM yang dipakai.
- `webSearchTool` (dan operasi berat sejenis) tidak mengirimkan data mentah besar ke context utama — hanya hasil olahan/ringkasan.
- Ada perbandingan penggunaan token sebelum/sesudah untuk memverifikasi dampak nyata (bukan asumsi).

### Ketergantungan
Membutuhkan `AssistantService` (PR#3) sebagai tempat pengaturan context/prompt terpusat.

---

## PR#7 — Module Discovery Bertahap

### Latar Belakang
Saat ini sudah ada dua fondasi parsial di codebase:
- `frontend/src/core/runtime/module-loader.js` — mekanisme **pemuatan** modul yang sudah aman (memakai `import()` dinamis bawaan JS, bukan `eval()`, sehingga terhindar dari kerentanan RCE), dengan dukungan cache dan fallback baca dari virtual filesystem.
- `frontend/src/core/runtime/DiscoveryManager.js` — **bukan** untuk deteksi modul, melainkan deteksi platform/kapabilitas environment (desktop/mobile, kamera, dsb).

**Belum ada** mekanisme yang secara otomatis men-scan, memvalidasi, dan meregistrasi
modul baru ke sistem. `ModuleLoader` tahu cara memuat modul kalau diberi path-nya,
tapi tidak ada lapisan yang menemukan modul apa saja yang tersedia.

### Tujuan
Dibangun dalam **dua fase terpisah**, sesuai tingkat risiko sumber modul:

### Fase 1 (Prioritas Sekarang) — Modul Lokal
Modul baru ditaruh manual oleh Owner di folder konvensi (misal `/modules/` atau
`/packages/`, konsisten dengan path yang sudah dirujuk `module-loader.js`).

Komponen yang dibutuhkan:
1. **Manifest per modul** — file deskriptor standar (misal `module.json`) berisi: nama, versi, dependency yang dibutuhkan, kapabilitas yang disediakan, dan tipe modul (`tool`, `capability`, `service`).
2. **Scan saat boot** — pada salah satu Phase boot `Kernel.js` yang sudah ada (Phase 3: Core Capability Services Init), sistem membaca folder konvensi, memvalidasi manifest yang ditemukan, lalu meregistrasi otomatis ke `ToolRegistryService`/`ServiceManager`.
3. **Validasi dasar** — manifest lengkap dan tidak ada konflik nama dengan modul yang sudah terdaftar, sebelum modul diaktifkan.

Karena sumber modul di Fase 1 adalah Owner sendiri, tidak diperlukan sandboxing atau
verifikasi keamanan berlapis — cukup validasi struktural.

### Fase 2 (Ditunda — Dikerjakan Hanya Jika Benar-Benar Dibutuhkan) — Modul Terunduh

Fase ini **secara eksplisit tidak dikerjakan** sampai Fase 1 stabil dan kebutuhan
mengunduh modul dari luar benar-benar nyata. Ketika saatnya tiba, desain wajib
mencakup lapisan pertahanan berikut (disepakati sebagai prasyarat minimum, mengingat
risiko supply-chain attack pada modul pihak ketiga):

1. **Sandboxing** — modul baru dijalankan dulu di lingkungan terisolasi (memanfaatkan Docker sandbox yang sudah ada di `main.cjs`, misal `runDockerSandbox`) sebelum diberi akses ke sistem utama.
2. **Permission model eksplisit** — modul wajib mendeklarasikan kebutuhan akses (filesystem, network, dsb) di manifest; user harus menyetujui secara eksplisit sebelum akses itu diberikan. Modul tidak boleh diam-diam meminta akses di luar yang dideklarasikan.
3. **Checksum/signature verification** — memastikan file yang diunduh tidak dimodifikasi di tengah jalan dan berasal dari sumber yang memang diklaim.
4. **Static analysis pra-eksekusi** — scan pola mencurigakan sebelum modul dijalankan sama sekali (memperluas pola yang sudah ada di `VerificationEngine.verifyPatchEngineering()`, misal deteksi `eval()`, `new Function()`, panggilan API vendor langsung yang tidak terduga).
5. **Karantina wajib + approval manual** — modul yang baru diunduh tidak langsung aktif. Owner diberi tahu detail permission/dependency yang diminta, dan **Owner yang memutuskan** aktivasi — selaras dengan prinsip Owner Sovereignty di seluruh dokumen ini.

### Exit Criteria (Fase 1 saja — Fase 2 tidak memiliki exit criteria sampai resmi dimulai)
- Modul baru yang ditaruh di folder konvensi dengan manifest valid otomatis terdeteksi dan teregistrasi saat boot, tanpa perlu edit `Kernel.js` manual.
- Modul dengan manifest tidak valid atau konflik nama ditolak dengan pesan yang jelas, tidak membuat boot gagal total (selaras dengan pola `SAFE_MODE`/`DEGRADED` yang sudah ada di `Kernel.js`).

---

## Lampiran A — Perbandingan Singkat dengan Hermes Agent

Dicatat sebagai referensi arah, bukan bagian dari scope implementasi:

- Hermes Agent (Nous Research) lebih condong ke **otonomi penuh** — agent mengambil keputusan dan bertindak sendiri, sudah production dan multi-platform.
- Mamet AI secara sengaja dirancang berbeda: **kontrol ketat + verifikasi bertahap** (Owner Sovereignty, konfirmasi eksplisit, truth score, workspace boundary). Ini adalah pilihan filosofis, bukan keterbatasan — konsisten dengan sikap Owner yang belum sepenuhnya mempercayai otonomi AI penuh saat ini.
- Teknik efisiensi token dari Hermes (PR#6) diadopsi karena murni soal performa/biaya, tidak bertentangan dengan prinsip kontrol ketat di atas.

## Lampiran B — Prinsip Anti Over-Engineering

Berlaku lintas semua PR di dokumen ini: mulai dari implementasi paling sederhana yang
benar-benar menyelesaikan masalah nyata, baru ditingkatkan **setelah** ada bukti
pemakaian yang menunjukkan kebutuhan itu nyata — bukan dibangun kompleks sejak awal
berdasarkan asumsi. Contoh penerapan prinsip ini dalam dokumen: log audit PR#1
(kronologis dulu, semantic search belakangan), threshold governor PR#2 (longgar dulu,
diperketat bertahap), dan Module Discovery PR#7 (Fase 1 dulu, Fase 2 ditunda).
