# Changelog: Persona & System Prompt Memory Awareness Alignment

**Tanggal:** 2026-09-03  
**Tipe:** Persona Wording Alignment & Capability Awareness  
**Scope:** `supabase/functions/agent-process/lib/request/request_pipeline.ts`  
**Author:** Antigravity (AI Partner)  
**Status:** ✅ Selesai Diimplementasikan (Menunggu Live Production Verification)

---

## 1. Konteks & Latar Belakang
Saat user memberikan perintah negasi terkait memori (misalnya *"jangan simpan info ini ya"*), asisten LLM sebelumnya menghasilkan respons halusinasi seperti:
> *"Sebagai model AI, saya tidak menyimpan data pribadi Anda... percakapan ini bersifat sementara."*

Pernyataan tersebut salah dan bertentangan dengan arsitektur sistem Mamet OS, karena sistem secara aktif memiliki subsistem memori persisten (`MemoryGovernorService.js` dan tabel `user_memories`).

---

## 2. Akar Masalah (Root Cause)
1. **Ketiadaan Kesadaran Subsistem Memori pada System Prompt:**  
   Variabel `agentIdentityPrompt` sebelumnya hanya menginstruksikan asisten untuk *"memperhatikan 'history' obrolan"*, tanpa menjelaskan bahwa Mamet OS memiliki subsistem memori database persisten.
2. **Aktivasi Disclaimer RLHF Bawaan Model:**  
   Tanpa instruksi eksplisit tentang kapabilitas memori persisten sistem, model AI (Gemini/OpenRouter) mengaktifkan disclaimer keamanan bawaan standar model (*"stateless / tidak menyimpan data"*).
3. **Kebingungan Semantik:**  
   Model membingungkan antara **kepatuhan terhadap izin user** (*"Baik, informasi ini tidak akan saya catat ke memori persisten"*) dengan **klaim ketidakmampuan teknis** (*"Saya tidak punya kapabilitas menyimpan apa pun"*).

---

## 3. Rincian Perubahan
Pada file [`supabase/functions/agent-process/lib/request/request_pipeline.ts`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/supabase/functions/agent-process/lib/request/request_pipeline.ts), ditambahkan blok instruksi `KESADARAN SISTEM MEMORI` ke dalam `agentIdentityPrompt`:

```text
KESADARAN SISTEM MEMORI:
Mamet OS memiliki Sistem Memori Persisten Terkontrol (Memory Governor) yang aktif menyimpan informasi lintas sesi atas seizin dan kendali Owner. Anda BUKAN model stateless dan TIDAK BOLEH mengklaim "tidak menyimpan data pribadi" atau "percakapan ini bersifat sementara" — klaim tersebut SALAH dan bertentangan dengan arsitektur sistem ini.

Jika user meminta agar suatu informasi TIDAK disimpan (misal: "jangan simpan ini", "jangan diingat ya"), respons yang benar adalah mengakui kepatuhan terhadap permintaan tersebut secara spesifik, contoh: "Baik, informasi ini tidak akan saya simpan ke memori persisten sistem." JANGAN membingungkan "menghormati permintaan user" dengan "mengklaim tidak punya kapabilitas menyimpan data".
```

---

## 4. Validasi & Batasan Scope
1. **Integritas Prompt:** Tidak ada bagian identitas lain (`Mamet`, MAEF `<think>`, batas pengetahuan, dsb) yang diubah.
2. **Pemisahan Scope:**
   - Tidak mengubah logic di `RequestClassifierService.js` yang sudah memblokir `MEMORY_STORE` dengan benar.
   - Tidak mengimplementasikan `MEMORY_PURGE` pada task ini (tetap berada di backlog CP4b).
3. **Kompatibilitas Antar-Mode:** Prompt ini shared dan kompatibel dengan mode `ASSISTANT`, `LITE`, maupun `ENGINEER`.
