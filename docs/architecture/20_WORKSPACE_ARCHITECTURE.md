# MAMET ECOSYSTEM WORKSPACE ARCHITECTURE

**Status:** Proposed  
**Version:** 1.0.0  
**Purpose:** Source of Truth for Mamet AI Operating System UI/UX Implementation  

---

## 1. ARCHITECTURE REVIEW & GAP ANALYSIS

### Review Kesalahan Masa Lalu
Pendekatan antarmuka Mamet AI saat ini masih terjebak pada mentalitas "Chatbot dengan Dashboard Tambahan". Hal ini terlihat dari `AIAgent.jsx` yang menggunakan *conditional rendering* kaku (`if/else`) untuk beralih antara fitur (Chat, Engineer, Monitoring). 

Meskipun proposal sebelumnya mulai menyentuh konsep "Dock", namun proposal tersebut gagal memisahkan *UI rendering* dari *Business Logic*, dan gagal mengenali pentingnya **Workspace Identity** dan **Plugin Architecture**.

### Architecture Gap
1. **Workspace bukan sekadar Layout**: Saat ini "Workspace" hanya berarti perpindahan tampilan (View). Seharusnya Workspace adalah entitas yang mengikat Memori, Knowledge, Kapabilitas, dan Izin (Permissions).
2. **Chat diperlakukan sebagai Widget**: Chat saat ini disandingkan dengan komponen lain secara sejajar. Padahal, obrolan adalah *Conversation Engine* yang menjadi jantung/pusat interaksi di mana Widget lain bertugas membantunya.
3. **Hardcoded UI**: UI saat ini harus diedit secara manual setiap kali ada kapabilitas baru. Seharusnya menggunakan *Registry Pattern*.
4. **Tidak Ada State Persistence**: Layout hilang saat berpindah menu atau *refresh*.

---

## 2. REVISED UI ARCHITECTURE: PLUGIN-FIRST OS

Mamet UI direkayasa ulang menggunakan pola **Plugin-First Architecture**. Arsitektur ini melepaskan *Core UI* dari ketergantungan pada fitur-fitur spesifik. Aliran pembentukan layar (Rendering Flow) selalu bergerak dari *Data (Manifest)* menuju *View (UI)*, bukan sebaliknya:

```text
Workspace Request
       ↓
Manifest Loader
       ↓
Capability Registry (Load backend constraints)
       ↓
Widget Registry (Load frontend modules)
       ↓
Conversation Engine (Mount Anchor)
       ↓
Workbench System (Mount Panels)
       ↓
Rendered Workspace UI
```

---

## 3. WORKSPACE IDENTITY & MANIFEST

Setiap Workspace wajib memiliki identitas yang diisolasi. Workspace didefinisikan secara statis maupun dinamis melalui sebuah **Workspace Manifest**.

### Struktur Manifest (`workspace.json` atau DB Record)
Sistem UI tidak boleh menebak konfigurasi. Core UI akan membaca manifest berikut saat me-*load* ruang kerja:
```json
{
  "id": "ws-engineer-01",
  "name": "Engineer Console",
  "description": "Ruang kerja terisolasi untuk rekayasa perangkat lunak Mamet",
  "context": {
    "memory_source": "PROJECT_MEMORY",
    "knowledge_source": "ENGINEERING_KNOWLEDGE"
  },
  "capabilities": [
    "cap:code-execution",
    "cap:architecture-verification",
    "cap:repository-access"
  ],
  "default_layout": {
    "left_workbench": ["widget:task-list", "widget:architecture-gaps"],
    "right_workbench": ["widget:verification-log"],
    "bottom_workbench": ["widget:system-terminal"]
  },
  "permissions": {
    "allow_global_memory": false,
    "allow_web_search": true
  }
}
```

---

## 4. REGISTRY ARCHITECTURE

Inti dari skalabilitas UI Mamet adalah Sistem Registri ganda (Frontend & Backend).

### A. Capability Registry (Backend / Logic Constraint)
UI tidak boleh menghardcode menu untuk kapabilitas. UI akan melakukan *query* ke Capability Registry: *"Apa yang bisa dilakukan di Workspace ini?"*. Jika Workspace memiliki kapabilitas `cap:repository-access`, UI secara dinamis mengizinkan *intent* terkait file system.

### B. Widget Registry (Frontend / UI Module)
Setiap Widget berdiri sendiri dengan *metadata* yang lengkap. Widget didaftarkan saat aplikasi dimulai:
```javascript
WidgetRegistry.register({
  id: 'widget:task-list',
  name: 'Engineering Tasks',
  icon: 'TargetIcon',
  version: '1.0.0',
  allowed_workspaces: ['ENGINEER', 'OWNER'],
  default_size: { width: 300, height: 400 },
  default_workbench: 'left',
  component: lazy(() => import('./widgets/TaskListWidget'))
});
```
Dengan ini, jika ada 100 kapabilitas dan 50 widget baru, *Core UI* tidak perlu disentuh sama sekali.

---

## 5. CONVERSATION ENGINE (THE CORE ANCHOR)

