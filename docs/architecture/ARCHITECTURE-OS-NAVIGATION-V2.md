# MAMET OS: APPLICATION MANAGER ARCHITECTURE

**Status:** Proposed Design
**Version:** 2.0.0
**Target:** Transform Mamet OS from "Web Page Routing" to "Persistent Desktop Application"

---

## 1. Audit Arsitektur Sekarang

Saat ini, navigasi Mamet OS berpusat pada **Workspace Manager** sebagai entitas tertinggi (Level 1).
- Saat pengguna memilih `Engineer Console` atau `Owner Workspace`, sistem mengganti keseluruhan *context* (`activeWorkspaceId`).
- Pergantian *workspace* memaksa siklus *teardown* (unmount) pada antarmuka saat ini dan *rebuild* (mount) untuk antarmuka baru.
- Antarmuka Chat (`ConversationEngine`) terikat di dalam tata letak (*layout*) dari *Workspace* tertentu.
- Tidak ada konsep **Aplikasi** (seperti IDE, Chat Client, atau Data Browser), yang ada hanyalah sekumpulan pengaturan letak UI (*layout preset*) bernama *Workspace*.

## 2. Kekurangan Desain Sekarang

1. **State Destruction**: Berpindah dari *Owner Workspace* ke *Engineer Console* akan mereset percakapan yang sedang berjalan atau widget yang sedang aktif. State tidak persisten di latar belakang.
2. **Context Mixing**: Konsep "Aplikasi" (Apa yang saya lakukan) tercampur dengan konsep "Workspace" (Lingkungan data apa yang saya gunakan). `Engineer` adalah peran/aplikasi, sedangkan `Project Alpha` adalah ruang kerjanya. Saat ini keduanya disejajarkan dalam satu hirarki navigasi.
3. **Website Feel**: Terasa seperti berpindah URL halaman web. Tidak terasa seperti sistem operasi lokal atau IDE seperti VS Code di mana Terminal, Explorer, dan Editor memiliki *lifecycle* independen.

---

## 3. Information Architecture Baru

Konsep desain baru memisahkan antara **App (Tool)** dan **Workspace (Environment)**.

### Hirarki Baru (Desktop OS Pattern)
```text
MAMET OS (Shell / Kernel)
│
├── 1. APPLICATION MANAGER (Persistent State Container)
│   ├── App: ASSISTANT (Chat Client)
│   ├── App: ENGINEER (Code & System IDE)
│   ├── App: MEMORY (Database / File Explorer)
│   └── App: RESEARCH (Browser / RAG Pipeline)
│
└── 2. WORKSPACE MANAGER (Environment / Project Context)
    ├── Terikat pada Aplikasi (Setiap Aplikasi punya Workspace masing-masing)
    └── Menentukan Dataset & Layout spesifik untuk project yang aktif
```

**Matrix Aplikasi & Workspace:**
- **Assistant App** -> *Workspace*: Owner, Personal, Family
- **Engineer App** -> *Workspace*: Project Alpha, Debug, Frontend Build
- **Memory App** -> *Workspace*: Global DB, Local Files, Cloud
- **Research App** -> *Workspace*: DeepMind Papers, AI Agents, Market Research

---

## 4. Navigation Flow Baru

1. **Global Sidebar (Activity Bar)**: Mirip dengan VS Code (kiri ekstrim). Ikon statis: `[Chat] [Engineer] [Memory] [Research] [Settings]`.
2. **Application Switch**: Klik ikon di Global Sidebar akan *menyembunyikan* UI aplikasi lama (via CSS `display: none` atau teknik React komponen `hidden`) dan menampilkan UI aplikasi baru. **Tidak ada unmount**. *Lifecycle* tetap hidup.
3. **Contextual Sidebar (Secondary)**: Saat berada di `Engineer App`, *sidebar* sekunder menampilkan daftar *Workspace* yang tersedia khusus untuk *Engineering*.
4. **Workspace Switch**: Mengubah *Workspace* di dalam sebuah Aplikasi HANYA akan memuat konteks data/layout untuk aplikasi tersebut, tanpa mematikan Aplikasi itu sendiri.

