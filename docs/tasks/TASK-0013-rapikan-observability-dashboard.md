# Task: Rapikan Observability Dashboard — Status Logic & Realtime

**Konteks:** Dashboard observability (`ObservabilityPanel.jsx` + `SystemStatusWidget.jsx`,
ditemukan Antigravity saat scan telemetri sebelumnya) sudah berfungsi, tapi tampilannya
membingungkan dan kemungkinan tidak realtime. Screenshot terlampir menunjukkan:
`SYSTEM STATUS: DOWN` (merah, mencolok) padahal 7 dari 11 komponen `HEALTHY`, hanya 2
`DOWN` dan 2 `UNKNOWN`. Execution Trace Timeline menunjukkan "NO TELEMETRY AVAILABLE
(UNKNOWN)" dan semua metrik (Memory Reads/Writes, LLM Calls, Avg Latency, Errors, Cost
Alerts) menunjukkan 0.

**PENTING — pelajaran dari task sebelumnya:** Untuk setiap temuan dan setiap perubahan
yang diusulkan, sertakan bukti baris kode konkret (file + nomor baris). Jangan simpulkan
tanpa menunjukkan bukti.

**Batasan tanggung jawab:** Task ini TIDAK melibatkan `SystemGovernorService.js` (belum
dikerjakan) dan tidak menambah tanggung jawab apa pun ke situ. Ini murni perbaikan pada
layer telemetri/UI yang sudah ada (`useDashboardData.js`, `ObservabilityPanel.jsx`,
`SystemStatusWidget.jsx`, `Kernel.getHealth()`).

---

## Bagian A — Investigasi Dulu (Sebelum Ubah Apa Pun)

### A.1 Kenapa status "DOWN" muncul padahal mayoritas komponen HEALTHY?

Cari logic yang menghitung `SYSTEM STATUS` agregat di `SystemStatusWidget.jsx` atau
`ObservabilityPanel.jsx`. Kemungkinan ada logic "jika ADA SATU komponen DOWN, maka
status keseluruhan = DOWN" — tanpa mempertimbangkan berapa banyak dan seberapa kritis
komponen yang down itu.

```bash
grep -n "SYSTEM STATUS\|systemStatus\|overallStatus\|aggregateStatus" frontend/src/components/dashboard/ObservabilityPanel.jsx
grep -n "SYSTEM STATUS\|systemStatus\|overallStatus\|aggregateStatus" frontend/src/components/dashboard/widgets/SystemStatusWidget.jsx
```

Laporkan: logic exact yang dipakai sekarang (tunjukkan kode), dan apakah dia
membedakan derajat keparahan atau murni boolean any-down-means-down.

### A.2 Verifikasi dugaan: apakah "DOWN" untuk Verification & Agent Process itu beneran gagal, atau cuma belum ada data?

Owner menduga status ini baru muncul/berubah setelah ada interaksi chat — mengindikasikan
kemungkinan **"belum ada data" (no telemetry yet) tertampil sebagai "DOWN"**, bukan status
gagal yang sebenarnya.

```bash
grep -n "DOWN\|UNKNOWN\|HEALTHY" frontend/src/components/dashboard/widgets/SystemStatusWidget.jsx
```

Cari bagaimana status per-komponen ditentukan — apakah ada logic default/fallback yang
menetapkan `DOWN` ketika query telemetri mengembalikan kosong/null, alih-alih `UNKNOWN`
atau `IDLE`? Tunjukkan kode exact-nya.

**Ini krusial:** kalau benar begitu, itu adalah bug klasifikasi (data kosong ≠ down),
bukan masalah realtime semata.

### A.3 Kenapa Execution Trace Timeline dan metrik menunjukkan 0 / "NO TELEMETRY AVAILABLE"?

```bash
grep -n "NO TELEMETRY AVAILABLE" frontend/src/components/dashboard/ObservabilityPanel.jsx
```

Cek: apakah ini karena belum ada query terakhir yang match trace_id aktif, polling
interval yang terlalu jarang, atau memang default state sebelum interaksi pertama?

---

## Bagian B — Perbaikan yang Diusulkan (setelah Bagian A dikonfirmasi)

### B.1 Pisahkan status "Belum Ada Data" dari "Gagal"

Tiga state per komponen, bukan dua:
- `HEALTHY` — ada data terbaru, semua normal
- `IDLE` / `NO DATA YET` — belum ada aktivitas untuk komponen ini sejak boot/sesi terakhir
  (netral, bukan warning)
- `DOWN` — ada bukti aktif kegagalan (error response, timeout, connection refused)

`UNKNOWN` yang sudah ada di kode bisa jadi salah satu dari dua kategori terakhir —
perlu dipilah lebih jelas kapan `UNKNOWN` dipakai vs `IDLE` vs `DOWN` sebenarnya.

### B.2 Status Agregat: Severity-Aware, Bukan Any-Down-Means-Down

Usulan logic sederhana (deterministik, tanpa LLM):
```
Semua HEALTHY / IDLE           → status keseluruhan: READY (hijau)
Ada 1+ DOWN di komponen non-kritis → status keseluruhan: DEGRADED (kuning)
Ada DOWN di komponen kritis (Supabase, Auth, Provider) → status keseluruhan: DOWN (merah)
```

Definisi "komponen kritis" perlu didiskusikan — bisa dimulai dari daftar sederhana dan
disesuaikan berdasarkan pengalaman pakai nyata (bukan asumsi di muka), konsisten dengan
prinsip anti-over-engineering yang sudah dipakai di PR-PR sebelumnya.

### B.3 Realtime Refresh

Cek mekanisme polling/subscribe yang ada sekarang:
```bash
grep -n "setInterval\|useEffect.*fetch\|supabase.*subscribe\|realtime" frontend/src/hooks/useDashboardData.js
```

Laporkan interval polling saat ini (kalau ada) dan apakah memungkinkan ganti ke Supabase
Realtime subscription (event-driven) daripada polling — supaya update begitu ada event
baru masuk ke `agent_logs`/`ai_system_logs`, bukan menunggu interval berikutnya.

### B.4 "Last Check" Timestamp

Pastikan timestamp ini benar-benar update tiap kali data direfresh (baik polling maupun
realtime), bukan statis dari load pertama.

---

## Yang TIDAK Termasuk Task Ini

- Tidak menyentuh `SystemGovernorService.js` (belum dikerjakan, task terpisah)
- Tidak menambah tabel/skema Supabase baru — pakai yang sudah ada
  (`agent_logs`, `ai_system_logs`, `verification_audit_logs`)
- Tidak mengubah `ExecutionTraceService.js` 10-stage pipeline kecuali diperlukan langsung
  oleh perbaikan status di atas

---

## Output yang Diharapkan

1. Jawaban Bagian A (investigasi) dengan bukti baris kode untuk tiap poin
2. Konfirmasi/koreksi terhadap dugaan Owner soal "DOWN karena belum ada data"
3. Rencana implementasi Bagian B — boleh diajukan sebagai rencana dulu untuk direview
   sebelum eksekusi, terutama soal definisi "komponen kritis" di B.2
