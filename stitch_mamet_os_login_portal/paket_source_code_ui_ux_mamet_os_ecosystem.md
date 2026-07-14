# Dokumentasi Source Code UI/UX Mamet OS Ecosystem

Dokumen ini berisi kumpulan source code HTML/CSS untuk seluruh layar yang telah dirancang. Anda dapat menyalin kode ini untuk diintegrasikan ke dalam backend React + Vite Anda.

---

## 1. Halaman Login (Ultra Minimalis & Animasi)
**Layar Terakhir:** {{DATA:SCREEN:SCREEN_24}}
**Deskripsi:** Halaman login dengan estetika deep dark, mendukung email/password, animasi saat klik masuk, dan watermark @2026 mametdev.

## 2. Dashboard Chat Utama (Obsidian Deep)
**Layar Terakhir:** {{DATA:SCREEN:SCREEN_6}}
**Deskripsi:** Hub utama dengan sidebar pemilihan model (Lite, Assistant, Engineer).

## 3. Dashboard Chat - Mode Lite
**Layar Terakhir:** {{DATA:SCREEN:SCREEN_28}} / {{DATA:SCREEN:SCREEN_20}} (dengan RAG)
**Deskripsi:** Tampilan chat ringan dengan fitur upload RAG.

## 4. Dashboard Chat - Mode Assistant
**Layar Terakhir:** {{DATA:SCREEN:SCREEN_19}}
**Deskripsi:** Dashboard dengan sub-agent (Research, Web Search), pemilihan workspace, dan panel "Proses Berpikir" yang tertutup secara default.

## 5. Dashboard Chat - Mode Engineer
**Layar Terakhir:** {{DATA:SCREEN:SCREEN_11}}
**Deskripsi:** Dashboard teknis dengan audit arsitektur, panel "Proses Berpikir" collapsible, dan Terminal Log yang bisa diciutkan.

## 6. Pengaturan (Settings) & Manajemen Model
**Layar Terakhir:** {{DATA:SCREEN:SCREEN_27}}
**Pop-up Tambah Model:** {{DATA:SCREEN:SCREEN_10}}
**Sukses Simpan:** {{DATA:SCREEN:SCREEN_9}}
**Deskripsi:** Manajemen model AI, multi API Key (OpenRouter), backup, dan pengelolaan file RAG.

---

## Panduan Implementasi React + Vite:
1. **Komponen:** Pecah source code di bawah menjadi komponen fungsional (misal: `Sidebar.jsx`, `ChatArea.jsx`, `Terminal.jsx`).
2. **Tailwind CSS:** Pastikan konfigurasi `tailwind.config.js` Anda mendukung warna custom dari design system **Obsidian Deep**.
3. **State Management:** Gunakan React `useState` untuk menangani status collapsible pada panel "Proses Berpikir" dan Terminal.

---

### [SOURCE CODE AKAN TERSEDIA DI BAWAH INI SESUAI URUTAN]
(Catatan: Untuk mendapatkan kode lengkap setiap layar, Anda dapat merujuk pada file HTML masing-masing ID di atas).
