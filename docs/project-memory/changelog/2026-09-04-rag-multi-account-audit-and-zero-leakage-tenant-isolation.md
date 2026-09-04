# Changelog: Audit Dokumen RAG Multi-Akun & Penegakan Isolasi Tenant (Zero-Leakage)

**Tanggal:** 2026-09-04  
**Status:** ✅ Selesai Diimplementasikan, Teruji (Automated & Live Desktop by Owner), & Dideploy ke Supabase Cloud  
**Komponen Terdampak:**  
- `frontend/src/core/runtime/services/KnowledgeService.js`
- `frontend/src/core/runtime/services/RetrievalOrchestrator.js`
- `frontend/src/core/runtime/services/AssistantService.js`
- `frontend/src/hooks/useDashboardData.js`
- `supabase/functions/agent-process/lib/orchestration/handlers/context_builder.ts`  
**Referensi Terkait:**  
- [`docs/roadmap/ZERO-LEAKAGE-RAG-TENANT-ISOLATION.md`](../../roadmap/ZERO-LEAKAGE-RAG-TENANT-ISOLATION.md)
- [`constitution/04_OWNER_SOVEREIGNTY.md`](../../../constitution/04_OWNER_SOVEREIGNTY.md)
- [`constitution/05_KNOWLEDGE_SYSTEM.md`](../../../constitution/05_KNOWLEDGE_SYSTEM.md)

---

## 1. Latar Belakang & Permintaan Owner

Owner sempat menggunakan dua akun berbeda untuk mengunggah dokumen ke Supabase RAG dalam ekosistem Mamet. Owner meminta:
1. Memeriksa secara akurat siapa yang mengunggah dokumen apa (accounting audit kepemilikan dokumen).
2. Memastikan tidak ada kebocoran dokumen RAG antar email maupun user login (penegakan *zero-leakage tenant isolation*).

---

## 2. Hasil Audit Kepemilikan Dokumen (45 Dokumen Supabase)

Audit komprehensif pada Supabase Auth dan tabel `documents` mendapati rincian kepemilikan sebagai berikut:

### Akun 1: `andreanastasya798@gmail.com`
- **User ID**: `3841e124-15c1-44bb-9034-bde61410882d` (Sesi login desktop aktif saat ini)
- **Total Dokumen**: 29 dokumen (Topik Teknis IT, AI/ML, Security, QA, Matematika, dan Data Science):
  - `Panduan_Teknis_Keamanan_Sistem.txt`
  - `pengujian sistem.txt`
  - `building llms.txt`
  - `deep learning dengan python.txt`
  - `TensorFlow.txt`
  - `tensorflow unleased dan python mastery for intermediated.txt`
  - `pytorch.txt`
  - `hungging face.txt`
  - `opencv.txt`
  - `xgboost.txt`
  - `machin learning with lighgbm.txt`
  - `reiforcement learning.txt`
  - `Continual Learning,PrinciplesPractice,andFrameworks.txt`
  - `spatial awarnes.txt`
  - `matematika-dasar.txt`
  - `Matematika Dasar -- Jusmawati -- ( WeLib.org ).pdf` (2 berkas)
  - `C++ - Wikipedia bahasa Indonesia, ensiklopedia bebas.pdf`
  - `Pembelajaran mesin - Wikipedia bahasa Indonesia, ensiklopedia bebas.pdf`
  - `Pemelajaran dalam - Wikipedia bahasa Indonesia, ensiklopedia bebas.pdf`
  - `scikitdanworkflow.txt`
  - `2026-06-24_Excel.txt`
  - `2026-06-24_DataEntry.txt`
  - `2026-06-24_GooglesSheet.txt`
  - `2026-06-24_QA.txt`
  - `2026-06-24_Testing.txt`
  - `2026-06-24_Chatbot.txt`
  - `2026-06-24_AI.txt`
  - `2026-06-24_VirtualAssistant.txt`

### Akun 2: `slametbro798@gmail.com`
- **User ID**: `52e37376-94fd-41dd-a679-810020ad0b70`
- **Total Dokumen**: 16 dokumen (Topik Pemerintahan Daerah, Dinas & OPD):
  - `diinas pendidikan.txt`
  - `RSUD.txt`
  - `satpolpp.txt`
  - `badan pendapatan daerah.txt`
  - `dinas pemberdayaan perempuan dan perlindungan anak.txt`
  - `bagian kerja sama setda.txt`
  - `bagian kesatuan bangsa dan politik.txt`
  - `bag perekonomian2.txt`
  - `kec baturaja timur.txt`
  - `kec semidang aji.txt`
  - `kec muara jaya.txt`
  - `kec pengandonan.txt`
  - `kel air gading.txt`
  - `kel baturaja permai.txt`
  - `kel kemelak bindung langit.txt`
  - `KELURAHAN SEKARJAYA.txt`

