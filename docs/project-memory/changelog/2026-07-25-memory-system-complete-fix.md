# 📝 Changelog: Perbaikan Sistem Memori, Filter Chat, & Cleanup Database (2026-07-25)

## Ringkasan
Hari ini (25 Juli 2026) kita menyelesaikan serangkaian perbaikan besar yang dimulai pada 23–24 Juli 2026. Fokus utama adalah:
1. Menyelesaikan **PR-1: Memori Lintas Percakapan** (agar AI mengingat fakta pengguna antar sesi chat).
2. Memperbaiki **bug auto‑new‑chat** saat refresh/idle.
3. Mengatasi **error 400 Bad Request** pada penyimpanan memori.
4. Menambahkan **filter chat berdasarkan workspace** (ENGINEER/ASSISTANT/LITE) agar riwayat tidak tercampur.
5. Pembersihan database tahap awal (PR‑2).

---

## Daftar Masalah yang Ditemukan & Diperbaiki

### 1. Memori Lintas Percakapan Tidak Berfungsi
- **Gejala**: Data "catat dan ingat" hanya bertahan dalam satu sesi chat, hilang saat refresh.
- **Penyebab**:
  - Kode frontend (`MemoryService.js`) masih melakukan `INSERT` ke tabel `user_memories` dengan kolom `content` dan `metadata` yang sudah tidak ada di database.
  - Tabel `user_memories` hanya memiliki kolom `summary`, bukan `content`.
  - Kebijakan (`canWriteKnowledge`) awalnya `false` untuk mode `ASSISTANT`, sehingga menulis memori diblokir.
- **Solusi**:
  - Mengubah policy di `execution_context.ts`: `canWriteKnowledge` menjadi `true` untuk ASSISTANT.
  - Memperbaiki `MemoryService.js` agar menulis ke kolom `summary` dan menghapus kolom `content`/`metadata`.
  - Menyesuaikan `request_pipeline.ts` agar membaca kolom `summary` saat RAG/vector search.

### 2. Chat Baru Otomatis Terbuka Saat Refresh/Idle
- **Gejala**: Setiap kali halaman di‑refresh atau setelah idle, chat aktif hilang dan diganti dengan "Percakapan Baru".
- **Penyebab**:
  - `currentChatId` dan `messages` hanya disimpan di state React (in‑memory), tidak dipersist ke `localStorage`.
  - Saat refresh, state React hilang dan komponen kembali ke inisialisasi `null`.
  - `ChatHistory` melakukan `fetchChats()` setiap kali `activeChatId` berubah, menyebabkan operasi database berlebihan.
- **Solusi**:
  - Menyimpan `currentChatId` ke `localStorage` saat berubah.
  - Pada mount komponen, memulihkan `currentChatId` dari `localStorage` dan memuat chat terkait dari Supabase.
  - Menambahkan `useRef` untuk membedakan panggilan dari user action vs lifecycle.
  - Menonaktifkan `fetchChats()` berulang saat `activeChatId` berubah (cukup update state lokal).

### 3. Error 400 Bad Request Saat Menyimpan Memori
- **Gejala**: Di console browser muncul error `400 Bad Request` dengan kode `PGRST204` (kolom tidak ditemukan) saat mencoba `INSERT` ke `user_memories`.
- **Penyebab**: Payload yang dikirim frontend masih mengandung kolom `content` dan `metadata`, padahal tabel `user_memories` hanya memiliki kolom `summary` dan kolom lainnya (tanpa `content`).
- **Solusi**: Mengubah payload di `MemoryService.js` agar hanya mengirim kolom yang valid (`user_id`, `summary`, `memory_type`, `confidence`, `source`), dan menggabungkan `key` + `content` ke dalam `summary` (kemudian disempurnakan dengan hanya menggunakan `content` agar tidak ada duplikasi).

### 4. Duplikasi Teks pada Memori
- **Gejala**: Data yang tersimpan di `user_memories` terlihat seperti `"dan saya kuliah di UT: dan saya kuliah di UT"`.
- **Penyebab**: Logika penggabungan `key` dan `content` di `MemoryService.js` menimbulkan redundansi.
- **Solusi**: Mengubah `summary` menjadi hanya `content` (tanpa menambahkan `key`), sehingga data tersimpan rapi dan bersih.

