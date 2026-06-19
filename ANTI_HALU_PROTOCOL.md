# ANTI-HALU PROTOCOL (Developer & Agent Guidelines)

> *Dokumen ini dibuat atas instruksi eksplisit pengguna sebagai pengingat keras bagi AI (Copilot, Cursor, atau Agent) agar berhenti berasumsi dan berhenti berhalusinasi saat mengembangkan proyek ini.*

Jika Anda adalah agen AI yang sedang membaca ini, **BACA DENGAN SEKSAMA DAN PATUHI SECARA MUTLAK**.

## 🔴 ATURAN EMAS (THE GOLDEN RULES)

### 1. DILARANG MENEBAK ISI FILE (NO BLIND CODING)
- JANGAN PERNAH berasumsi tentang struktur direktori, nama variabel, atau fungsi yang ada di dalam proyek ini.
- **Wajib hukumnya** menggunakan tool `view_file` atau `grep_search` untuk membaca kode secara konkret SEBELUM Anda mengusulkan atau mengeksekusi modifikasi apa pun.
- Jika Anda tidak menemukan file yang diminta, JANGAN merekayasa atau membuat ulang file tersebut dari imajinasi Anda. Katakan: *"File tidak ditemukan, mohon periksa kembali."*

### 2. DILARANG MENGARANG NAMA FILE ATAU FUNGSI (NO FAKE REFERENCES)
- Jangan mereferensikan file yang tidak eksis di ruang kerja pengguna (misalnya menunjuk ke `utils.ts` padahal file itu tidak ada).
- Lakukan `list_dir` untuk memverifikasi jalur absolut.

### 3. JIKA TIDAK YAKIN, KATAKAN "TIDAK TAHU"
- Jika Anda terjebak, mengalami *error* kompilasi, atau tidak memahami arsitektur saat ini, BERHENTI. 
- Jangan menciptakan solusi yang terlihat masuk akal tapi merusak arsitektur (seperti *Silent Bug*). Mintalah klarifikasi kepada manusia.

### 4. DILARANG BERASUMSI SOAL DATABASE & STATE (NO GHOST SCHEMAS)
- Jangan pernah berasumsi tentang struktur tabel, kolom, atau tipe data di database (Supabase).
- Selalu verifikasi skema database dengan melihat langsung file migrasi (misal: `setup_memory_idempotency.sql`) SEBELUM Anda menulis *query* atau *RPC call* baru.
- Halusinasi kolom adalah dosa besar yang akan merusakkan integrasi Edge Function.

### 5. WAJIB HORMATI ARSITEKTUR YANG SUDAH ADA (NO JUNIOR SHORTCUTS)
- Proyek ini bukan proyek percobaan pemula. Proyek ini menggunakan arsitektur level *Senior/PhD* (CQRS, Temporal Knowledge Graph, Context Execution Binding Layer).
- Jika ada masalah memori, JANGAN menyarankan solusi dangkal seperti *"simpan saja di array JSON biasa"* atau *"buat saja filter kemiripan biasa"*.
- Pahami pola desain yang ada di `MANTRA.md` sebelum memberikan saran arsitektur. Anda harus menyesuaikan diri dengan level kompleksitas proyek, bukan menurunkannya.

### 6. EFISIENSI MANIPULASI FILE (NO BRUTE FORCE EDITS)
- Jangan pernah menghapus dan menulis ulang (*overwrite*) seluruh file yang berisi 1000+ baris hanya untuk mengganti 2 baris kode.
- Wajib gunakan tool modifikasi parsial (`replace_file_content` atau `multi_replace_file_content`) dengan menargetkan baris yang tepat (*surgical edit*). Membaca dan menulis ulang seluruh file tanpa alasan yang jelas adalah bentuk halusinasi kemalasan.

### 7. DILARANG SUNGKAN BERTANYA (THE ANTI-GUESSING RULE)
- **Problem AI:** AI sering kali mengidap *syndrome* "ingin selalu membantu", sehingga ketika instruksi pengguna ambigu atau kurang jelas, AI lebih memilih menebak maksud pengguna daripada bertanya ulang. Tebakan ini sering kali berujung pada pembuatan fitur yang salah kaprah.
- **Aturan:** Jika instruksi pengguna bisa diartikan menjadi 2 cabang arsitektur yang berbeda, atau kalimatnya tidak memiliki parameter yang cukup untuk dieksekusi, **ANDA WAJIB BERHENTI DAN BERTANYA KEPADA PENGGUNA**. 
- Dilarang keras berasumsi: *"Mungkin maksud pengguna adalah A, jadi saya akan buatkan A."* Bertanyalah: *"Apakah maksud Anda A (solusi X) atau B (solusi Y)?"*

## 🛠️ MANIFESTO ANTI-HALUSINASI UNTUK SYSTEM PROMPT (RAG / LLM)
Jika sedang merancang prompt untuk Mamet AI, patuhi formula ini:
1. **Grounding:** *"Jawab pertanyaan HANYA berdasarkan dokumen/konteks yang diberikan."*
2. **Citation:** *"Kutip secara eksplisit sumber fakta tersebut."*
3. **Graceful Fallback:** *"Jika tidak ada, wajib jawab: 'Maaf, saya tidak menemukan informasi tersebut.' Dilarang mengarang bebas."*

## 📜 KESEPAKATAN
*“Kerangkeng besi dari sistem ini adalah kenyataan. Imajinasi hanya boleh dipakai saat mendesain arsitektur baru, tetapi saat menulis kode, gunakan mata dan baca realita proyek.”* — (Diabadikan: 20 Juni 2026)
