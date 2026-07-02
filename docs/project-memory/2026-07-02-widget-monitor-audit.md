# Audit Rantai Data: Widget Monitor (MaefExecutionMonitorWidget)
Tanggal: 2026-07-02

## 1. Temuan per File

### `frontend/src/components/widgets/MaefExecutionMonitorWidget.jsx`
- **Penerimaan Data:** Widget ini mencoba mendapatkan data via dua jalur:
  1. Langsung membaca dari cache: `wsManager.getWidgetData('widget:maef-monitor')`
  2. Mendengarkan event real-time: `eventBus.subscribe(event => ...)` untuk event `Widget.DataInjected`.
- **Masalah:** Fungsi `subscribe()` **tidak ada** di `EventBus.js` MAEF v2.0 (seharusnya menggunakan `.on()`). Pemanggilan ini akan menyebabkan `TypeError` dan mematahkan reaktivitas UI.

### `frontend/src/core/workspace/WorkspaceManager.js`
- **Titik Injeksi:** Memiliki metode `openWidgetInWorkbench(workbenchPosition, widgetId, widgetData)`.
- **Pemanggilan:** Metode ini mengambil payload dan memancarkan event ke `EventBus`.
- **Masalah:** Terjadi pelanggaran Signature/Kontrak API.
  Metode ini memanggil:
  `eventBus.emit({ type: 'Widget.DataInjected', payload: ... })`
  Padahal `EventBus` MAEF mensyaratkan 2 parameter: `emit(eventName, payload)`. Akibatnya, `EventBus` menangkap argumen pertama sebagai string `[object Object]` dan data sesungguhnya `undefined`.

### `frontend/src/components/workbench/ConversationEngine.jsx`
- **Titik Asal Data:** Ya. Setelah mendapat respon dari LLM API atau *OS Interceptor*, ia memanggil `openLifecycleInspector('execution', jsonData)`.
- **Status:** Rantai data dari *ConversationEngine* ke `WorkspaceManager` **Valid**. Data LLM sukses dikirim hingga sini.

### `frontend/src/components/EngineerDashboard.jsx`
- **Keterlibatan:** File ini tidak terhubung dengan `MaefExecutionMonitorWidget` sama sekali. Ia hanya bertugas menampilkan ringkasan data dari database Supabase (Project Memory, Gaps, Tasks).
- **Status:** Aman, bukan bagian dari rantai kebocoran data real-time eksekusi.

---

## ⛓️ Analisis Titik Putus (The Broken Chain)
Data *Execution Trace* sebenarnya berhasil ditangkap oleh `ConversationEngine` dan dikirim ke `WorkspaceManager`. Namun, rantai ini putus saat `WorkspaceManager` mencoba mengirimkannya ke Widget akibat **Miskomunikasi API EventBus**:
1. **Pengirim Buta:** `WorkspaceManager` salah mengirim format event ke `EventBus`.
2. **Penerima Tuli:** `MaefExecutionMonitorWidget` menggunakan *listener* yang tidak eksis (`subscribe` alih-alih `on`).

---

## 💡 Rekomendasi Perbaikan (Patch Plan)
Kedua titik putus dapat diperbaiki dengan menormalkan kontrak komunikasi EventBus MAEF.

**1. Perbaikan di `WorkspaceManager.js` (Baris 315-320)**
Ubah cara emisi dari _Object based_ ke _Parameter based_:
```javascript
eventBus.emit('Widget.DataInjected', { 
  source: 'WorkspaceManager', 
  widgetId, 
  data: widgetData 
});
```

**2. Perbaikan di `MaefExecutionMonitorWidget.jsx` (Baris 26-32)**
Ubah *Event Listener* ke antarmuka standar:
```javascript
unsub = eventBus.on('Widget.DataInjected', (payload) => {
  if (payload.widgetId === 'widget:maef-monitor') {
    const executionTrace = payload.data?.logs || payload.data;
    setActiveTrace(executionTrace);
    setLoading(false);
  }
});
```
