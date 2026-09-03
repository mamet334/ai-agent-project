# ROADMAP: DASHBOARD OBSERVABILITY & REALTIME ZERO-TOKEN HEALTH

**Tipe Dokumen:** Engineering Roadmap & Architecture Specification  
**Area:** Frontend OS Dashboard & Observability Subsystem  
**Authority:** MAEF Constitution (22_MUS_UI_SPECIFICATION.md & 23_HOME_DASHBOARD_SPEC.md)  
**Status:** PROPOSED (Menunggu Persetujuan Eksekusi)  
**Tanggal:** 2026-09-03  

---

## 1. Latar Belakang & Masalah (Root Causes)

Pada saat pengguna masuk ke halaman utama (`https://mamet-ecosystem.vercel.app`), ditemukan sejumlah anomali visual dan ketidakakuratan data:

1. **Status Sistem Salah Tafsir (False Alarm `DOWN`):**
   * *Gejala:* Tulisan merah besar **`SYSTEM STATUS: DOWN`**, padahal seluruh komponen inti (Supabase, Auth, Storage, Edge Functions, Memory) berstatus **`HEALTHY`**.
   * *Akar Masalah:* `useDashboardData.js` menghitung status global berdasarkan `verification_audit_logs`. Jika terdapat satu saja riwayat verifikasi gagal di masa lampau (misal tanggal 2 September), sistem menganggap kondisi operasional saat ini mati (`DOWN`).

2. **Bug Rendering `[object Object]` pada Recent Failures:**
   * *Gejala:* Card kegagalan menampilkan teks mentah `[object Object]`.
   * *Akar Masalah:* Kolom `failures` di Supabase bertipe `JSONB`/Object, tetapi pada `ObservabilityPanel.jsx` langsung di-cast dengan `String(f.message)`.

3. **Telemetry Serba 0 & Timeline Kosong Default:**
   * *Gejala:* `Execution Trace Timeline` menampilkan `NO TELEMETRY AVAILABLE (UNKNOWN)`. Kartu metrik `MEMORY READS: 0`, `LLM CALLS: 0`, `AVG LATENCY: 0ms`.
   * *Akar Masalah:*
     * Timeline hanya memuat data bila user mengklik node tertentu di graph. Saat awal login (belum ada node dipilih), timeline dibiarkan kosong.
     * Metrik membaca tabel `ai_system_logs`, padahal Edge Functions di production Vercel mencatat data ke `agent_logs` dan `api_usage`.

4. **Persyaratan Khusus Owner (Zero-Token & Realtime):**
   * Pengecekan kesiapan sistem **TIDAK BOLEH** menggunakan token LLM atau menambah biaya API ($0.00).
   * Data harus bersifat **realtime**.

---

## 2. Prinsip Arsitektur: Zero-Token & Zero-Cost Realtime

Sesuai arahan Konstitusi (Observability First & Small Kernel), subsistem pemantau sistem harus mematuhi aturan berikut:

```
┌────────────────────────────────────────────────────────────────────────┐
│               ARSITEKTUR PEMANTAUAN REALTIME ($0.00 / 0 TOKEN)          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ 1. Database Liveness     : Query ping ringan Postgres (0 Token)        │
│ 2. Edge Function Ping    : Endpoint statis /ping HTTP 200 (0 Token)    │
│ 3. Kernel Internal State : Status memori browser kernel.status (0 Token)│
│ 4. Push Notif Realtime   : Supabase WebSocket postgres_changes         │
│ 5. Metrik & Latensi      : Agregasi SQL data lama api_usage (0 Token) │
│                                                                        │
│ ⛔ DILARANG KERAS: Memanggil model LLM (Gemini/OpenRouter/Groq/dll)    │
│                   hanya untuk memeriksa status kesiapan sistem.        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Rincian Ruang Lingkup Langkah 1 (Execution Scope)

### A. File 1: `frontend/src/hooks/useDashboardData.js`

1. **Logika Baru `SYSTEM STATUS`:**
   * **`HEALTHY`**:
     * Supabase DB terhubung (`!memRes.error && !docRes.error`).
     * Edge Ping merespons (`edgeStatus === '🟢'`).
     * Tidak ada error kegagalan fatal dalam jendela waktu 15 menit terakhir.
   * **`DEGRADED`**:
     * Terdapat kegagalan eksekusi atau peringatan verifikasi dalam **15 menit terakhir**.
     * Riwayat lampau (lebih dari 15 menit) diperlakukan murni sebagai arsip audit, bukan status live.
   * **`DOWN`**:
     * Database Supabase terputus total ATAU Edge Function tidak dapat dijangkau.

2. **Sanitasi Objek `failures` (Menghilangkan `[object Object]`):**
   * Melakukan normalisasi data:
     ```javascript
     let cleanMsg = 'Unknown verification failure';
     if (typeof v.failures === 'string') cleanMsg = v.failures;
     else if (Array.isArray(v.failures)) cleanMsg = v.failures.map(x => x.reason || x.rule || JSON.stringify(x)).join('; ');
     else if (typeof v.failures === 'object' && v.failures !== null) cleanMsg = v.failures.reason || v.failures.message || JSON.stringify(v.failures);
     ```

3. **Inisialisasi Timeline Aktivitas Terakhir (Auto-Load Latest Trace):**
   * Jika tidak ada node yang dipilih (`!activeTraceId`), sistem mengambil `trace_id` terbaru dari `agent_logs` (limit 1) sehingga panel timeline langsung menampilkan aktivitas sistem terakhir.

4. **Sinkronisasi Metrik Observabilitas:**
   * Membaca agregasi dari `api_usage` (total panggilan model & estimasi input/output tokens) dan `agent_logs` (read/write events).

---

### B. File 2: `frontend/src/components/dashboard/ObservabilityPanel.jsx`

1. **Penyajian Pesan Human-Readable:**
   * Memastikan rendering kegagalan (`recentFailures`) memotong teks panjang secara anggun dan menampilkan detail saat di-hover/klik.
2. **Deep-Link Resolusi Konflik Memori:**
   * Mengubah teks peringatan `MEMORY CONFLICTS: 3` menjadi link/tombol interaktif yang mengarahkan pengguna ke aplikasi Chat/Workspace untuk resolusi memori.

---

## 4. Rencana Pengujian & Verifikasi (Verification Gate)

1. **Pemeriksaan Statis & Validasi Build:**
   * Menjalankan build frontend via Vite (`npm run build`) untuk memastikan tidak ada kesalahan sintaks, impor rusak, atau regresi tipe data.
2. **Verifikasi Fungsional di Browser:**
   * Memastikan status sistem berubah dari `DOWN` merah menjadi `HEALTHY` hijau (atau `DEGRADED` kuning jika ada insiden dalam 15 menit terakhir).
   * Memastikan teks `[object Object]` pada card `VERIFICATION-FAIL` berubah menjadi penjelasan teks yang terbaca.
   * Memastikan `Execution Trace Timeline` menampilkan riwayat step aktivitas terakhir tanpa pesan error.
   * Memastikan konsumsi token untuk dashboard adalah **0 token**.

---

## 5. Status Dokumen

Dokumen ini disusun sebagai kontrak kerja rekayasa (*Engineering Contract*). Eksekusi kode ke file proyek **hanya akan dimulai setelah Owner memberikan persetujuan eksplisit**.
