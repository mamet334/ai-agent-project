# ADR-008 Application Bootstrap Architecture

**Status:** ACCEPTED  
**Tanggal:** 2026-07-05  
**Konteks:** Mamet Ecosystem - MAEF UI Specification (MUS)

## 1. Konteks
Pada saat eksekusi **Phase 2** (Transisi ke arsitektur navigasi MUS), ditemukan adanya **Architecture Gap** yang krusial:
Komponen UI tingkat presentasi (`ActivityBar.jsx`) dan pembungkus aplikasi (`App.jsx`) memiliki kontrol imperatif terhadap siklus inisialisasi aplikasi (misal: mendaftarkan aplikasi baru atau memaksa perpindahan ke halaman Home). Hal ini menciptakan *Race Condition*, *Hardcode Dependency*, dan secara fundamental melanggar batas pemisahan tugas (*Separation of Responsibility*) yang digariskan oleh MAEF.

Dibutuhkan standarisasi kewenangan yang absolut mengenai siapa yang bertugas melakukan orkestrasi *bootstrap* aplikasi sebelum migrasi ke *Metadata Driven UI* (Phase 3) dimulai.

## 2. Keputusan (Architecture Decision)

Demi mematuhi prinsip **Kernel First** dan **Metadata Driven UI**, tanggung jawab siklus *Bootstrap* Aplikasi ditetapkan sebagai berikut:

### 2.1. Siapa yang bertanggung jawab melakukan registrasi aplikasi?
**Tanggung Jawab:** `ApplicationManager` (Dikendalikan oleh siklus MAEF Kernel).
**Mekanisme:** Tidak boleh ada satupun komponen React (UI) yang memanggil `applicationManager.registerApp()`. Registrasi dilakukan satu arah oleh Kernel (pada *Phase 10*) dengan memasukkan data (*hydrate*) yang disuplai oleh *MetadataService*.

### 2.2. Siapa yang menentukan Default Workspace?
**Tanggung Jawab:** Penentu adalah `MetadataService`. Validator dan Aktivator adalah `WorkspaceManager`.
**Mekanisme:** `WorkspaceManager` **tidak** menentukan *default* secara mandiri. Ia bertugas memvalidasi *Capability*, hak akses (*Owner/Session*), dan mengaktifkan *workspace* sesuai spesifikasi arahan dari konfigurasi yang telah dibaca sebelumnya.

### 2.3. Siapa yang menentukan Default Application (Entry Point)?
**Tanggung Jawab:** `MetadataService`.
**Mekanisme:** Komponen UI tidak boleh menggunakan `activateApp()` saat pertama kali dimuat. Metadata (contoh: `system.yaml`) akan memiliki atribut eksplisit `default_entry_point: "app:home"`. Kernel yang akan memerintahkan `ApplicationManager` untuk mengeksekusinya.

### 2.4. Siapa yang membaca Metadata?
**Tanggung Jawab:** `MetadataService` atau `ConfigurationService` (Service Terpisah).
**Mekanisme:** Tugas ini dipisahkan secara tegas dari `ModuleLoader`. `MetadataService` didedikasikan murni untuk membaca, mem-parsing, dan memvalidasi struktur file metadata (YAML/JSON) pada fase sebelum `System:Ready` dipancarkan.

### 2.5. Siapa yang membangun Navigation?
**Tanggung Jawab:** `NavigationService` (Komponen Mandiri).
**Mekanisme:** Memisahkan urusan UI Layout dari `ApplicationManager`. `NavigationService` akan bertugas merakit struktur hierarki pohon navigasi (*Navigation Tree*) berdasarkan `navigation.yaml`. UI Sidebar (`ActivityBar.jsx`) **murni bersifat pasif** (*Dumb Component*) yang hanya bertugas me-render visual hierarki tersebut.

### 2.6. Siapa yang menginisialisasi Dashboard Home?
**Tanggung Jawab:** `ApplicationManager` bersama `WidgetRegistry`.
**Mekanisme:** *Home Dashboard* diperlakukan tepat sama seperti aplikasi standar lainnya, diregistrasi secara sah oleh Kernel berdasarkan Metadata, bukan lewat injeksi *Runtime* (Workaround) di dalam siklus React.

## 3. Boot Sequence (Urutan Inisialisasi Aplikasi)
Agar tidak menimbulkan interpretasi yang berbeda, urutan inisialisasi (*Boot Sequence*) sistem MAEF ditetapkan secara ketat:
1. **Kernel Initialization (Phase 1-8)**: Pembangunan fondasi utama.
2. **Phase 9 (Metadata Parsing)**: `MetadataService` membaca dan memvalidasi `workspace.yaml`, `widgets.yaml`, `navigation.yaml`, dan `capabilities.yaml`.
3. **Phase 10 (System Registration)**: 
   - Kernel mendistribusikan metadata tersebut.
   - `ApplicationManager` mendaftarkan Apps (termasuk *Home*).
   - `WidgetRegistry` mendaftarkan ketersediaan Widget.
   - `NavigationService` merakit struktur menu UI.
4. **Activation Sequence**: Kernel memanggil `WorkspaceManager.activate(targetWorkspace)` lalu `ApplicationManager.activateApp(default_entry_point)`.
5. **System:Ready**: Event utama dipancarkan. Komponen UI (React) mulai me-render layar dengan *State* yang sudah siap seratus persen (Hydrated).

## 4. Non-Goals (Batasan Cakupan)
*   ADR ini **tidak** mengatur tata letak (Layout) spesifik grafis, pewarnaan, atau hierarki CSS (Diatur terpisah di dokumen MUS).
*   ADR ini **tidak** mengubah sistem pengikatan (*Binding*) dari Backend ke Frontend. Murni menetapkan siklus registrasi di sisi Klien.
*   ADR ini **tidak** mendikte bahasa parser (apakah menggunakan YAML atau JSON), melainkan hanya mendefinisikan *Service* mana yang berhak mengelolanya.

## 5. Konsekuensi

1. **Keuntungan (Positif):**
   * Komponen UI (`App.jsx`, `ActivityBar.jsx`) menjadi sangat ringan, terbebas dari logika inisiasi, murni deklaratif, dan bebas *Flickering* / *Race Condition*.
   * Ekosistem Mamet benar-benar berbasis *Capability & Metadata*, memudahkan penambahan modul baru di masa depan tanpa mengubah kode inti.

2. **Dampak Sistem (Negatif/Tantangan):**
   * Perlu penambahan fase/sub-fase di Kernel untuk memuat dan memvalidasi *Metadata Loader* secara asinkron sebelum mengeluarkan status `RUNNING`.
   * Harus membuat parser skema statis yang kuat sebagai sumber kebenaran (Source of Truth) rendering.
