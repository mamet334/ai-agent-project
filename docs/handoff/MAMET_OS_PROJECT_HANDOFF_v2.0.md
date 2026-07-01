# MAMET OS PROJECT HANDOFF (V2.0)

**Date of Handoff**: 2026-06-30  
**Document Purpose**: Single Source of Truth for Engineering Resumption

---

## 1. Executive Summary

- **Visi Mamet OS**: Membangun ekosistem AI pribadi yang beroperasi sebagai *Operating System* sejati (memiliki identitas, kernel, layanan latar belakang, dan memori permanen), bukan sekadar aplikasi web (SPA) konvensional.
- **Tujuan Architecture V2**: Mengubah paradigma dari *Web Page Routing* (di mana state musnah saat berpindah halaman) menjadi *Persistent Desktop Application* (di mana setiap Aplikasi hidup berdampingan, mempertahankan *state*, dan diorkestrasi oleh *Application Manager*).
- **Filosofi Engineering**: *Architecture First*, *Root Cause First*, *Evolution Without Chaos*, *Verification Before Trust*, dan *Vendor Independence* (Sesuai dengan Konstitusi MAEF V3).

---

## 2. Current Status

**Architecture V2**  
- **Status**: CERTIFIED  
- **Phase**: Feature Development  
- **Architecture Freeze**: ACTIVE (V2 terkunci sebagai baseline)  
- **Engineering Mode**: Capability Development  

---

## 3. Completed Milestones

Berikut adalah rekam jejak penyelesaian Migrasi V2 secara penuh:

- [x] Kernel Boot Sequence
- [x] Runtime Layer (Event Bus)
- [x] Service Manager (Dependency Injection)
- [x] Application Manager (App State Retention via CSS)
- [x] Window Manager Foundation (Split Screen & Floating API)
- [x] Activity Bar (Global Sidebar)
- [x] Workspace Isolation (Context Boundary per App)
- [x] Architecture Validation
- [x] Acceptance Test
- [x] Architecture Certification

---

## 4. Current Architecture

Hierarki resmi dari sistem operasi saat ini (Top to Bottom):

1. **Kernel**: *Bootloader* utama dan penjaga status OS (COLD, BOOTING, RUNNING).
2. **Runtime Layer**: Tulang punggung komunikasi (`EventBus`) yang memisahkan pengirim dan penerima sinyal.
3. **Service Manager**: Pusat *Dependency Injection*. Tempat seluruh layanan tingkat tinggi mendaftarkan diri.
4. **Application Manager**: Mengatur siklus hidup Aplikasi (Register, Activate, Background, Suspend).
5. **Window Manager**: Mengorkestrasi tata letak visual level OS (*Floating Windows*, *Split Panes*).
6. **Application**: Entitas program mandiri (Assistant, Engineer, Memory, Research).
7. **Workspace**: Konteks lingkungan/proyek yang sedang dikerjakan di dalam Aplikasi.
8. **Session**: Status aktif spesifik (misal: percakapan yang sedang berlangsung).
9. **Conversation**: Muatan data (Payload) obrolan atau *logs*.

---

## 5. Engineering Rules

Aturan mutlak yang **WAJIB** dipatuhi pada sesi *engineering* berikutnya:

- **Architecture V2 adalah baseline resmi.** Tidak boleh ada pembongkaran ulang.
- **Tidak boleh ada redesign besar** atau penambahan layer arsitektur baru.
- **RFC tidak boleh langsung diimplementasikan** kecuali berstatus *blocker* mutlak. RFC masuk ke *Backlog*.
- **Root Cause First**. Jangan mengobati simptom, temukan akar masalahnya.
- **No Workaround. No Hidden Technical Debt.** Jangan menggunakan retasan (*hacks*).
- **Feature Development berjalan di atas Architecture V2**, bukan mengubah V2.
- Jika terjadi insiden arsitektural, buat **Architecture Incident Report** terlebih dahulu sebelum memperbaiki.

---

## 6. Current Code Status

Daftar modul inti OS dan fungsinya:

- `core/runtime/Kernel.js`: Mesin *boot* utama. Memiliki *Boot Lock* anti-*race-condition*.
- `core/runtime/ServiceManager.js`: Wadah registrasi DI. Mencegah penggunaan pola *Global Singleton* konvensional.
- `core/runtime/EventBus.js`: Saraf komunikasi UI dan *State*.
- `core/application/ApplicationManager.js`: Menjaga memori/status aplikasi yang tidak aktif agar tetap hidup.
- `core/window/WindowManager.js`: Menyediakan API struktural untuk *Floating* dan *Split Screen*.
- `core/workspace/WorkspaceManager.js`: Mengelola data posisi *Widget* dan isolasi *Context* per Aplikasi.
- `components/os/ActivityBar.jsx`: Navigasi level tertinggi (Kiri ekstrim). Berkomunikasi dengan `ApplicationManager`.
- `components/os/ApplicationContainer.jsx`: *Container* utama yang merender *semua* Aplikasi secara bersamaan namun menyembunyikan yang tidak aktif via CSS `display: none`.
- `components/workbench/AppShell.jsx`: Cangkang antarmuka yang membungkus *Main Panel* spesifik (misal: *ConversationEngine*) bersama dengan *Widgets*.

---

