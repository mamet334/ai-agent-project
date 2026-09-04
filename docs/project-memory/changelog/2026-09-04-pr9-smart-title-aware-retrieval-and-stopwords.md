# Changelog: Remediasi Akurasi Retrieval RAG — Smart Title-Aware Matching, Expanded Stopwords, & Multi-Term Scoring

**Tanggal:** 2026-09-04  
**Status:** ✅ Selesai Diimplementasikan, Teruji, & Dideploy ke Supabase Cloud  
**Komponen Terdampak:** `frontend/src/core/runtime/services/KnowledgeService.js`, Supabase Edge Function `agent-process` (`context_builder.ts`)  
**Referensi Terkait:** [`docs/roadmap/PR9-retrieval-tier-architecture.md`](../../roadmap/PR9-retrieval-tier-architecture.md), [`constitution/05_KNOWLEDGE_SYSTEM.md`](../../../constitution/05_KNOWLEDGE_SYSTEM.md)

---

## 1. Latar Belakang & Temuan Uji Live Desktop

Saat Owner melakukan pengujian kasus positif (*positive test case*) pada aplikasi desktop untuk memancing dokumen pengetahuan lokal:
> *"Berdasarkan dokumen Panduan Teknis Keamanan Sistem yang saya upload, apa metodologi dan tujuan utama dari analisis keamanan sistem yang dijelaskan?"*

Asisten AI memberikan respons:
> *"Sepertinya saya tidak memiliki akses ke dokumen yang Anda sebutkan, yaitu 'Panduan Teknis Keamanan Sistem'..."*

Pemeriksaan pada log konsol runtime menunjukkan:
1. `KnowledgeService.js:96`: Ekstraksi kata kunci menghasilkan: `(keywords: berdasarkan, dokumen, panduan, teknis, keamanan)`.
2. `RetrievalStrategyService.js:85`: Skor kecukupan hanya bernilai `0.3` (`case_a_passthrough`).
3. Seluruh 15 *chunks* yang terambil di `<RAG>` (`[DOC-0001]` s.d. `[DOC-0015]`) berasal dari file `DINAS PENDIDIKAN.xlsx` (data kepegawaian ASN/PPPK), bukan dari `Panduan_Teknis_Keamanan_Sistem.txt`.
4. Model AI bertindak jujur dan patuh pada Konstitusi: karena dokumen keamanan sistem tidak ada di prompt, model menolak berhalusinasi.

---

## 2. Analisis Akar Masalah (Root Cause)

Investigasi mendalam pada kode `KnowledgeService.js` mengungkap 3 akar masalah:

