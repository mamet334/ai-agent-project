# Audit Report: Unnamespaced Event Strings
Tanggal: 2026-07-02
Konteks: Mendeteksi string event yang belum memenuhi standar *Strict Namespacing* (`Kategori:NamaEvent`) pasca-refactor `EventBus.js`.

Berdasarkan pemindaian menyeluruh di dalam direktori `frontend/src`, berikut adalah daftar pemanggilan event yang **masih menggunakan format lama (tanpa titik dua `:`)** dan berpotensi menyebabkan Kernel CRASH jika dieksekusi:

### 1. `WORKSPACE_STATE_CHANGED`
- **File:** `frontend/src/core/workspace/WorkspaceManager.js`
- **Baris:**
  - L46: `return this.eventBus.on('WORKSPACE_STATE_CHANGED', listener);`
  - L50: `this.eventBus.emit('WORKSPACE_STATE_CHANGED', { ... });`

### 2. `WINDOW_STATE_CHANGED`
- **File:** `frontend/src/core/window/WindowManager.js`
- **Baris:**
  - L62: `return this.eventBus.on('WINDOW_STATE_CHANGED', listener);`
  - L66: `this.eventBus.emit('WINDOW_STATE_CHANGED', { ... });`

### 3. `VAULT_KEY_UPDATED`
- **File:** `frontend/src/core/runtime/services/VaultService.js`
- **Baris:**
  - L46: `this.eventBus.emit('VAULT_KEY_UPDATED', { provider });`

### 4. `process.execute`
- **File:** `frontend/src/core/runtime/process.js`
- **Baris:**
  - L7: `this.bus.on('process.execute', this.execute.bind(this));`

### 5. `APP_STATE_CHANGED`
- **File:** `frontend/src/core/application/ApplicationManager.js`
- **Baris:**
  - L15: `return eventBus.on('APP_STATE_CHANGED', listener);`
  - L20: `eventBus.emit('APP_STATE_CHANGED', this.getState());`

---

> **Catatan Tambahan:**
> Terdapat fungsi `.on()` dan `.subscribe()` di dalam file `frontend/src/components/AIAgent.jsx` (L854, L882), namun hasil inspeksi menunjukkan bahwa kode tersebut merupakan milik klien *Supabase Realtime Channel*, bukan pemanggilan *MAEF EventBus*, sehingga bebas dari aturan validasi *Namespacing*.

**Kesimpulan:**
Masih terdapat **5 nama event unik** di dalam **5 file terpisah** yang perlu direfactor (seperti menjadi `Workspace:StateChanged`, `Window:StateChanged`, dll.) agar tidak melempar error saat disuntikkan ke dalam `EventBus.emit()` atau `EventBus.on()`.