## 7. Technical Debt

Daftar utang teknis yang telah diidentifikasi dan ditunda (Hanya Dokumentasi):

1. **Kernel Shutdown Hook**: Tidak ada mekanisme rutin pembersihan (*cleanup*) formal ketika pengguna menutup tab peramban.
2. **Persistence Throttling**: Penyimpanan layout ke basis data Supabase belum memiliki *Debouncer*, berpotensi menguras limit API jika *window* di-*resize* secara intens.
3. **No Background Task Scheduler**: OS belum memiliki penjadwal tugas (*Queue*) untuk memisahkan eksekusi AI berat dari blokade *Main UI Thread*.

---

## 8. Approved RFC

Daftar *Request For Change* resmi yang telah disetujui secara arsitektural:

- **RFC-010**: OS-Level Debouncer Service (Status: **Planned**)
- **RFC-011**: Kernel-First Bootloader (Status: **Future**)
- **RFC-012**: Task Scheduler Service (Status: **Future**)
- **GAP-006 Resolution**: Universal AI Adapter Integration (Status: **Planned**)

*(Jangan mengimplementasikan daftar ini kecuali sebagai bagian dari roadmap fitur).*

---

## 9. Capability Roadmap

Urutan prioritas pengembangan fungsionalitas (Fitur) ke depan:

1. **Intelligence Track**: *Context Fusion Automation* (Menyatukan memori & *knowledge* ke prompt LLM secara otomatis).
2. **Engineering Track**: *Local Sandbox Execution* (Memungkinkan AI untuk mengeksekusi *code* dan *terminal* dari dalam *Engineer Console*).
3. **UX Track**: *Interactive Golden Layout* (Mengimplementasikan pustaka *drag-and-drop* ke *Window Manager Foundation* yang sudah ada).
4. **Memory Track**: *Cognitive Memory Compressor* (Menyusutkan token obrolan masa lalu secara otonom).

---

## 10. Known Risks

- **React Strict Mode Side-Effects**: React berasumsi bahwa ia mengendalikan *lifecycle*. Meskipun `Kernel Boot Lock` telah menetralkan *race condition* inisialisasi, ketergantungan OS *booting* pada komponen React (`App.jsx`) tetap membawa risiko arsitektural jangka panjang (menunggu RFC-011).
- **Token Bloat**: Percakapan yang dipertahankan terus-menerus tanpa kompresi akan menyebabkan memori konteks melampaui limit token AI.
- **Layout Corruption**: Format JSON pada `localStorage` sangat rentan berubah. Validasi skema di `WorkspaceManager` harus terus dijaga kerangka keamanannya.

---

## 11. Engineering Lessons Learned

- **Yang Berhasil**: Paradigma "Sembunyikan via CSS (`display: none`)" adalah kunci utama keberhasilan retensi *State*. Komponen React tidak dihancurkan (*unmount*), sehingga OS terasa secepat kilat (instan).
- **Yang Gagal/Menyulitkan**: Menjadikan komponen React (seperti `ApplicationManager` lawas) sebagai *Event Emitter* memicu kerumitan *rendering*.
- **Yang Tidak Boleh Diulang**: Membuat fungsi logika bisnis yang memanggil `fetch` atau API eksternal secara diam-diam tanpa melalui *Adapter Layer* dan *Service Manager*.

---

## 12. Next Engineering Session

**Jika proyek dilanjutkan kembali:**

- **Apa yang harus dilakukan pertama kali**:
  1. Baca dokumen Handoff ini secara teliti.
  2. Lakukan `npm run build` dan `npm run dev` untuk memverifikasi proyek menyala dengan benar.
  3. Buka konsol *browser*, pastikan `[KERNEL] System Ready` hanya tercetak satu kali.
  4. Pilih salah satu **Capability** dari Roadmap (Bagian 9) untuk dikembangkan.

- **Apa yang tidak boleh dilakukan**:
  - JANGAN memodifikasi alur `Kernel.js`, `ServiceManager.js`, `EventBus.js` atau struktur dasar Arsitektur V2 tanpa persetujuan *Owner* via *Architecture Incident Report*.
  - JANGAN membuat *Library* arsitektural baru untuk sesuatu yang bisa diselesaikan dengan menambahkan Fitur/Aplikasi.

- **Bagaimana memverifikasi bahwa proyek masih sehat**:
  - Klik *Engineer App* dan *Assistant App* di *Activity Bar*. Perpindahan harus instan tanpa *loading bar*.
  - Pastikan teks di kotak obrolan *Assistant App* tidak hilang saat beralih ke *Engineer App*.

- **Bagaimana memulai feature development tanpa menyentuh Architecture V2**:
  - Buat aplikasi baru dengan mendaftarkannya di `App.jsx` menggunakan `applicationManager.registerApp()`.
  - Gunakan `ServiceManager.get()` untuk mengambil layanan, jangan mengimpor *instance* langsung.
  - Jika membuat antarmuka melayang, gunakan `windowManager.spawnFloatingWindow()`.

---

## 13. Final Project Status

**Project**: Mamet OS  
**Architecture**: V2 Certified  
**Engineering**: Ready for Feature Development  
**Architecture Freeze**: Completed  
**Next Target**: Capability Development  

---
*END OF HANDOFF DOCUMENT*