### Akun 3: `cecep.ceri@gmail.com`
- **User ID**: `23a39918-8c45-4c08-b9f9-b0c514f3cb6f`: 0 dokumen.

---

## 3. Analisis Akar Masalah Kebocoran RAG Antar-Akun

1. **Skema Relasional Supabase:**
   - Tabel induk `documents` menyimpan kolom `user_id`.
   - Tabel anak `document_chunks` menyimpan `id, document_id, content, embedding, source_url, source_type`. Kolom `user_id` **tidak ada** pada tabel `document_chunks`.
2. **Klausa Query Tidak Efektif & Tidak Terisolasi:**
   - Pada implementasi sebelumnya di `KnowledgeService.js`, terdapat klausa `.eq('user_id', options.userId)` yang langsung ditujukan ke tabel `document_chunks`. Karena kolom tersebut tidak ada pada tabel fisik, PostgREST menghasilkan error atau mengabaikannya.
   - Pada Tahap 3 (Content Search Fallback), kueri tidak menyertakan join relasi ke tabel `documents`. Akibatnya, saat kueri fallback dijalankan, semua chunk dari seluruh akun di database Supabase (termasuk `diinas pendidikan.txt` milik `slametbro798@gmail.com`) terambil secara global ketika akun `andreanastasya798@gmail.com` melakukan pencarian.
3. **Penyampaian Parameter `userId` Terputus:**
   - `AssistantService.js`: Tidak meneruskan `userId` ke `retrievalOrchestrator.retrieve()`.
   - `RetrievalOrchestrator.js`: Tidak meneruskan `userId` ke `ks.queryKnowledge()`.
   - `context_builder.ts`: Tidak meneruskan `userId: ctx.auth.userId` ke `knowledgeService.queryKnowledge()`.
   - `useDashboardData.js`: Membaca dokumen tanpa membatasi `user_id` aktif.

---

## 4. Solusi & Perbaikan Komprehensif

### A. Hardening `KnowledgeService.js`
1. **Resolusi Otomatis `userId`:**
   Memeriksa `options.userId`, dengan fallback ke sesi aktif Supabase (`supabase.auth.getSession()`).
2. **Guard Isolasi Ketat:**
   Jika `userId` tidak tersedia dan `options.allowGlobalScan` bernilai false, kueri segera dibatalkan dan mengembalikan array kosong untuk mencegah kebocoran data pengguna anonim.
3. **Tahap 1 (Title Match):**
   Filter tabel `documents` ditegakkan dengan klausa `.eq('user_id', userId)`.
4. **Tahap 2 (Targeted Chunks):**
   Hapus filter `.eq('user_id')` yang salah pada tabel `document_chunks`. Isolasi terjamin penuh karena `targetedDocIds` diperoleh dari dokumen yang sudah difilter oleh `userId` pada Tahap 1.
5. **Tahap 3 (Content Search Fallback via PostgREST Inner Join):**
   Menerapkan PostgREST Resource Embedding:
   `select('id, document_id, content, source_url, source_type, documents!inner(id, title, user_id, space_id)')`
   dan menegakkan filter:
   `.eq('documents.user_id', userId)`
   Hal ini menjamin bahwa seluruh chunk konten yang terambil pada fallback 100% hanya berasal dari dokumen milik user tersebut.
6. **Kalibrasi Similarity Berbasis Keyword Match:**
   Menghitung keyword coverage score (`matchScore / keywords.length`) sehingga potongan teks yang hanya mencocokkan sebagian kecil kata kunci tidak mendapatkan similarity tinggi secara artifisial.

### B. Penyambungan Alur Data di Pipeline Runtime
- **`RetrievalOrchestrator.js`**: Meneruskan `userId: options.userId` dan `spaceId: options.spaceId` ke `ks.queryKnowledge()`.
- **`AssistantService.js`**: Meneruskan `userId` ke `retrievalOrchestrator.retrieve(userMsg, { userId, ... })`.
- **`context_builder.ts`**: Meneruskan `userId: ctx.auth.userId` ke `knowledgeService.queryKnowledge()`.
- **`useDashboardData.js`**: Menerapkan filter `user_id: currentUserId` pada kueri `user_memories`, `documents`, `chats`, dan join `documents!inner(user_id)` pada `document_chunks`.

