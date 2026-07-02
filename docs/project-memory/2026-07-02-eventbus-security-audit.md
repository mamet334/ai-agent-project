# Security Audit Report: MAEF EventBus
Tanggal: 2026-07-02
Target File: `frontend/src/core/runtime/EventBus.js`

## 1. Temuan Kerentanan Keamanan & Arsitektur

### ❌ 1. Penyadapan Data via Wildcard `*`
- **Tingkat Bahaya:** **CRITICAL**
- **Analisis:** Fitur listener `*` aktif dan tidak diproteksi. Siapa pun (termasuk *third-party adapter* atau komponen UI biasa) yang bisa mengakses referensi `EventBus` dapat menggunakan `.on('*', callback)` untuk menyadap *seluruh* lalu lintas data di dalam OS. Ini membahayakan kerahasiaan *VaultService* (kredensial) dan eksekusi AI yang dikirim via event.
- **Rekomendasi:** Hapus fungsionalitas wildcard global sepenuhnya, ATAU batasi aksesnya menggunakan *Capability System* (hanya `Kernel` atau `ServiceManager` yang boleh me- *register* wildcard untuk keperluan sistem/log).

### ❌ 2. Event Spoofing (Pemalsuan Identitas)
- **Tingkat Bahaya:** **HIGH**
- **Analisis:** `EventBus` bertindak sebagai pengantar data yang sangat bodoh (*dumb pipe*). Tidak ada verifikasi kriptografis, kapabilitas, maupun objek *Context* tentang **siapa** yang memanggil `.emit()`. Modul jahat atau *buggy* dapat memanggil `emit('Widget.DataInjected', { source: 'Kernel', data: 'malicious' })` dan menipu subsistem lain yang mengira data tersebut otentik.
- **Rekomendasi:** Ubah *signature* dari `emit(event, payload)` menjadi mewajibkan objek konteks/identitas (misal dari *ServiceManager*) sebagai param pertama, sehingga EventBus dapat membubuhkan Metadata Pengirim secara otomatis.

### ❌ 3. Tidak Ada Rate Limiting / Anti-Flood
- **Tingkat Bahaya:** **MEDIUM - HIGH**
- **Analisis:** Fungsi `emit()` memanggil *listener* secara *synchronous loop* (*blocking*). Tidak ada proteksi *throttle* atau *debounce*. Modul yang rusak (atau niat buruk) dapat melakukan *infinite loop* pada `emit()`, menyebabkan CPU 100% (*Event Loop Starvation*) dan membuat seluruh *browser runtime* OS macet (*Denial of Service*).
- **Rekomendasi:** Terapkan kuota *emit* per detik untuk masing-masing *namespace* pengirim, atau ubah eksekusi *callback* menggunakan `setImmediate` / `queueMicrotask` jika memungkinkan agar bersifat asinkron tanpa memblokir antarmuka utama.

### ❌ 4. Tanpa Validasi Tipe & Nama Event
- **Tingkat Bahaya:** **MEDIUM**
- **Analisis:** `EventBus` menggunakan `Map`. Nama event tidak divalidasi apakah berupa `String` atau bukan. Ini memicu *bug* seperti kasus `WorkspaceManager` sebelumnya di mana event di- *emit* menggunakan Object `{ type: '...' }` sebagai nama event, dan EventBus mengeksekusinya dalam keranjang memori `[object Object]`.
- **Rekomendasi:** Wajibkan `typeof event === 'string'`. *Throw error* secara instan bila menerima format nama event yang tidak valid.

### ❌ 5. Risiko Tabrakan Nama Event (No Namespacing)
- **Tingkat Bahaya:** **MEDIUM**
- **Analisis:** OS ini bersifat *pluggable* (modul pihak ketiga / plugin dinamis dari `module-loader.js`). Karena tidak ada aturan *namespacing* (seperti `System:Boot`, `Widget:Monitor:DataInjected`), nama event generik seperti `READY` atau `DATA` sangat rentan tertukar antar *Service* yang berbeda.
- **Rekomendasi:** Terapkan standar validasi format *Namespacing* berbasis _Regex_ saat pemanggilan `.on()` maupun `.emit()` (misal: `/^[a-zA-Z0-9]+:[a-zA-Z0-9_]+$/`).

---

## 2. Kesimpulan
`EventBus` saat ini berfungsi sebagai prototipe MVP yang mementingkan kecepatan aliran data, namun sepenuhnya abai terhadap *Defense-in-Depth*. Secara teknis ia melanggar prinsip *Adapter Isolation* pada **MAEF v2.0** karena tidak mencegah lalu lintas data yang melanggar batas otorisasi komponen. File ini membutuhkan restrukturisasi menjadi **MAEF Secure Message Bus**.