### 5. Riwayat Chat Tercampur Antar Mode
- **Gejala**: Di mode ENGINEER, muncul chat dari ASSISTANT ("saya suka kopi"), mengganggu fokus.
- **Penyebab**: `ChatHistory` mengambil semua chat dari tabel `chats` tanpa filter `workspace_type`.
- **Solusi**:
  - Menambahkan properti `activeWorkspace` ke `ChatHistory`.
  - Memfilter query Supabase dengan `.eq('workspace_type', activeWorkspace)`.
  - Menambahkan dependency `activeWorkspace` ke `useEffect` agar fetch ulang saat ganti mode.

---

## File yang Diubah

| Path | Perubahan |
|------|-----------|
| `frontend/src/core/runtime/services/MemoryService.js` | Hapus kolom `content` & `metadata`; gunakan `summary`; simpan hanya `content`. |
| `frontend/src/components/workbench/ChatHistory.jsx` | Tambah filter `workspace_type`; tambah dependency `activeWorkspace`; perbaiki `useEffect`. |
| `frontend/src/components/workbench/ConversationEngine.jsx` | Persist `currentChatId` ke `localStorage`; restore saat mount; tambah guard `handleNewChat`; kirim `activeWorkspace` ke `ChatHistory`. |
| `supabase/functions/agent-process/lib/request/execution_context.ts` | Ubah `canWriteKnowledge` menjadi `true` untuk mode `ASSISTANT`. |
| `supabase/functions/agent-process/lib/request/request_pipeline.ts` | Mapping kolom `summary` saat RAG (ganti `content`). |
| `supabase/functions/agent-process/lib/rag/routing_decider.ts` | Filter `workspace_id` agar tidak mengirim string `'ws-assistant'` ke database. |

---

## Langkah Pengujian yang Telah Dilakukan

1. **Memori Lintas Percakapan**:
   - Kirim perintah `catat dan ingat saya kuliah di UT` di mode ASSISTANT.
   - Refresh halaman → tanya kembali `saya kuliah di mana?` → AI menjawab dengan "Universitas Terbuka (UT)".
   - Cek tabel `user_memories` di Supabase untuk memastikan data tersimpan dengan kolom `summary` yang benar.

2. **Auto‑New‑Chat**:
   - Refresh halaman → chat aktif tetap terbuka, tidak muncul "Percakapan Baru".
   - Klik tombol `+` → chat baru dibuat (fungsi manual tetap jalan).
   - Ganti workspace → chat tidak reset.

3. **Error 400**:
   - Simpan beberapa memori, pastikan tidak ada error di console dan data masuk ke database.

4. **Filter Chat per Workspace**:
   - Di mode ENGINEER, sidebar hanya menampilkan chat `ws-engineer`.
   - Di mode ASSISTANT, sidebar hanya menampilkan chat `ws-assistant`.
   - Chat lama yang tercampur tidak muncul lagi di daftar.

---

## Status Saat Ini

| Komponen | Status |
|----------|--------|
| ENGINEER Mode (verifikasi) | ✅ Stabil |
| Memori lintas percakapan | ✅ Berjalan |
| Chat auto‑new fix | ✅ Selesai |
| Error 400 database | ✅ Teratasi |
| Duplikasi teks memori | ✅ Bersih |
| Filter chat per workspace | ✅ Berfungsi |

**Semua perubahan sudah di‑commit dan di‑push ke GitHub (`main`).** Frontend dapat dideploy ulang (otomatis via Vercel).

---

## Catatan untuk Kedepannya

- **PR‑2 (Cleanup Database)**: Masih tertunda. Tabel `mamet_memory`, `monitors`, `checks`, `incidents`, dan `knowledge_spaces` perlu diaudit dan dihapus setelah backup.
- **Unit Test**: Belum ada unit test untuk modul memori dan chat—sebaiknya ditambahkan di masa depan.
- **Monitoring**: Disarankan untuk memantau log `agent_logs` secara berkala untuk mendeteksi anomali pada penyimpanan memori.

---

## Penutup

Pekerjaan hari ini menyelesaikan seluruh rangkaian perbaikan yang telah direncanakan sejak 23 Juli 2026. Sistem kini jauh lebih stabil, memori berfungsi lintas percakapan, dan riwayat chat terpisah sesuai mode.  
**Ekosistem Mamet siap digunakan dengan pengalaman yang lebih nyaman dan fokus.**

---

*Dokumen ini disusun pada 25 Juli 2026 sebagai arsip changelog internal.*