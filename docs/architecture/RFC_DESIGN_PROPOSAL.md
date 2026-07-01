# RFC Design Proposal: Mamet OS V2 Core Enhancements

This document outlines the architectural designs for the pending Request For Changes (RFCs) identified during the Mamet OS V2 Hardening Phase.

---

## 1. RFC-011: Kernel-First Bootloader

### 1.1. Architecture Gap
Saat ini, *Kernel* Mamet OS diinisialisasi melalui `useEffect` di dalam komponen React (`App.jsx`). Hal ini menimbulkan dua masalah:
1. **Lifecycle Coupling**: Siklus hidup OS (yang seharusnya permanen) menjadi terikat pada siklus hidup *rendering* React.
2. **Strict Mode Race Condition**: Walaupun *Kernel Boot Lock* telah memitigasi `useEffect` ganda di React 18 Strict Mode, menginisialisasi OS di dalam komponen UI merupakan *anti-pattern* secara arsitektur.

### 1.2. Design Decision
Membalikkan hierarki inisialisasi (*Inversion of Control*). *Kernel* harus menyala terlebih dahulu di luar *scope* UI.

### 1.3. Implementation Plan
- **Modifikasi `main.jsx`**: Mengubah *entry point* aplikasi menjadi *asynchronous*.
  ```javascript
  import Kernel from './core/runtime/Kernel';
  
  async function bootstrapOS() {
     // 1. Boot the OS Environment first
     await Kernel.boot();
     
     // 2. Once OS is ready, mount the UI
     const root = createRoot(document.getElementById('root'));
     root.render(<App />);
  }
  bootstrapOS();
  ```
- **Modifikasi `App.jsx`**: Menghapus `useEffect` pemanggil *boot* dan status *loading* internal, karena saat `App` dirender, dapat dipastikan bahwa *Kernel*, *ServiceManager*, dan *EventBus* telah 100% siap digunakan.

---

## 2. RFC-012: Task Scheduler Service

### 2.1. Architecture Gap
Beberapa proses asinkron (seperti analisis repositori, kompresi memori latar belakang, dan pengumpulan bukti) berjalan tanpa pengawasan terpusat di *frontend*. Jika aplikasi di-suspend atau *user* berpindah konteks, tugas asinkron ini sulit dibatalkan (*dangling promises*).

### 2.2. Design Decision
Mengembangkan **TaskSchedulerService** sebagai utilitas *OS-Level* yang diregistrasikan ke `ServiceManager`. Scheduler ini akan mengatur antrean dan prioritas eksekusi.

### 2.3. Implementation Plan
- **File**: `frontend/src/core/runtime/services/TaskScheduler.js`
- **Core API**:
  - `enqueue({ id, priority, taskFn })`
  - `cancel(id)`
  - `pause() / resume()`
- **Integration**: Menerbitkan kejadian (`Task.Queued`, `Task.Running`, `Task.Finished`) melalui `EventBus`, sehingga komponen *widget* (misalnya `EngineeringTasksWidget`) dapat menampilkan bilah proses (*progress bar*) secara reaktif tanpa saling bergantung secara langsung (*decoupled*).

---

## 3. RFC-010: OS-Level Debouncer Service

### 3.1. Architecture Gap
Saat ini, `WorkspaceManager` mengimplementasikan logika *debouncer* manual (`setTimeout` & `clearTimeout`) untuk mencegah batas kuota API (*Rate Limit*) saat me-resize *layout*. Mekanisme *ad-hoc* ini tidak *reusable* untuk layanan lain yang membutuhkan pembatasan eksekusi serupa (misalnya fitur *Auto-Save* di *Code Editor*).

### 3.2. Design Decision
Mengekstraksi logika *debouncer* menjadi modul independen di dalam `ServiceManager`.

### 3.3. Implementation Plan
- **File**: `frontend/src/core/runtime/services/ThrottleService.js`
- **Core API**:
  - `debounce(key, callback, delayMs)`
  - `throttle(key, callback, delayMs)`
  - `clear(key)`
- **Refactor**: Menghapus variabel `this.syncTimeout` dari `WorkspaceManager` dan menggantinya dengan:
  ```javascript
  const throttler = this.serviceManager.get('ThrottleService');
  throttler.debounce('layout_sync', () => this._syncLayoutToSupabase(...), 2000);
  ```

---
**Verification Criteria untuk Seluruh RFC:**
1. Zero Breaking Changes terhadap modul yang sudah ada.
2. Murni pemindahan tanggung jawab (*Separation of Concerns*).
3. Berjalan stabil di `npm run build`.
