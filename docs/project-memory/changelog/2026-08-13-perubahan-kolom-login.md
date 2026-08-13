# 📝 Changelog: Implementasi Halaman Login Interaktif, Neon Branding & Perbaikan UI (2026-08-13)

## Ringkasan
Hari ini (13 Agustus 2026) kami menyelesaikan pengembangan halaman login baru yang imersif dengan tema "Lampu Meja Kerja". Fokus utama adalah:
1. Membangun komponen **`LampLogin.jsx`** sebagai pengganti halaman login standar.
2. Mengintegrasikan logika sakelar fisik pada lampu meja untuk menampilkan/menyembunyikan panel login *(Glassmorphism)*.
3. Menambahkan **efek pencahayaan realistis** (pantulan cahaya di dinding dan meja) serta tekstur dinding *fractal noise* untuk menggantikan garis-garis kaku.
4. Menambahkan **branding "Mamet OS Ecosystem"** dengan efek neon (glow) pada dinding.
5. Memperbaiki berbagai masalah *styling* yang terkait dengan browser (autofill Chrome, input putih) dan responsivitas layar laptop.

---

## Daftar Masalah yang Ditemukan & Diperbaiki

### 1. Halaman Login Kurang Menarik dan Terlihat "Kaku"
- **Gejala**: Form login standar putih (dari kode sebelumnya) masih menggunakan desain kotak biasa dan tombol biru, tidak menyatu dengan tema *dark mode* dan estetika OS.
- **Penyebab**: Belum ada komponen custom yang mengatur pengalaman visual pengguna saat masuk.
- **Solusi**:
  - Membuat komponen `LampLogin.jsx` yang menggantikan komponen `Login.jsx`.
  - Mendesain *scene* ruangan 3D (gradien radial dan linear, meja, lampu SVG interaktif).
  - Menambahkan efek pantulan cahaya (dinding & meja) menggunakan `radial-gradient` dengan opasitas yang berubah sesuai sakelar.
  - Mengganti gaya panel login menjadi *Glassmorphism* (background transparan dengan `backdrop-blur` dan *border* bercahaya).

### 2. Input Login Berubah Putih Cerah Saat Autofill Chrome
- **Gejala**: Saat browser Chrome mengisi email dan password secara otomatis, warna background input menjadi putih bersih meskipun sudah diatur `bg-[rgba(5,5,5,.25)]` di Tailwind.
- **Penyebab**: Browser memaksa *user-agent stylesheet* untuk elemen `input` yang sedang diisi otomatis.
- **Solusi**:
  - Menambahkan CSS khusus `input:-webkit-autofill` dengan `-webkit-box-shadow` inset berwarna gelap untuk menutupi background putih.
  - Menggunakan inline-style (`style={{ backgroundColor: 'rgba(5,5,5,.25)' }}`) agar gaya lebih kuat daripada CSS global aplikasi Mamet OS.

### 3. Branding Mamet OS Terlalu Kecil dan Tidak Terlihat (Ikon Terpotong)
- **Gejala**: Branding di dinding terlampaui kecil, ikon CPU terpotong ke layar, dan tulisan tidak proporsional dengan luas layar.
- **Penyebab**: Dimensi awal menggunakan `text-[10px]` dan `w-5 h-5` pada ikon, serta `top-[6%] left-[5%]` yang menyebabkan elemen mepet ke kiri atas.
- **Solusi**:
  - Mengubah ukuran font menjadi `text-2xl lg:text-6xl`.
  - Memperbesar ikon CPU menjadi `w-10 lg:w-16`.
  - Menambahkan efek *drop-shadow* multi-layer (shadow `0 0 10px` hingga `0 0 80px`) untuk menciptakan efek neon yang menyala di sekeliling teks dan ikon.
  - Memposisikan branding ke tengah layar: `left-1/2 -translate-x-1/2 top-[18%] lg:top-[22%]`.