1. **Kebocoran Stopwords Percakapan (*Conversational Stopword Leak*):**
   Daftar `DEFAULT_STOPWORDS` hanya memuat 20 kata sambung dasar. Kata-kata pembuka kueri seperti `"berdasarkan"` dan `"dokumen"` tidak difilter dan dijadikan kata kunci utama (#1 dan #2). Hampir semua dokumen di database memuat kata `"dokumen"`, sehingga kueri menjadi terlalu umum.
2. **Pemotongan Kata Kunci Dini (*Early Keyword Truncation*):**
   Fungsi `_extractKeywords(query, maxKeywords = 5)` memotong kata kunci hanya sampai 5 kata pertama (`berdasarkan`, `dokumen`, `panduan`, `teknis`, `keamanan`). Kata kunci inti yang memuat subjek spesifik di paruh akhir pertanyaan (**`sistem`**, **`metodologi`**, **`tujuan`**, **`utama`**, **`analisis`**) terbuang total.
3. **Pencarian Rata Tanpa Memeriksa Judul Dokumen (*Title-Blind Flat OR Query*):**
   Kueri ke Supabase PostgREST hanya menyasar tabel `document_chunks` dengan klausa:
   ```sql
   content.ilike.%berdasarkan%,content.ilike.%dokumen%,content.ilike.%teknis% ... LIMIT 15
   ```
   Kueri tidak memeriksa nama file pada tabel induk `documents` (`documents.title`). Karena tabel `document_chunks` mengembalikan baris berdasarkan urutan penyimpanan tabel fisik (tanpa `ORDER BY` relevansi), *chunks* dari `DINAS PENDIDIKAN.xlsx` (yang banyak memuat kata *"dokumen"* dan *"teknis"*) langsung menyerap habis seluruh 15 slot kuota RAG.

---

## 3. Solusi Arsitektural & Perbaikan

Perbaikan diimplementasikan pada `frontend/src/core/runtime/services/KnowledgeService.js` yang digunakan secara bersama oleh client dan Edge Function server-side:

### A. Perluasan Stopwords Percakapan
Menambahkan kata-kata pengantar kueri, kata tanya, dan kata kerja instruksi ke dalam `DEFAULT_STOPWORDS`:
- *Kata pengantar & dokumen:* `berdasarkan`, `menurut`, `sesuai`, `dokumen`, `berkas`, `file`, `arsip`, `upload`, `diupload`.
- *Kata perintah/permintaan:* `tolong`, `coba`, `mohon`, `bantu`, `jelaskan`, `sebutkan`, `rincikan`, `uraikan`, `ceritakan`.
- *Kata tanya umum:* `apakah`, `adakah`, `bisakah`, `bolehkah`, `bagaimana`, `kenapa`, `mengapa`, `siapa`, `mana`, `kapan`.
- *Partikel/bantu:* `tentang`, `terkait`, `mengenai`, `dalam`, `atas`, `pada`, `sudah`, `telah`, `akan`, `bisa`, `dapat`, `harus`, `wajib`, `info`, `informasi`, `data`.
- Menaikkan batas kata kunci dari `maxKeywords = 5` menjadi **`maxKeywords = 8`**.

### B. Smart Title-Aware Pre-Matching
Sebelum mencari isi teks *chunk*, kueri memeriksa kolom `title` pada tabel `documents`:
1. Jika kata kunci cocok dengan judul dokumen tertentu, dokumen tersebut dihitung skor kecocokannya (`matchCount`).
2. Dokumen dengan kecocokan kata kunci tertinggi (misal: `Panduan_Teknis_Keamanan_Sistem.txt` yang cocok 4 kata kunci) diprioritaskan.
3. *Chunks* milik dokumen prioritas tersebut diambil terlebih dahulu dan diberi bobot kemiripan tinggi (`similarity: Math.max(0.75, 0.95 - (idx * 0.02))`).

### C. Keyword Density Ranking & Gap-Filling
Jika jumlah *chunk* dari dokumen prioritas belum memenuhi limit (15 *chunk*):
1. Sistem mengambil kandidat *chunk* dari tabel `document_chunks` (mengecualikan dokumen yang sudah diambil agar tidak duplikat).
2. Kandidat di-ranking berdasarkan frekuensi kemunculan kata kunci (`matchScore`).
3. *Chunk* terbaik dimasukkan untuk mengisi sisa slot dengan kemiripan proporsional (`0.40 - 0.70`).

---

## 4. Hasil Verifikasi & Pengujian

### A. Uji Kueri Langsung ke Database Supabase
Dijalankan pada kueri uji Owner:
```text
Query: "Berdasarkan dokumen Panduan Teknis Keamanan Sistem yang saya upload, apa metodologi dan tujuan utama dari analisis keamanan sistem yang dijelaskan?"
Keywords: ['panduan', 'teknis', 'keamanan', 'sistem', 'metodologi', 'tujuan', 'utama', 'analisis']
Top matched docs: ['Panduan_Teknis_Keamanan_Sistem.txt (hits: 4)']
Result total: 15 chunks
Chunk 1 DocID: 66b7977f-b220-4a91-8d5b-3ea067af474a
Chunk 1 Content: # Ringkasan Materi: Metodologi Analisis, Pengujian, dan Keamanan Sistem (Sumber: The Basics of Hacking and Penetration Testing - Edisi 2) ## Tujuan Utama Mempelajari metode terstruktur untuk menganalisis, memetakan, menguji...
```
✅ 100% *chunks* dari `Panduan_Teknis_Keamanan_Sistem.txt` berhasil ditarik sebagai prioritas utama.

### B. Uji Multi-Topik Lintas Dokumen
1. Topik AI (`building llms.txt`): Berhasil memprioritaskan `building llms.txt` (hits: 2) di atas dokumen umum lainnya.
2. Topik Kepegawaian (`diinas pendidikan.txt`): Berhasil menarik *chunk* pengawas sekolah ahli madya dengan tepat.

### C. Build & Deployment
- **Frontend Build:** `npm run build` sukses 100% (2.662 modul, 0 error).
- **Edge Function Deploy:** `agent-process` sukses di-deploy ke Supabase Cloud (`uuyzdjifhdfyyvpxsofu`).
  - Asset ter-upload: `frontend/src/core/runtime/services/KnowledgeService.js`.

---

## 5. Berkas yang Dimodifikasi

1. [`frontend/src/core/runtime/services/KnowledgeService.js`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/core/runtime/services/KnowledgeService.js) — Penambahan expanded stopwords, peningkatan `maxKeywords = 8`, implementasi title-aware matching, dan keyword-density ranking.