---

## 5. Diagram Hirarki (State Management)

```mermaid
graph TD
    Kernel[OS Kernel & Store] --> AppManager[Application Manager]
    Kernel --> ErrorBoundary[Global Error Boundary]
    
    AppManager --> App1[Assistant App - Hidden]
    AppManager --> App2[Engineer App - Active]
    AppManager --> App3[Memory App - Hidden]
    
    App2 --> WSM2[Workspace Manager - Engineer Context]
    WSM2 --> W1[Project Alpha Layout]
    WSM2 --> W2[Debug Layout]
    
    App1 -. Persistent .-> ConversationEngine
    App2 -. Persistent .-> IDE_Widgets
```

---

## 6. File yang Harus Diubah (Impact Analysis)

1. `frontend/src/App.jsx`: Harus direfaktor untuk me-*render* `ApplicationManager` alih-alih merender tunggal `WorkspaceShell`.
2. `frontend/src/core/workspace/WorkspaceManager.js`: Dipecah/diperluas agar mendukung *multi-instance* (satu instance per Aplikasi) atau diubah menjadi `ContextManager` spesifik.
3. `frontend/src/components/workbench/WorkspaceShell.jsx`: Akan diturunkan pangkatnya menjadi `AppShell`, merender isi spesifik dari suatu Aplikasi.
4. **[NEW]** `frontend/src/core/application/ApplicationManager.js`: *Controller* baru untuk menjaga *state* Aplikasi yang hidup di latar belakang.
5. **[NEW]** `frontend/src/components/layout/ActivityBar.jsx`: Global Sidebar (Level 1) untuk berpindah Aplikasi.
6. `frontend/src/components/widgets/WorkspaceNavWidget.jsx`: Akan dibongkar dan diubah menjadi *Contextual Explorer* untuk *Workspace* sekunder di dalam masing-masing Aplikasi.

---

## 7. Migration Plan (Eksekusi Bertahap)

Untuk mencegah kerusakan sistem (sesuai *Engineering Evolution* MAEF), migrasi dilakukan dalam 3 Fase:

* **Phase 1: Shell Restructuring (UI Scaffold)**
  - Buat `ActivityBar.jsx`.
  - Bungkus `WorkspaceShell` ke dalam struktur `AppManager`.
  - Simulasi *Switching* statis dengan CSS `display: none` untuk memastikan tidak ada *unmount*.

* **Phase 2: State Persistence (App Manager Core)**
  - Bangun `ApplicationManager.js`.
  - Pisahkan `ConversationEngine` agar diikat pada `AssistantApp` *instance*, bukan pada *global workspace layout*.

* **Phase 3: Contextual Workspaces**
  - Refaktor `WorkspaceManager` agar menerima konteks *App*.
  - Modifikasi *Supabase layout metadata* agar disimpan berdasarkan `app_id` + `workspace_id`.
  - Hapus `WorkspaceNavWidget` lama.

---

## 8. Alasan Mengapa Desain Baru Sesuai dengan Visi Mamet OS

- **True Desktop Experience**: Dengan memisahkan Aplikasi dari *Environment*, OS terasa memiliki memori yang permanen. Pengguna bisa menganalisis log di *Engineer*, lalu beralih ke *Assistant* untuk bertanya, lalu kembali ke *Engineer* dengan keadaan yang masih persis sama (log tidak tertutup, *scroll* tidak hilang).
- **Separation of Concerns**: *Widget Registry* kini bisa difilter berdasarkan "Aplikasi", bukan sekadar "Workspace". Terminal IDE hanya relevan untuk *Engineer*, bukan *Assistant*.
- **Scalability**: Jika Mamet OS ke depannya membutuhkan fungsi baru (misal: *Financial Calculator / AirKas*), kita cukup menambahkannya sebagai "App" ke `ApplicationManager` tanpa harus merusak struktur *Workspace* yang sudah ada. Arsitekturnya mengadopsi standar emas IDE modern.