### 4. Panel Login Terpotong dan Tidak Responsif di Layar Laptop
- **Gejala**: Panel login yang terlalu lebar (`w-[min(38vw,430px)]`) dan jarak ke kanan (`right-[7%]`) menyebabkan isi panel terpotong di layar laptop (resolusi 1366x768).
- **Penyebab**: Ukuran absolut dan persentase tidak menyesuaikan dengan ruang layar yang lebih sempit saat DevTools terbuka atau pada layar laptop standar.
- **Solusi**:
  - Menggunakan Tailwind responsif: `w-[min(90vw,360px)] lg:w-[min(38vw,430px)]`.
  - Mengurangi padding dan tinggi input pada layar kecil: `p-[24px] lg:p-[38px_40px_34px]`, `h-[50px] lg:h-[58px]`.
  - Menyesuaikan posisi panel: `top-[10%] lg:top-[8%]` dan `right-[5%] lg:right-[7%]`.

### 5. Tekstur Dinding Terlihat Seperti Garis-Garis Kisi
- **Gejala**: Dinding sebelumnya menggunakan `repeating-linear-gradient`, menghasilkan garis-garis horizontal dan vertikal yang terlihat sangat kaku seperti kisi-kisi matematis.
- **Penyebab**: Penggunaan `repeating-linear-gradient` pada elemen CSS yang tidak memiliki *noise* alami.
- **Solusi**: Mengganti `repeating-linear-gradient` dengan **SVG Fractal Noise** (menggunakan `filter="url(#noiseFilter)"`), lalu diterapkan sebagai `backgroundImage` dengan `mix-blend-overlay`. Ini menciptakan tekstur berbutir/plester yang jauh lebih realistis.

### 6. React DOM Property Error pada SVG Filter
- **Gejala**: Console browser menampilkan *warning*: `Invalid DOM property 'flood-color'. Did you mean 'floodColor'?`
- **Penyebab**: React (JSX) tidak mengenali properti dengan tanda hubung (seperti `flood-color`) pada elemen SVG `<feDropShadow>`, karena JSX menggunakan camelCase.
- **Solusi**: Mengganti semua properti SVG dengan tanda hubung menjadi camelCase: `floodColor` dan `floodOpacity`.

### 7. Sakelar Tidak Bisa Diklik Saat DevTools Terbuka
- **Gejala**: Saat DevTools (Ctrl+Shift+I) dibuka, area tombol sakelar lampu (yang semula menggunakan overlay `<button>` tersembunyi) bergeser dan tidak dapat diklik.
- **Penyebab**: Koordinat tombol overlay menggunakan CSS *absolute* (`left: '153px', bottom: '75px'`) yang nilainya statis. Saat DevTools membuka panel di kanan atau bawah, layout layar berubah dan koordinat tersebut tidak lagi presisi.
- **Solusi**: Menghapus tombol overlay `<button>` dan memindahkan event `onClick={toggleLamp}` langsung ke elemen SVG `<g id="powerSwitch">` agar area klik selalu presisi mengikuti posisi SVG sebenarnya.

---

## File yang Diubah

| Path | Perubahan |
|------|-----------|
| `frontend/src/components/LampLogin.jsx` | **File Baru.** Komponen utama halaman login baru. Berisi scene 3D (dinding, meja, lampu), logika sakelar, panel login glassmorphism, formulir masuk/daftar, input yang diperbaiki, dan branding neon. |
| `frontend/src/App.jsx` | Mengganti import komponen `<Login>` menjadi `<LampLogin>` dan memperbarui logika routing session. |
| `frontend/src/supabase.js` | **Tidak diubah**, tetapi digunakan sebagai *client* utama untuk autentikasi (`supabase.auth.signInWithPassword` & `supabase.auth.signUp`). |
| `frontend/src/components/os/OSDesktopShell.jsx` | **Tidak diubah**, namun sudah disiapkan sebagai tujuan navigasi setelah login berhasil. |