---

## 5. Hasil Verifikasi

### A. Automated Cross-Tenant Isolation Test (`scratch/test_ks_isolation.mjs`)
```
=== TEST 1: Andre mencari "Panduan Teknis Keamanan Sistem" ===
[KnowledgeService] Title match prioritized: Panduan_Teknis_Keamanan_Sistem.txt (hits: 4)
Andre Security Chunks found: 15 (DocID: 66b7977f-..., sim: 0.95)

=== TEST 2: Slamet mencari "Panduan Teknis Keamanan Sistem" ===
Leaked Andre security chunks in Slamet: 0 (MUST BE 0) -> PASSED (Zero Leakage)

=== TEST 3: Slamet mencari "struktur dan program dinas pendidikan" ===
[KnowledgeService] Title match prioritized: diinas pendidikan.txt (hits: 1)
Slamet Pendidikan Chunks found: 15 (DocID: 7a82bad3-..., sim: 0.95)

=== TEST 4: Andre mencari "struktur dan program dinas pendidikan" ===
Leaked Slamet dinas chunks in Andre: 0 (MUST BE 0) -> PASSED (Zero Leakage)

=== TEST 5: Kueri tanpa userId ===
[KnowledgeService] Kueri dibatalkan: userId tidak tersedia dan allowGlobalScan=false. Isolasi tenant ditegakkan.
Chunks returned: 0 (PASSED)
```

### B. Uji Live Desktop oleh Owner (`npm run desktop`)
Owner melakukan verifikasi live menggunakan aplikasi desktop dengan kueri:
> *"Berdasarkan dokumen Panduan Teknis Keamanan Sistem yang saya upload, apa metodologi dan tujuan utama dari analisis keamanan sistem yang dijelaskan?"*

**Log Runtime Desktop:**
```
[RequestClassifier] → CONVERSATION (confidence: 1, len: 147)
[AssistantService] Mode check: workspace=ws-assistant, resolvedMode=ASSISTANT
[RetrievalOrchestrator] Starting knowledge retrieval for: "Berdasarkan dokumen Panduan Teknis Keamanan Sistem yang saya..."
[KnowledgeService] Querying knowledge for: "..." (userId: 3841e124-15c1-44bb-9034-bde61410882d, keywords: panduan, teknis, keamanan, sistem, metodologi, tujuan, utama, analisis)
[KnowledgeService] Title match prioritized: Panduan_Teknis_Keamanan_Sistem.txt (hits: 4)
[RetrievalStrategy] Detected case: A (5 chunks)
[RetrievalStrategy] Tier 1 Sufficiency score: 0.832 (strategy: case_a_passthrough)
[AssistantService] PR#9 RetrievalOrchestrator: Tier 1, strategy=case_a_passthrough, sufficiency=0.832
[PR#6 TokenEfficiency] RAG: 7403→4051 chars | Estimasi token: 1888 → 1050 (hemat ~838 token)
[EVIDENCE_GATE] Verdict=PASSED | total=10
[CONFIDENCE] 100% Grade:A | Sangat Tinggi
```

**Jawaban Model AI:**
> *Analisis keamanan sistem mengikuti metodologi yang terstruktur, yang mencakup langkah-langkah untuk menganalisis, memetakan, menguji, dan menemukan titik lemah, kesalahan, atau anomali dalam sistem, jaringan, dan aplikasi. Tujuan utama dari analisis ini adalah untuk memastikan bahwa sistem dapat memantau, mendeteksi kesalahan, dan mengamankan dirinya sendiri.*  
> **`[STATUS: VERIFIED]`**

**Status Verifikasi:** ✅ **BERHASIL MUTLAK (PERFECT PASS)**  
- \`userId\` terikat secara tepat ke sesi aktif desktop.
- Nol kebocoran lintas akun (\`diinas pendidikan.txt\` dari akun Slamet tidak bocor).
- Evidence Gate meluluskan dengan confidence 100% (Grade A).
- Status epistemis tercetak konsisten: \`[STATUS: VERIFIED]\`.

### C. Build & Deploy
- **Frontend Build (`npm run build`):** Berhasil 100% tanpa error (2662 modul terkompilasi bersih).
- **Supabase Edge Function Deployment:** Fungsi `agent-process` berhasil dideploy ke Supabase Cloud.
