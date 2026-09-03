# ROADMAP: KNOWLEDGE GALAXY — COSMIC ORBITS & LIVE THOUGHT PULSE

**Tipe Dokumen:** Engineering Roadmap & UI/UX Architectural Specification  
**Area:** Frontend Knowledge Graph (`ActivityGraph.jsx`) & Assistant Integration (`ConversationEngine.jsx`)  
**Authority:** MAEF Constitution (23_HOME_DASHBOARD_SPEC.md & 22_MUS_UI_SPECIFICATION.md)  
**Status:** PROPOSED (Menunggu Persetujuan Eksekusi)  
**Tanggal:** 2026-09-04  

---

## 1. Latar Belakang & Visi Desain

Berdasarkan diskusi arsitektur dan inspirasi dari sistem visualisasi agen otonom modern (seperti *Hermes AI / Nous Research*), antarmuka **MAMET KNOWLEDGE GRAPH** (Home Dashboard) dirancang untuk berkembang melampaui diagram simpul statis konvensional menjadi sebuah **"Living AI Neural Universe"**.

Setelah eliminasi konsep kabut/nebula (Pilar 1) guna mempertahankan kejernihan dan kontras tinggi kanvas hitam *Obsidian-style*, terpilih **dua pilar utama** yang akan direalisasikan:

1. **Pilar A — Jalur Orbit Gravitasi Kosmik (*Cosmic Filaments & Stardust Flow*):**
   * Menggantikan garis lurus kaku (*polygonal lines*) dengan kelengkungan orbit dinamis (`linkCurvature`).
   * Mengalirkan partikel debu cahaya anggun sepanjang lintasan gravitasi untuk menggambarkan sirkulasi energi pengetahuan antar-entitas.
2. **Pilar B — Pijaran Simpul Pikiran Aktif (*Live Thought Pulsing & Active Memory Illumination*):**
   * Membangun jembatan visual antara mode Chat Asisten dan Home Dashboard.
   * Ketika asisten memanggil memori atau dokumen ke dalam *Memory Context* saat percakapan, simpul bintang yang bersangkutan di kanvas graf akan memancarkan pendaran denyut lembut (*pulsing halo ring*), memperlihatkan simpul pengetahuan mana yang sedang aktif dipikirkan oleh AI.

---

## 2. Prinsip Rekayasa (Engineering Principles)

1. **Zero-Token & Zero-Cost Realtime:**
   * Sama sekali tidak memanggil model bahasa LLM ($0.00). Seluruh status aktif didorong melalui event browser lokal (*EventBus*).
2. **High-Performance 60 FPS Canvas:**
   * Memanfaatkan akselerasi HTML5 Canvas 2D murni (`requestAnimationFrame`), tanpa menambahkan dependensi pustaka 3D yang berat pada GPU laptop/desktop.
3. **Konstitusi 23 Compliant:**
   * Mempertahankan 5 palet warna semantik resmi: Hijau Memori (`#22c55e`), Ungu Dokumen RAG (`#a855f7`), Kuning Percakapan (`#eab308`), Putih Inti Supabase (`#ffffff`), dan Merah Konflik (`#ef4444`).
4. **Non-Intrusive & Clear Contrast:**
   * Menjaga kanvas latar belakang tetap gelap gulita murni (*Obsidian Deep Space*), memastikan teks nama bintang tetap mudah terbaca pada semua tingkat pembesaran (*zoom scale*).

---

## 3. Rincian Arsitektur & Spesifikasi Teknis

### A. Pilar A: Cosmic Filaments & Flowing Stardust (`ActivityGraph.jsx`)
* **Kelengkungan Orbit Dinamis (`linkCurvature`):**
  * Setiap relasi antar-node diberi nilai lengkungan geometris (misal `0.12` – `0.16`), menciptakan busur gravitasi yang menyerupai lintasan orbit benda langit mengitari pusat massa.
* **Aliran Partikel Semantik (`linkDirectionalParticles`):**
  * Partikel debu bintang bergerak perlahan sepanjang lengkungan orbit (`speed: 0.004`).
  * Warna partikel mengadopsi warna semantik dari node asal (*source node*), memberikan kesan aliran informasi yang hidup:
    - Partikel hijau mengalir dari/menuju node memori.
    - Partikel ungu mengalir dari/menuju dokumen RAG.
    - Partikel putih mengalir melintasi inti kernel Supabase.

### B. Pilar B: Live Thought Pulsing (`ConversationEngine.jsx` ➔ `ActivityGraph.jsx`)
* **Penyampaian Sinyal Pikiran Aktif (EventBus / State Bridge):**
  * Saat `ConversationEngine` memuat `activeMemories` (berdasarkan kueri pengguna atau konteks percakapan terakhir), ia memancarkan event:
    ```javascript
    kernel.eventBus?.emit('Brain:ActiveThoughts', {
      memoryIds: activeMemories.map(m => m.id),
      timestamp: Date.now()
    });
    ```
  * `ActivityGraph` berlangganan event tersebut dan menyimpan daftar ID bintang yang sedang aktif (`activeThoughtIds`).
* **Render Efek Denyut Kosmik (*Sine Wave Pulsing Halo*):**
  * Pada siklus penggambaran kanvas (`nodeCanvasObject`):
    * Jika `activeThoughtIds.has(node.id)`:
      * Sistem menggambar cincin cahaya tambahan di sekeliling node dengan radius berosilasi:
        $$R = R_{\text{base}} \times (1.3 + 0.35 \times \sin(\text{time} / 200))$$
      * Warna cincin: Cincin pendaran semantik berintensitas tinggi dengan efek pendar (*glow stroke*).
* **Indikator Legenda Baru:**
  * Menambahkan indikator di legenda header Konstitusi 23:
    * `● Berpijar: Simpul Aktif Percakapan (Live Thought)`

---

## 4. Rencana File yang Terlibat

| File | Tipe Aksi | Tanggung Jawab |
| :--- | :---: | :--- |
| `frontend/src/components/dashboard/ActivityGraph.jsx` | Modifikasi | Menambahkan `linkCurvature`, penyesuaian partikel stardust, dan render denyut simpul aktif |
| `frontend/src/components/workbench/ConversationEngine.jsx` | Modifikasi | Memancarkan event `Brain:ActiveThoughts` saat `activeMemories` terisi/berubah |
| `docs/roadmap/INDEX-ROADMAP.md` | Modifikasi | Pendaftaran dokumen roadmap baru ke dalam indeks utama |

---

## 5. Kriteria Keberhasilan (Definition of Done)

- [ ] Seluruh garis penghubung di kanvas graf melengkung secara elegan dan alami tanpa tumpang tindih berlebih.
- [ ] Partikel stardust mengalir lembut mengikuti lengkungan orbit pada kecepatan optimal (60 FPS, tidak memberatkan CPU).
- [ ] Ketika pengguna berpindah dari obrolan chat yang memiliki memori aktif ke Home Dashboard, bintang memori terkait terlihat berdenyut terang.
- [ ] Lolos verifikasi build produksi (`npm run build` sukses 0 error).
- [ ] Tidak ada pelanggaran Konstitusi 23 dan tidak ada biaya token LLM ($0.00).