---

## Langkah Pengujian yang Telah Dilakukan

1. **Sakelar & Lampu**:
   - Klik tombol sakelar di pangkal lampu meja → panel login *Glassmorphism* dan cahaya dinding/meja muncul dengan transisi halus.
   - Klik kembali sakelar → panel login dan efek cahaya menghilang dengan mulus.

2. **Fitur Login & Daftar (Supabase)**:
   - Mengisi email dan password, lalu menekan tombol `MASUK`. Pastikan sistem memvalidasi kredensial dengan Supabase.
   - Mengklik teks `Belum punya akun? Daftar`, kolom form berubah menjadi mode `DAFTAR`, dan tombol submit berubah menjadi `DAFTAR`.
   - Menguji validasi error dengan memasukkan password salah → muncul *alert* merah dengan pesan error dari Supabase.

3. **Input Autofill Chrome**:
   - Mengaktifkan fitur autofill di browser Chrome, membiarkan browser mengisi email dan password secara otomatis. Pastikan background input tetap gelap transparan (`rgba(5,5,5,.25)`) dan teks tetap putih.

4. **Responsivitas Layar Laptop**:
   - Menjalankan aplikasi di layar laptop 1366x768 atau membuka DevTools dengan ukuran ~768px.
   - Pastikan panel login muncul di kanan, tidak terpotong, dan tidak menabrak lampu di sebelah kiri. Branding Mamet OS tetap berada di tengah layar dengan ikon CPU yang terlihat utuh.

5. **Console Browser**:
   - Buka DevTools, periksa tab console. Pastikan tidak ada *warning* `Invalid DOM property` terkait SVG `flood-color`, dan tidak ada error 400 dari Supabase.

---

## Status Saat Ini

| Komponen | Status |
|----------|--------|
| `LampLogin` (Tampilan & Interaktivitas) | ✅ Stabil |
| Logika Sakelar Lampu & Transisi | ✅ Berjalan |
| Login & Daftar (Supabase Auth) | ✅ Terintegrasi |
| Reset Chrome Autofill (Background Putih) | ✅ Teratasi |
| Branding Neon (Posisi & Ukuran) | ✅ Selesai & Rapi |
| Panel Responsif (Laptop 1366x768) | ✅ Berfungsi |
| SVG Filter Error (Console) | ✅ Bersih |

**Semua perubahan sudah di-commit dan siap di-push ke GitHub (`main`).** Frontend dapat dideploy ulang secara manual atau otomatis (via Vercel/Vite).

---

## Catatan untuk Kedepannya

- **Penambahan Suara Sakelar**: Saat tombol sakelar ditekan, belum ada efek suara. Di masa mendatang, bisa ditambahkan audio *click* agar interaksi lebih realistis.
- **Penyempurnaan Animasi Lanjutan**: Untuk efek cahaya bohlam, saat ini masih menggunakan *state* CSS. Ke depannya bisa ditambahkan `framer-motion` atau *CSS keyframes* agar cahaya bertahap (bohlam dulu, dinding kemudian, meja terakhir) menyerupai lampu nyata.
- **Unit Test**: Belum ada unit test untuk komponen `LampLogin`. Disarankan untuk menambahkan pengujian untuk logika toggle lampu dan *form submission*.

---

## Penutup

Pekerjaan hari ini menyelesaikan pengembangan halaman login interaktif dengan desain *workbench* premium, menggabungkan tiga elemen besar: **estetika (lampu dan ruangan)**, **fungsionalitas (sakelar dan autentikasi)**, serta **kemudahan akses (responsivitas dan perbaikan autofill)**. Dengan perubahan ini, **Ekosistem Mamet kini memiliki pintu masuk yang elegan, imersif, dan siap digunakan** oleh pengguna akhir.

---

*Dokumen ini disusun pada 13 Agustus 2026 sebagai arsip changelog internal.*