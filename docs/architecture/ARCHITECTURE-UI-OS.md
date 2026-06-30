# MAMET ECOSYSTEM UI/UX ARCHITECTURE MISSION

## 1. UI/UX Audit (Kondisi Saat Ini)
Mamet AI saat ini berevolusi dari sekadar aplikasi *AI Chatbot* menjadi sebuah *AI Operating System*, namun antarmuka penggunanya masih terjebak dalam paradigma lama (Chatbot dengan panel tambahan).

### UX Problem
* **Mental Model "Chat App"**: Pengguna merasa sedang membuka aplikasi obrolan (seperti ChatGPT), bukan masuk ke dalam sebuah ruang kerja (Workspace) profesional.
* **Context Switching yang Mengganggu**: Beralih antara alat (seperti *Monitoring*, *Work Track*, *Engineer*) seringkali berarti meninggalkan layar obrolan sepenuhnya atau memaksakan tata letak (layout) yang kaku.

### Layout Problem
* **Monolithic View Routing**: File `AIAgent.jsx` menangani routing UI melalui tumpukan kondisi `if/else` (contoh: `activeView === 'engineer' ? ... : activeView === 'monitoring' ? ...`).
* **Hardcoded Panels**: Panel dasbor bersifat kaku. Meskipun dapat di-resize, mereka tidak bisa dilepas, digeser, atau disembunyikan secara bebas tanpa menulis kode CSS/Flexbox spesifik.

### Scalability Problem
* **Sidebar Overload**: Setiap penambahan Capability baru membutuhkan tombol baru di *sidebar*. Jika kita memiliki 50 Workspace atau 100 Capability, *sidebar* akan menjadi terlalu penuh dan tidak dapat dinavigasi.
* **Component Bloat**: `AIAgent.jsx` sudah mencapai >3500 baris kode karena harus memuat semua *state* aplikasi.

### Workspace & Flexibility Problem
* **Tidak Ada Konteks Berbasis Ruang**: Saat ini, "Engineer" atau "Monitoring" dianggap sebagai *View*, bukan *Workspace*. Idealnya, "Engineer" adalah sebuah Workspace di mana *Chat* adalah pusatnya, didukung oleh *widget-widget* khusus (Task, Architecture Gaps, dsb).
* **Zero Customization**: Pemilik (Owner) tidak dapat menyimpan preferensi tata letak. Panel tidak dapat di-*pin*, di-*unpin*, atau diatur posisinya sesuai alur kerja.

---

## 2. Architecture Gap
Perbandingan antara arsitektur saat ini dengan Konstitusi / Visi OS:

| Aspek | Mamet UI Saat Ini | Visi Mamet OS (Constitution) | Gap |
| :--- | :--- | :--- | :--- |
| **Hierarki Utama** | Chat History -> Views | Workspace -> Chat + Widgets | Harus merombak root UI menjadi sistem *Workspace Manager*. |
| **Sistem Layout** | Flexbox Statis (`w-1/3`, `md:flex-row`) | Dynamic Dock & Widget System | Membutuhkan *Widget Engine* (seperti GoldenLayout atau *grid-stack* internal). |
| **Ekstensibilitas** | Hardcoded di `AIAgent.jsx` | Plug-in Base Capability | Membutuhkan arsitektur *registry* untuk mendaftarkan Widget tanpa menyentuh *core UI*. |
| **Pusat Interaksi** | Sering terganti oleh Dashboard | Chat selalu menjadi pusat (Anchor) | *Chat Engine* harus menjadi fondasi Workspace, dikelilingi Widget pendukung. |

---

## 3. New UI Architecture Design (Mamet OS UI)

Kita tidak akan mendesain mockup, melainkan **Desain Sistem UI** yang mampu bertahan selama bertahun-tahun tanpa perombakan total, meskipun jumlah Capability bertambah hingga ratusan.

### A. Workspace Hierarchy
Sistem ini menggunakan hierarki berlapis (Russian Doll model):
1. **The Core (OS Shell)**: Pembungkus utama aplikasi. Mengelola manajemen jendela, global state, dan rute Workspace.
2. **Workspace**: Konteks kerja aktif (Misal: *Owner Workspace*, *Engineer Workspace*, *Research Workspace*). 
3. **The Anchor (Chat Center)**: Titik berat dari setiap Workspace. Selalu ada, tidak bisa ditutup, dan berfungsi sebagai "CLI/Prompt" utama.
4. **Dock / Panel Zones**: Area di sekeliling Anchor (Kiri, Kanan, Bawah) untuk menempatkan Widget.
5. **Widgets**: Modul fungsional kecil (seperti *Calendar*, *Architecture Gaps*, *Log Viewer*) yang dapat di-*plug-and-play*.

### B. Widget & Dock System
* **Widget Engine**: Sebuah sistem di mana setiap alat diregistrasi sebagai *Widget Object* dengan metadata (nama, icon, ukuran default, dukungan Workspace).
* **Dock Zones**: 
  * *Left Dock*: Biasanya untuk navigasi hierarki (Workspace List, History).
  * *Right Dock*: Contextual Inspector (Tools, Metadata, Verifikasi).
  * *Bottom Dock*: Terminal, Logs, System Events.
