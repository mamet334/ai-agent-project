# Laporan Audit Forensik: Jejak Asal Usul Nama "Slamet"
**Tanggal:** 2 Juli 2026

## 1. Analisis `MemoryService` & Injeksi Frontend
- **Fakta:** Penambahan kode injeksi `globalMemory` di `ConversationEngine.jsx` sudah benar dan berfungsi mengirimkan variabel ke *payload*.
- **Masalah Fatal (Kenapa Supabase Gagal di Frontend):**
  Di `MemoryService.js`, kode pencarian memori ditulis seperti ini:
  ```javascript
  .ilike('content', `%${query}%`)
  ```
  Sesuai dengan audit database kita di langkah sebelumnya, tabel `user_memories` **TIDAK MEMILIKI kolom `content`** (kolom teks intinya bernama `summary`). Kesalahan nama kolom ini memicu *error* (PostgREST Error), yang ditangkap oleh blok `try-catch` secara diam-diam.
  **Akibatnya:** `MemoryService` Frontend *selalu* me-return `[]` (kosong), sehingga injeksi `globalMemory` selamanya nihil/kosong.

## 2. Investigasi Storage Lokal (`BrainService`)
- **Fakta:** `BrainService.js` hanya menyimpan dan membaca dua hal dari `localStorage`: `maef_ai_provider` dan `maef_ai_model`.
- **Kesimpulan:** Tidak ada data profil pengguna (nama, usia, dll.) yang disembunyikan di dalam *localStorage* Frontend.

## 3. Asal Muasal Misteri Nama "Slamet"
Jika Frontend gagal memberikan *memory*, dan LLM mengklaim data "Slamet" berasal dari "konfigurasi sistem internal", dari manakah sumber sebenarnya?
- Berdasarkan pencarian teks mendalam ke seluruh *source code*, nama "Slamet" ternyata **di-*hardcode* di dalam skrip Backend Edge Function**.
- **Lokasi Spesifik:** `supabase/functions/agent-process/plugins/language.ts`
- **Teks Kode Asli:**
  ```typescript
  description: 'Sub-agent untuk memahami nuansa bahasa... Gunakan jika user (Slamet) menggunakan gaya bahasa khusus...',
  2. Identifikasi makna tersirat atau nuansa khusus dari penulis (Slamet).
  ```

### Bagaimana Kejadiannya di Mata LLM?
1. Saat obrolan dikirim, Backend membangun *System Prompt* yang merangkum semua daftar *tools* (sub-agent) beserta deskripsinya agar LLM paham cara menggunakannya.
2. Deskripsi sub-agent `language` (yang berisi teks "Slamet" secara statis) ikut diinjeksikan ke dalam otak LLM.
3. Saat Anda bertanya "Siapa nama panggilan saya?", LLM mencari di ingatan utamanya, menemukan teks statis tersebut, dan dengan polosnya menyimpulkan bahwa nama Anda adalah Slamet. Karena data itu datang dari *system prompt* (bukan *output* RAG), LLM jujur menyebutkan asalnya: *"konfigurasi sistem internal"*.

## 4. Rekomendasi Perbaikan Konkret
Ada dua perbaikan yang sangat wajib dilakukan sekarang:

1. **Perbaikan MemoryService (Frontend):**
   Ubah pemanggilan kolom di `MemoryService.js` dari `content` menjadi `summary`:
   ```javascript
   // SEBELUM
   .ilike('content', `%${query}%`)
   // SESUDAH
   .ilike('summary', `%${query}%`)
   ```

2. **Pembersihan Hardcode Nama User (Backend):**
   Hapus nama "Slamet" dari file `plugins/language.ts` agar LLM tidak tertipu/berhalusinasi tentang identitas pengguna, melainkan murni membacanya dari Supabase Database (*True RAG*).
