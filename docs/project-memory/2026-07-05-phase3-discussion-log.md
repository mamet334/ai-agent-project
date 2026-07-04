# 🗣️ Materi Diskusi Instruktur (Engineering Discussion Guide) - Phase 3

**Date:** July 5, 2026
**Topic:** Phase 3 Metadata-Driven UI Architecture Paradigm

*Bagian ini digunakan sebagai panduan diskusi teknis atau pengarahan (*knowledge transfer*) kepada tim engineer terkait paradigma baru Mamet Ecosystem.*

### 1. Paradigma "Zero-React Modification"
**Topik:** Menambah Aplikasi atau Widget Baru
*   **Diskusi:** *"Mengapa kita tidak boleh lagi menyentuh App.jsx atau ActivityBar.jsx ketika membuat aplikasi baru?"*
*   **Poin Kunci:** Jelaskan prinsip pemisahan *Business Logic* dari *Presentation Layer*. Kini, apabila ada aplikasi baru (misal: "Terminal" atau "IDE"), _engineer_ hanya bertugas menulis kode aplikasinya, mendaftarkannya di `AppRegistry.js`, lalu sisa integrasi sistemnya dilakukan dengan mengubah baris JSON di `system.json` dan `navigation.json`. *Sidebar* dan navigasi akan menyesuaikan diri secara gaib (otomatis).

### 2. Arsitektur "Capability-Based Security" (Graph Mapping)
**Topik:** Konsep Pemutusan Wewenang Berantai
*   **Diskusi:** *"Bagaimana sistem menentukan bahwa Mamet Lite tidak bisa mengakses aplikasi Kernel?"*
*   **Poin Kunci:** Jelaskan alur delegasi: **Workspace** memiliki **Capability**, **Aplikasi/Widget** membutuhkan **Capability**. `NavigationService` bertindak sebagai penyambung *(bridge)*. Jika irisan antara Workspace dan Aplikasi = `null` (atau *false* di `capabilities.json`), maka sistem tidak akan membiarkan UI itu terender. Ini lebih aman daripada menyembunyikan tombol UI via CSS/State.

### 3. Strict Metadata Validation
**Topik:** Ketahanan Sistem di Fase Booting (Phase 9 & 10)
*   **Diskusi:** *"Apa yang terjadi jika ada developer yang typo saat mengubah file JSON?"*
*   **Poin Kunci:** Soroti penambahan fungsi `validateSchema()` pada `MetadataService`. MAEF menetapkan bahwa JSON yang tidak sah akan membunuh proses *booting* sebelum mencapai UI. Sistem akan mogok di Phase 9 (*Halted*) dan memberikan pesan error terperinci di konsol. Ini adalah bentuk komitmen *"Fail Fast, Fail Safe"*.

### 4. Dampak Performa: Lazy Loading & Bundle Size
**Topik:** Optimalisasi Kinerja Frontend
*   **Diskusi:** *"Dengan semua sistem dikontrol konfigurasi, apakah aplikasi kita tidak semakin lambat?"*
*   **Poin Kunci:** Jawabannya sebaliknya. Karena `AppRegistry.js` kini disuntikkan secara dinamis ke `WidgetRegistry` menggunakan `<Suspense>` dan `React.lazy()`, maka skrip `ConversationEngine` atau `AgentForge` (yang berukuran sangat besar) **TIDAK AKAN** diunduh oleh *browser* saat *user* baru memuat layar `HomeDashboard`. Skrip hanya ditarik ( *fetch*) saat *user* menekan tombol di *Sidebar*. Ini memangkas *Initial Load Time* secara ekstrem.

### 5. Diskusi Lanjutan (Next Action Plan)
*   **Widget Data Injector:** Mengingat `HomeDashboard` dan *Widget* kini sepenuhnya dikendalikan metadata, bagaimana kita bisa dengan aman mengirimkan *Real-time Data* (contoh: log dari backend) ke dalam *Widget* yang di-render secara gaib tersebut? (Hint: Gunakan pola *EventBus Subscription* yang ada di dalam *Dumb Component* widget itu sendiri, bukan *props drilling*).