* **Lifecycle Widget**: Widget dapat memiliki state: `hidden`, `docked`, `floating` (jika didukung), atau `maximized`.

### C. Capability as Plug-ins
Setiap kapabilitas baru tidak lagi ditambahkan ke dalam JSX utama. 
Contoh struktur registrasi:
```javascript
Registry.registerWidget('ArchitectureGaps', {
  workspaces: ['ENGINEER', 'ARCHITECT'],
  defaultDock: 'right',
  component: lazy(() => import('./widgets/ArchGapsWidget'))
});
```
Dengan ini, menambahkan 100 kapabilitas baru tidak akan mengubah tata letak inti.

### D. Contextual Inspector
Panel *Inspector* diubah menjadi *Contextual Drop-zone*. Saat pengguna mengklik referensi arsitektur di Chat, Widget *Architecture Viewer* akan otomatis dimuat di *Right Dock*. Inspector hanya muncul jika ada data kontekstual yang relevan.

### E. Responsive Strategy
* **Desktop**: Sistem *Multi-Panel* (Kiri - Tengah - Kanan) beroperasi secara penuh.
* **Tablet**: *Right Dock* otomatis tersembunyi sebagai *Flyout Menu* (Panel yang meluncur keluar).
* **Mobile**: Sistem bertumpuk (*Stacked*). Anchor (Chat) memenuhi layar, sementara Widget diakses melalui *Bottom Sheet* atau menu *Off-canvas*.

---

## 4. Implementation Roadmap

Sesuai perintah, implementasi dipecah menjadi fase bertahap untuk mencegah regresi dan menjaga stabilitas ekosistem.

### Phase 1: Workspace Layout Foundation (Pemisahan Core & Chat)
* **Goal**: Mengganti tumpukan `if/else` di `AIAgent.jsx` dengan sistem perutean Workspace.
* **Tugas**: 
  * Ekstrak logika *Chat* murni menjadi komponen `ChatAnchor`.
  * Buat `WorkspaceShell` yang akan me-render `ChatAnchor` di tengah.

### Phase 2: Widget Engine & Registry
* **Goal**: Mengubah Dashboard statis (seperti `EngineerDashboard`) menjadi koleksi Widget.
* **Tugas**:
  * Buat `WidgetRegistry` manager.
  * Pecah `EngineerDashboard` menjadi Widget terpisah: `TaskWidget`, `GapWidget`, `MemoryFeedWidget`.
  * Render Widget berdasarkan Workspace aktif (Metadata).

### Phase 3: Dock System (Draggable & Resizable Zones)
* **Goal**: Mengimplementasikan area berlabuh (Dock) di Kiri, Kanan, dan Bawah yang bisa di-resize.
* **Tugas**:
  * Buat komponen `DockZone` dengan *resize handles*.
  * Terapkan kemampuan untuk memindahkan (pin/unpin) sebuah Widget ke Dock yang berbeda.

### Phase 4: Workspace Manager (Customization & State Persistence)
* **Goal**: Pemilik (Owner) dapat menyimpan preferensi tata letaknya.
* **Tugas**:
  * Simpan status layout (ukuran panel, widget aktif, orientasi) ke database `user_preferences` per Workspace.
  * *Auto-load* konfigurasi tata letak saat berpindah Workspace.

### Phase 5: Responsive & Mobile Fallback
* **Goal**: Memastikan UI fleksibel di layar kecil.
* **Tugas**:
  * Terapkan *Bottom Sheets* dan *Off-Canvas Menus* untuk merender Widget di layar sempit tanpa merusak interaksi Chat.

### Phase 6: Deep Polish & Contextual Inspector
* **Goal**: Transisi yang mulus dan interaksi kontekstual.
* **Tugas**:
  * Tambahkan animasi (Framer Motion atau CSS transitions) saat Widget muncul/hilang.
  * Terapkan sistem *Event Bus* UI agar klik pada teks di Chat dapat memicu pembukaan Widget di Dock Kanan.

---

## 5. Migration Strategy & Compatibility
* **Backward Compatibility**: Selama Fase 1 hingga Fase 3, `AIAgent.jsx` versi lama dapat tetap dipertahankan dengan nama `LegacyAgent.jsx` (atau di-serve secara kondisional) untuk fallback darurat.
* **Database Impact**: Tidak memerlukan migrasi database utama. Hanya perlu menambahkan tabel/kolom konfigurasi UI ringan (contoh: tabel `workspace_layouts`) pada Fase 4.
* **User Transition**: Secara perlahan, tombol *sidebar* yang ada akan mulai memuat Workspace yang dirakit oleh *Widget Engine*, sehingga pengguna merasakan perubahan tata letak secara organik tanpa kehilangan riwayat obrolannya.

---

**STATUS:** Proposal UI/UX Architecture Selesai. Menunggu persetujuan Owner untuk memulai **Phase 1: Workspace Layout Foundation**.
