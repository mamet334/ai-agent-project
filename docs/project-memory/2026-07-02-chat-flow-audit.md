# Laporan Audit: Kesenjangan Alur Chat & Sinkronisasi Memori
**Tanggal:** 2 Juli 2026

## 1. Letak Ketidaksesuaian antara Frontend dan Backend

Setelah menelusuri alur eksekusi pesan mulai dari `ConversationEngine.jsx` di sisi Frontend hingga ke `memory_manager_v1.ts` di sisi Backend, ditemukan beberapa ketidaksesuaian (gap) kritikal:

### A. Bypass Arsitektur Layer 2 (Frontend)
- **Fakta:** `ConversationEngine.jsx` sama sekali **TIDAK MENGGUNAKAN** `MemoryService` maupun `KnowledgeService`. 
- Saat pengguna mengirim pesan, komponen ini membuat payload secara mandiri dan langsung menembak HTTP POST ke Edge Function `agent-process`.
- Ini menyebabkan pekerjaan kita sebelumnya menghidupkan `MemoryService` dan `KnowledgeService` tidak berpengaruh pada hasil chat, karena *pipeline* obrolan tetap menggunakan *hard-bypass* ke backend.

### B. Payload Mode Ignored (Backend)
- **Fakta:** Frontend mengirimkan argumen `mode: 'OWNER'` atau `mode: 'ENGINEER'` di dalam payload JSON.
- **Masalah:** Di dalam `request_parser.ts` (Backend), properti `mode` tersebut **TIDAK PERNAH DIEKSTRAK**. Backend malah bergantung pada `appSource` dan `desktopOSMode` (yang tidak pernah dikirim oleh Frontend).
- **Dampak:** Karena parameter tidak dikenali, `execution_context.ts` selalu memaksa mode menjadi `"LITE"`. Hal ini mengacaukan limitasi token, top-K RAG, dan *policy* lainnya karena pengguna selalu dianggap sebagai pengguna terbatas (MametLite).

## 2. Kenapa Memori Gagal Ditarik oleh Backend?

Meskipun mode jatuh ke "LITE", parameter `canReadMemory` ternyata tetap bernilai `true`. Namun, memori gagal dikembalikan karena dua cacat logika (Logic Flaws) di backend:

### A. Schema Mismatch & The "Null Crash" (Kritis)
- Di dalam tabel `user_memories` Supabase, kolom teks utamanya bernama `summary`, bukan `content`.
- Dalam loop pemrosesan `retrieveMemories` (`memory_manager_v1.ts`), terdapat kode:
  ```typescript
  if (!uniqueMemoriesMap.has(d.summary.toLowerCase())) { ... }
  ```
- **Bahaya:** Jika ada SATU SAJA baris memori yang kolom `summary`-nya kosong (`null`), misalnya karena diisi dari *tool* eksperimental atau insert yang keliru, kode `.toLowerCase()` akan men- *trigger* **TypeError**. Karena diletakkan di dalam blok try-catch luar, seluruh fungsi `retrieveMemories` akan langsung *crash* dan mengembalikan *array kosong* `[]` ke LLM.

### B. The V2 Fallback Trap (Kritis)
- Jika `MEMORY_V2_ENABLED` aktif, backend memanggil `retrieveMemoriesV2`.
- Jika V2 gagal menemukan relasi graf, ia mengembalikan array kosong `[]`.
- **Masalah:** Blok pengecekan menganggap `[] !== null`, sehingga eksekusi langsung berhenti dan mengembalikan `[]`. **Sistem fallback ke V1 tidak pernah dijalankan!**

## 3. Rekomendasi Perbaikan Konkret

Untuk menyembuhkan sistem dan membuat memori berfungsi kembali:

1. **Perbaikan Fallback V2:**
   - Di `retrieveMemoriesV2` (Backend), ubah agar me-return `null` (bukan `[]`) jika graf tidak menemukan relasi (`if (!subgraph.nodes || subgraph.nodes.length === 0) return null;`). Ini akan membiarkan V1 mengambil alih sebagai fallback.

2. **Perbaiki Null-Safety di Loop Memori (V1):**
   - Tambahkan pengecekan aman `(d.summary || d.content || '').toLowerCase()` agar *crash* data kotor tidak terjadi.

3. **Perbaiki Parsing Request:**
   - Ubah `request_parser.ts` agar mengambil nilai `mode` dari `reqJson` secara sah.

4. **Koneksikan ConversationEngine ke Layer 2 (Opsional / Jangka Panjang):**
   - Agar sejalan dengan `DEPENDENCY_MAP.md`, ke depannya `ConversationEngine` harusnya me- *request* context terlebih dahulu dari `MemoryService` secara lokal, merakit konteksnya, dan baru mengirimkannya ke LLM. Namun perbaikan backend lebih diutamakan agar aplikasi segera berfungsi normal.
