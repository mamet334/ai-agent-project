# 🚀 Changelog: Phase 3 Metadata-Driven UI

**Type:** Architecture Update / Core Framework Migration
**Date:** July 5, 2026

### ✨ Fitur Baru (New Features)
*   **Metadata-Driven Kernel Booting:** MAEF Kernel (Phase 9 & Phase 10) kini dihidupkan murni oleh file JSON statis dari server, bukan lagi oleh kode statis React.
*   **Centralized Metadata Configuration:** Menambahkan koleksi file metadata konfigurasi sistem sebagai *Source of Truth* baru:
    *   `system.json`: Pendaftaran dan konfigurasi sistem operasi.
    *   `navigation.json`: Skema struktur tata letak *Sidebar* (Activity Bar).
    *   `capabilities.json`: Tabel otoritas perizinan fitur untuk sistem/aplikasi.
    *   `workspace.json`: Konfigurasi *layout* dan kapabilitas per *Workspace* (Engineer, Lite, Owner, dll).
    *   `widgets.json`: Kamus daftar komponen Widget yang diizinkan sistem.
    *   `dashboard.json`: Struktur arsitektur peletakan komponen pada `HomeDashboard`.
*   **Metadata Services Layer:** Implementasi dua lapis arsitektur baru:
    *   `MetadataService.js`: Kelas *validator* dan *loader* JSON untuk mengecek skema konfigurasi sebelum sistem dihidupkan.
    *   `NavigationService.js`: Perakitan pohon menu dinamis berbasis hak akses (*Capability Mapping*).
*   **React Lazy-Loaded Registry:** Modul komponen sekarang menggunakan pola `React.lazy()` pada `AppRegistry.js`. Penggunaan memori awal sangat ditekan, UI hanya akan diunduh secara parsial (*Code Splitting*) apabila diakses oleh pengguna.

### 🧹 Perbaikan & Pembersihan (Fixes & Chore)
*   **Penghapusan Runtime Injection:** `ActivityBar.jsx` tidak lagi merangkai dan "menyuntikkan" komponen miliknya sendiri (Penyelesaian *Architecture Gap* ADR-008).
*   **Pembersihan Hardcode Layout:** `HomeDashboard.jsx` kini 100% pasif; tidak ada lagi penebakan besaran lebar/kolom (*col-span*) dari JSX.
*   **Pembersihan Logika Kondisional Workspace:** `WorkspaceManager.js` di-*refactor* total untuk berhenti menggunakan kondisi *hardcode* (`if (workspaceId === 'ws-engineer')`). Kini seluruh profil, tata letak, dan izin (*memory access*) diatur dari `workspace.json`.
