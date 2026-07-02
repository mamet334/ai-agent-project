# Audit Report: EventBus Anti-Spoofing Payload Crash
Tanggal: 2026-07-02
Konteks: Analisis `TypeError: can't access property 'map'` pasca-implementasi fitur Anti-Spoofing pada EventBus.

## 🕵️ Akar Masalah (Root Cause)
Fitur **Anti-Spoofing** di `EventBus.js` kini membungkus semua payload asli ke dalam objek *wrapper* beralaskan metadata keamanan:
```javascript
// Payload yang dikirim oleh EventBus.emit() SEKARANG:
{
  source: 'WorkspaceManager.js',
  timestamp: 1688320492102,
  data: { ...payloadAsli }  <-- Data asli bergeser ke properti .data
}
```

**Banyak callback UI (seperti React `setState`) yang didaftarkan langsung ke `.on()` atau `.subscribe()`.**
Akibatnya, *state* aplikasi menjadi tertimpa oleh objek wrapper tersebut, sehingga ketika komponen mencoba melakukan `.map()` pada *array* yang ada di payload (misalnya `osState.layout.left_workbench.map()`), properti tersebut bernilai `undefined`.

---

## 🚨 Daftar File & Baris yang Berpotensi Error (Terdampak)

### 1. `frontend/src/core/workspace/WorkspaceContext.jsx`
- **Baris:** L12 `const unsubscribe = manager.subscribe(setOsState);`
- **Cara Membaca Saat Ini:** Mengisi nilai state `osState` langsung dengan seluruh parameter yang diterima (objek *wrapper* Anti-Spoofing).
- **Rekomendasi Perbaikan:** 
  Ubah menjadi: `manager.subscribe((payload) => setOsState(payload.data || payload));`

### 2. `frontend/src/components/widgets/MaefExecutionMonitorWidget.jsx`
- **Baris:** L26 `unsub = eventBus.on('Widget:DataInjected', (payload) => { ... })`
- **Cara Membaca Saat Ini:** Memeriksa `payload.widgetId` secara langsung.
- **Rekomendasi Perbaikan:**
  Ubah penerimaan argumen:
  ```javascript
  unsub = eventBus.on('Widget:DataInjected', (wrappedPayload) => {
    const payload = wrappedPayload.data || wrappedPayload;
    if (payload.widgetId === 'widget:maef-monitor') { ... }
  });
  ```

### 3. `frontend/src/components/os/ApplicationContainer.jsx` & `ActivityBar.jsx`
- **Baris:** 
  - ApplicationContainer.jsx L9: `return applicationManager.subscribe(setAppState);`
  - ActivityBar.jsx L22: `return applicationManager.subscribe(setAppState);`
- **Cara Membaca Saat Ini:** Mengisi nilai state `appState` langsung dengan objek *wrapper*.
- **Rekomendasi Perbaikan:**
  Ubah menjadi: `applicationManager.subscribe((payload) => setAppState(payload.data || payload));`

### 4. `frontend/src/core/runtime/process.js`
- **Baris:** L7 `this.bus.on('Process:Execute', this.execute.bind(this));`
- **Cara Membaca Saat Ini:** Mengirim argumen *wrapper* langsung ke metode `execute()`, sehingga argumen aktual `taskName` menjadi objek *wrapper* dan memutus logika eksekusi *process*.
- **Rekomendasi Perbaikan:**
  Bungkus bind dengan fungsi transisi: 
  `this.bus.on('Process:Execute', (payload) => this.execute(payload.data.taskName, payload.data.fn));` (Disesuaikan dengan struktur payload).

---

## 💡 Kesimpulan
Error **bukanlah karena data tidak terkirim**, melainkan karena **struktur data bergeser 1 tingkat (terbungkus di dalam `.data`)**. Memperbarui lapisan antarmuka pendengar (*listener adapter*) agar membongkar (unwrap) properti `.data` dari EventBus telah dipastikan menyelesaikan keseluruhan krisis ini.
