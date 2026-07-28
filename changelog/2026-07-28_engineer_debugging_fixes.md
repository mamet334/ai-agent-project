# Changelog: Engineer Service Debugging & Fixes
**Tanggal:** 28 Juli 2026

Dokumen ini mencatat rangkaian masalah (bugs) yang ditemukan pada sistem Engineer dan eksekusi LLM, beserta perbaikan yang telah diterapkan selama sesi perbaikan.

## Masalah & Perbaikan Utama

### 1. Error 400 Bad Request pada `BrainService.js` (`executeLLM`)
*   **Masalah:** Panggilan `executeLLM` ke backend edge function `agent-process` gagal dengan status 400. Ini disebabkan oleh format payload yang tidak sesuai (mengirim `messages` berupa array padahal backend meminta `message` berupa string) dan pengiriman API key di dalam body.
*   **Perbaikan:** 
    *   Memperbarui struktur payload agar sesuai dengan spesifikasi `agent-process` (menggunakan `message`, `mode: 'ENGINEER'`, `appSource: 'engineer'`).
    *   Memindahkan pengiriman API key (BYOK) dari body ke HTTP headers khusus (`x-byok-openrouter`, `x-byok-openai`, dll).
    *   Memperbaiki logika pengambilan token autentikasi Supabase dari local storage.

### 2. Batas Ukuran Prompt File (Payload Terlalu Besar)
*   **Masalah:** Mengirim seluruh isi file besar (seperti `ConversationEngine.jsx` yang berukuran ~41KB) secara mentah ke LLM membuat payload terlalu besar dan berisiko ditolak oleh API.
*   **Perbaikan:** Menambahkan batasan ukuran file yang dikirim dalam prompt standar maksimal 8.000 karakter (4.000 karakter awal dan 4.000 karakter akhir) untuk efisiensi.

### 3. Kegagalan Parsing Respons LLM di `BrainService.js`
*   **Masalah:** Meskipun LLM merespons dengan sukses, backend `agent-process` membungkus respons dalam field `"message"`. Rantai ekstraksi (extraction chain) yang lama hanya memeriksa `"reply"`, `"content"`, atau `"text"`, sehingga patch gagal diurai.
*   **Perbaikan:** Menambahkan `result?.message` sebagai prioritas pertama dalam rantai ekstraksi `rawText`.

### 4. Crash Akibat Nilai `null` pada Patch Generator (`engineer.js`)
*   **Masalah:** Jika LLM atau backend mengembalikan format JSON yang di-wrap sedemikian rupa, ekstraksi bisa menghasilkan nilai `null` untuk `newContent`, menyebabkan crash (`TypeError: Cannot read properties of null (reading 'length')`).
*   **Perbaikan:** Menambahkan `null-guard` (pengecekan tipe string) di dalam loop pembuatan `patchFiles` dan mengabaikan key wrapper internal seperti `message`, `reply`, atau `content`.

### 5. Double-JSON Unwrapping (`engineer.js`)
*   **Masalah:** Terkadang respons dari backend membungkus string JSON dari LLM ke dalam string JSON lain secara ganda (double-escaped).
*   **Perbaikan:** Menambahkan logika di `_extractCodeFromResponse` untuk mendeteksi apabila objek hanya memiliki satu kunci (`message`/`reply`/`content`) dan nilainya berupa string JSON, maka sistem akan melakukan parse ulang (unwrap).

### 6. Bug Kritis: Blank Screen Akibat File Terpotong (Truncation)
*   **Masalah:** LLM sering kali tidak mampu mengembalikan keseluruhan isi file yang panjang secara utuh dan terpotong (truncated). `engineer.js` menimpa file asli (41.686 karakter) dengan respons yang terpotong (4.728 karakter), sehingga komponen utama rusak dan menyebabkan blank screen.
*   **Perbaikan:**
    1.  **Safety Guard (Validasi Ukuran):** Menambahkan logika sebelum menulis file. Jika ukuran file baru kurang dari 50% ukuran file asli (untuk file di atas 500 karakter), maka penulisan otomatis ditolak (ditandai `FAILED`) dan memberikan peringatan ke UI.
    2.  **Strategi Prompt SEARCH-REPLACE:** Mengubah strategi prompt untuk file besar (>6.000 karakter). Daripada meminta LLM mengembalikan seluruh isi file, Engineer kini meminta LLM menggunakan format JSON `SEARCH-REPLACE` (`{"__mode": "search_replace", "changes": [{"search": "...", "replace": "..."}]}`).
    3.  **Processor SEARCH-REPLACE:** Membangun parser di `_executePatchApplication` yang membaca perintah search-replace, menerapkannya ke konten file asli, dan merangkai kembali file yang utuh sebelum disimpan.
