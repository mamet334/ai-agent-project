# Temuan: Edge Function health-check tidak memiliki verifikasi JWT

**Tanggal:** 2026-07-13
**Konteks:** Audit Keamanan Lanjutan (Priority 4 - UI Compliance Review)

### 🚨 PRA-EKSEKUSI (Laporan Kerentanan)

Berdasarkan investigasi terhadap modul `DisasterRecoveryWidget.jsx` dan panggilannya ke `GET /health-check`, ditemukan celah keamanan kritis pada *backend*:

Fungsi `supabase/functions/health-check/index.ts` saat ini **TERBUKA UNTUK PUBLIK (Unauthenticated)**.

**Detail Kerentanan:**
1. **Tidak Ada Otorisasi:** Fungsi ini sama sekali tidak membaca *header* `Authorization: Bearer <token>` dan tidak melakukan pemanggilan `supabase.auth.getUser(token)`. 
2. **Penggunaan Service Role Langsung:** Fungsi ini langsung menginisialisasi Supabase Client menggunakan `SUPABASE_SERVICE_ROLE_KEY`.
3. **Risiko Eksploitasi (High Severity):** 
   - **Data Leakage:** Penyerang tanpa otentikasi dapat melihat daftar URL internal (*monitors*) beserta status peladen.
   - **Denial of Service (DoS):** Penyerang dapat melakukan *spamming* permintaan HTTP berulang-ulang, yang akan memicu eksekusi *ping* massal dan menghabiskan kuota Supabase secara instan.
   - **Telegram Spam:** Karena kegagalan di-log dan dikirim ke Telegram, serangan DoS pada fungsi ini akan menyebabkan *flooding* pesan otomatis ke grup/admin Telegram yang dikonfigurasi.

**Rencana Perbaikan:**
Saya akan menginjeksi blok validasi JWT standar (seperti yang ada di `backup-restore`) ke dalam `health-check/index.ts` untuk memblokir permintaan tak berizin dengan HTTP 401 Unauthorized, sebelum klien melakukan inisialisasi `SERVICE_ROLE`.

---

### ✅ IMPLEMENTASI PERBAIKAN

**Status: Berhasil Diterapkan (2026-07-13)**

Telah dilakukan penambalan arsitektur keamanan (*Security Patch*) pada `supabase/functions/health-check/index.ts`:

1. **Pemblokiran Dini (Early Return 401):** Fungsi kini mengambil *header* `Authorization: Bearer <token>` dan menolaknya jika kosong.
2. **Validasi Kriptografis (Anon Client):** Fungsi membuat `anonClient` sementara untuk mengeksekusi `await anonClient.auth.getUser(token)`. Ini memvalidasi token JWT ke *Supabase Auth Server*.
3. **Pencegahan Data Leak:** Jika token kedaluwarsa atau tidak valid, fungsi akan langsung mengembalikan status HTTP 401 (Unauthorized) beserta `console.warn('Health Checker: Unauthorized access attempt')`.
4. **Isolasi Logika Service Role:** `SERVICE_ROLE_KEY` (bypass RLS) baru diaktifkan **SETELAH** pengguna terbukti valid. Hal ini memastikan operasi *read/write* internal ke tabel `monitors` dan `checks` aman dari eksploitasi pihak luar.

Kerentanan DoS dan kebocoran URL internal (CWE-200) resmi ditutup.
