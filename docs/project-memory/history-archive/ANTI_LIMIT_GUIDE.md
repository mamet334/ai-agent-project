# 🥷 Jurus Rahasia Anti-Limit Mamet AI

## Apa yang Sudah Dipasang

Sistem **5 Lapis Pertahanan Anti-429** telah diimplementasikan di backend:

### Lapis 1: Multi-Key Rotation 🔄
Mamet sekarang bisa menerima **banyak Gemini API key** sekaligus (dipisahkan koma).
Saat key pertama kena limit, otomatis pindah ke key berikutnya.

### Lapis 2: Exponential Backoff ⏱️
Jika SEMUA key kena limit, Mamet menunggu (1s → 2s → 4s) lalu mencoba ulang.
Maksimum 3 ronde percobaan sebelum menyerah.

### Lapis 3: Provider Cascading 🔀
Jika semua Gemini keys gagal, otomatis cascade:
```
Gemini (multi-key) → Groq (gratis) → OpenRouter (free models)
```
User tidak akan melihat error 429 lagi — Mamet diam-diam pindah otak.

### Lapis 4: Coordinator Hemat Kuota 🧠
Si "Kepala Agent" (routing AI) pakai otak sendiri yang terpisah — tidak memakan kuota model utama.

### Lapis 5: Stream Fallback 📡
Bahkan **streaming responses** pun punya fallback! Jika stream Gemini kena 429,
otomatis pindah ke stream Groq atau OpenRouter.

---

## Langkah Anda untuk Memaksimalkan

### 1. Buat 3-5 Gemini API Key GRATIS
Buka: https://aistudio.google.com/apikey

- Login dengan **akun Google berbeda** (bisa pakai gmail cadangan)
- Klik "Create API Key" → pilih project → copy key
- Ulangi dengan akun Google lain

> **Penting:** Setiap akun Google mendapat kuota Gemini **gratis** terpisah! Dengan 5 akun = 5x lipat kuota!

### 2. Set Keys di Supabase (dipisahkan KOMA)
Di dashboard Supabase → Settings → Edge Functions → Secrets:
```
GEMINI_API_KEY = key1,key2,key3,key4,key5
```

Atau via CLI:
```bash
npx supabase secrets set GEMINI_API_KEY="key1,key2,key3,key4,key5" --project-ref uuyzdjifhdfyyvpxsofu
```

### 3. (Bonus) Tambahkan Groq Key GRATIS
Buka: https://console.groq.com/keys
- Daftar akun → Create API Key → copy
```
GROQ_API_KEY = gsk_xxxxx
```
Groq memberikan **~100 request/menit GRATIS** dengan Llama model.

### 4. (Bonus) Tambahkan OpenRouter Key
Buka: https://openrouter.ai/settings/keys
- Daftarkan API Key Anda.
- **Catatan Penting:** Di sistem Mamet AI, opsi OpenRouter bawaan pada dropdown menu (seperti `Gemini 2.0 Flash Exp` dan `Llama 3 8B`) sengaja dialihkan secara otomatis di backend ke model gratis **`meta-llama/llama-3.1-8b-instruct:free`**. Hal ini dilakukan untuk mematangkan kestabilan dan melindungi saldo OpenRouter Anda agar tidak terpotong (100% gratis). Saldo hanya akan terpotong jika Anda sengaja menambahkan model berbayar kustom di luar menu dropdown bawaan.
```
OPENROUTER_API_KEY = sk-or-xxxxx
```

---

## Diagram Alur Anti-Limit

```
Request masuk
    │
    ├─→ Gemini Key #1 ─── 429? ──→ Gemini Key #2 ─── 429? ──→ Key #3...
    │                                                               │
    │   (semua key habis)                                          │
    │       │                                                      │
    │       ├──→ Tunggu 1s → Retry semua key                      │
    │       ├──→ Tunggu 2s → Retry semua key                      │
    │       ├──→ Tunggu 4s → Retry semua key                      │
    │       │                                                      │
    │   (masih gagal semua)                                        │
    │       │                                                      │
    │       ├──→ 🟢 Groq (gratis) ─── gagal? ──→ OpenRouter (free)│
    │       │                                                      │
    │   (semua mati)                                               │
    │       └──→ ⚠️ Pesan ramah ke user: "Coba lagi nanti"        │
    │                                                              │
    └─→ ✅ Response berhasil dikirim ke user                       │
```