**Konsep Kritis:** Chat BUKAN Widget.
Chat adalah **Conversation Engine**. Ia merupakan *Anchor* (Jangkar) yang bersemayam tepat di tengah layar dan tidak bisa ditutup, digeser, atau disembunyikan. Semua Widget di sekelilingnya bertugas untuk memberikan konteks, visualisasi, atau data kepada *Conversation Engine*.

### Lifecycle Observability di UI
Conversation Engine tidak hanya menampilkan pesan teks, tetapi merepresentasikan *State Machine* secara *real-time*:
1. **User** (Input Prompt)
2. **Intent** (UI menunjukkan "Memahami niat...")
3. **Planner** (UI menunjukkan "Menyusun strategi...")
4. **Capability** (UI menunjukkan "Mengeksekusi tool: Read File...")
5. **Verification** (UI menunjukkan "Memverifikasi arsitektur...")
6. **Synthesis** (UI menunjukkan "Merangkum hasil...")
7. **Response** (Pesan final ditampilkan di layar)

Setiap *node* dalam *lifecycle* ini dapat diklik oleh pengguna untuk melempar rincian *log* ke dalam **Right Workbench**.

---

## 6. WORKBENCH SYSTEM

Konsep "Dock" atau "Sidebar" diganti dengan konsep **Workbench** yang sangat modular dan kontekstual. 

Sistem Workbench membungkus *Conversation Engine*:
* **Left Workbench**: Area statis/persisten (Navigasi, Daftar Workspace, Konteks Utama seperti Task).
* **Right Workbench (Inspector)**: Area responsif/kontekstual. Terbuka otomatis saat *Conversation Engine* membutuhkan visualisasi (Misal: melihat detail arsitektur, membaca diff kode).
* **Bottom Workbench**: Area observabilitas teknis (Terminal, System Events, Raw Logs).
* **Floating Workbench**: Area utilitas mandiri yang bisa digeser (Kalkulator cepat, Note kecil).

Setiap Workbench bertindak sebagai *Host* yang menampung *Widget* yang telah diregistrasi.

---

## 7. WORKSPACE MANAGER & LIFECYCLE

**Workspace Manager** adalah konduktor utama UI. Proses pergantian ruang kerja di Mamet akan terasa seberat dan selengkap mengganti *Project* di IDE (seperti VSCode), bukan sekadar pindah tab di browser.

**Lifecycle Pergantian Workspace:**
1. **Unmount Phase**: Simpan state layout Workbench (posisi widget, ukuran panel) ke *localStorage/DB* dengan kunci ID Workspace. Bersihkan konteks memori aktif.
2. **Load Manifest Phase**: Ambil `workspace.json` atau *database record* untuk Workspace baru.
3. **Bind Context Phase**: Setel filter *Memory* dan *Knowledge* ke API.
4. **Mount Registry Phase**: Aktifkan Widget yang tercatat dalam tata letak.
5. **Restore Layout Phase**: Pasang kembali (render) posisi *Workbench* sesuai simpanan sesi terakhir.
6. **Ready**: *Conversation Engine* aktif dengan konteks terisolasi penuh.

---

## 8. IMPLEMENTATION ROADMAP

Eksekusi harus dilakukan secara bertahap untuk mencegah kegagalan sistem produksi yang ada:

### Phase 1: Core Registry & Workspace Manager
- Membangun `WorkspaceManager` class.
- Membangun `WidgetRegistry` dan format *Workspace Manifest*.
- *Tidak ada perubahan UI visual di fase ini.*

### Phase 2: Workbench Engine
- Membuat infrastruktur `LeftWorkbench`, `RightWorkbench`, dan `BottomWorkbench`.
- Membuat mekanisme *Drag, Drop, Resize* yang menyimpan state ke dalam *Workspace Manager*.

### Phase 3: Extraction & Refactoring
- Memecah komponen-komponen statis di `AIAgent.jsx` dan `EngineerDashboard.jsx` menjadi Widget mandiri.
- Mendaftarkan mereka ke dalam `WidgetRegistry`.

### Phase 4: Conversation Engine Upgrade
- Mengubah Chat dari sekadar penampil riwayat menjadi penampil siklus hidup (User -> Intent -> Planner -> ...).
- Mengintegrasikan interaksi antara *Conversation Engine* dan *Right Workbench* (Klik untuk detail).

### Phase 5: Production Rollout & Layout Persistence
- Mengaitkan penyimpanan Layout ke tabel *Supabase* milik *Owner*.
- *Deprecate* (matikan) hardcoded view logic yang lama.

---

## 9. MIGRATION STRATEGY
* **Paralel UI**: Selama Fase 1 hingga Fase 4, UI lama (`AIAgent.jsx`) tetap berjalan sebagai *default*. Sistem UI OS yang baru (contoh: `OSDesktop.jsx`) dapat diakses melalui bendera fitur (Feature Flag) tersembunyi untuk uji coba *Owner*.
* **Seamless State Transfer**: Riwayat obrolan tidak terpengaruh, karena UI OS baru tetap membaca tabel `chats` berdasarkan filter `workspace_type` yang telah kita perkuat pada revisi sebelumnya.

---
**STATUS:** SELESAI DIREVISI. Menunggu instruksi Eksekusi Implementasi dari Owner.
