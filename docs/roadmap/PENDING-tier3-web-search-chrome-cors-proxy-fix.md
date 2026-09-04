# PENDING — Remediasi Tier 3 Web Search pada Web Browser (Chrome/Vercel) via Proxy Bridge & Static Import

**Status:** 📋 **PENDING / BACKLOG (Menunggu Eksekusi Remediasi Sesuai Arahan Owner)**  
**Tanggal Pencatatan:** 2026-09-05  
**Komponen Terkait:** 
- `frontend/src/core/runtime/services/WebComparisonService.js` (Method `_safeFetch`)
- `supabase/functions/agent-process/request_pipeline.ts` (Action `proxy_fetch`)
- `frontend/src/supabase.js`
**Referensi Terkait:** [`PR9-retrieval-tier-architecture.md`](./PR9-retrieval-tier-architecture.md), [`INDEX-ROADMAP.md`](./INDEX-ROADMAP.md)

---

## 1. Gejala & Fakta (Console Log dari Pengujian Live Chrome di Vercel)

Saat pengguna mengakses aplikasi Mamet OS Ecosystem melalui browser web Google Chrome (deployment Vercel di `https://mamet-ecosystem.vercel.app`) dan mengajukan pertanyaan yang memerlukan pencarian web (misal: *"berita terbaru tentang ai gemini"*):

1. Muncul error network pada browser console:
   ```
   index-CDyBJgLa.js:228 GET https://mamet-ecosystem.vercel.app/supabase.js net::ERR_ABORTED 404 (Not Found)
   index-CDyBJgLa.js:228 [WebComparisonService] Proxy bridge exception: Failed to fetch dynamically imported module: https://mamet-ecosystem.vercel.app/supabase.js
   ```
2. Menyusul kegagalan proxy bridge, sistem mencoba melakukan direct fetch dari browser ke URL RSS Google News:
   ```
   Access to fetch at 'https://news.google.com/rss/search?q=...' from origin 'https://mamet-ecosystem.vercel.app' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
   ```
3. Akibatnya, `WebComparisonService` melaporkan bahwa tidak ada dokumen web yang berhasil ditarik:
   `[WebComparisonService] Pencarian web tidak menghasilkan dokumen relevan.`
4. Asisten AI kemudian jatuh ke fallback jujur dengan status epistemik:
   `[STATUS: INSUFFICIENT]` *"Sayangnya, saya tidak memiliki informasi terbaru tentang AI Gemini setelah akhir 2024..."*

---

## 2. Analisis Akar Masalah (Root Cause Analysis)

### A. Dynamic Import vs Bundling Vite di Production
Pada `frontend/src/core/runtime/services/WebComparisonService.js:359`, pemanggilan Supabase client di dalam fallback browser dituliskan menggunakan dynamic import:
```javascript
const { supabase } = await import('../../../supabase.js');
```
Ketika Vite melakukan build production (`npm run build`), modul JavaScript di-bundle dan di-hash (misal menjadi `dist/assets/index-[hash].js`). Relative dynamic import ke berkas di luar dependency chunk tree yang dievaluasi secara dinamis dapat menyebabkan Vite tidak mengenali modul tersebut sebagai chunk internal atau menghasilkan browser native dynamic import ke URL root `https://mamet-ecosystem.vercel.app/supabase.js`. Karena file fisik `supabase.js` tidak berada di root domain web server Vercel, browser menerima respons **HTTP 404 (Not Found)**.

### B. Kegagalan Pemanggilan Edge Function `proxy_fetch`
Karena dynamic import melempar exception `Failed to fetch dynamically imported module: ...`, eksekusi kode terputus sebelum mencapai baris:
```javascript
const { data, error } = await supabase.functions.invoke('agent-process', {
  body: { action: 'proxy_fetch', url }
});
```
Sehingga Supabase Edge Function `proxy_fetch` sebenarnya **sama sekali belum sempat dieksekusi** di lingkungan browser.

### C. Pemblokiran CORS pada Direct Fetch Browser
Setelah blok proxy gagal dengan exception, fungsi `_safeFetch` jatuh ke baris fallback `fetch(url, ...)` langsung dari browser. Mengingat browser modern menerapkan *Same-Origin Policy* (SOP) yang ketat, dan server publik seperti Google News RSS tidak menyertakan header `Access-Control-Allow-Origin: *`, browser Google Chrome memblokir request tersebut dengan CORS error.

### D. Mengapa Berjalan Lancar di Desktop Electron?
Di aplikasi Desktop Electron (`window.electronAPI.fetchWeb`):
- Permintaan jaringan diarahkan melalui IPC ke Node.js Native Bridge di file `electron/main.cjs` / `preload.cjs`.
- Node.js tidak terikat oleh kebijakan CORS browser dan tidak memicu kode dynamic import `supabase.js`.
- Oleh karena itu, pengujian Tier 3 Web Search di Desktop Electron berhasil 100%, sedangkan di Web Chrome / Vercel mengalami kegagalan pada titik dynamic import tersebut.

---

## 3. Rencana Solusi Permanen (Untuk Dikerjakan Nanti)

> [!IMPORTANT]
> **Status saat ini:** Dokumen ini HANYA mencatat analisis dan rencana perbaikan. Sesuai arahan eksplisit Owner (*"update catatan saja agar di perbaiki nanti, jangan ubah code"*), **TIDAK ADA PERUBAHAN KODE SUMBER** yang dilakukan pada sesi ini.

Saat nanti dijadwalkan untuk diperbaiki, berikut langkah teknis yang perlu diterapkan:

### Langkah 1: Ubah Dynamic Import Menjadi Static Import di `WebComparisonService.js`
Seperti halnya implementasi pada `frontend/src/core/runtime/services/AssistantService.js:23`:
```javascript
import { supabase } from '../../../supabase.js';
```
Letakkan static import ini di bagian atas `WebComparisonService.js`.
Dengan cara ini:
- Vite akan menyertakan `supabase` langsung ke dalam module graph saat build bundle.
- Tidak akan ada request HTTP 404 ke URL `/supabase.js`.
- Browser dapat langsung mengakses `supabase.functions.invoke('agent-process', { body: { action: 'proxy_fetch', url } })`.

### Langkah 2 (Alternatif Modular): Dependency Injection via ServiceManager
Jika ingin sepenuhnya decoupled tanpa import file langsung:
- Daftarkan `supabaseClient` ke dalam `ServiceManager` pada saat bootstrap `Kernel.js`.
- Di `WebComparisonService`, akses instance Supabase via:
  ```javascript
  const supabase = this.serviceManager?.get('supabaseClient') || this.serviceManager?.get('SupabaseService')?.client;
  ```

### Langkah 3: Verifikasi Edge Function CORS & Payload
Pastikan endpoint Edge Function `agent-process` dengan action `proxy_fetch`:
1. Memiliki header `Access-Control-Allow-Origin: *` dan menangani preflight `OPTIONS` secara bersih.
2. Mengembalikan teks feed RSS dengan encoding UTF-8 utuh ke browser.

---

## 4. Kriteria Verifikasi (Future Verification Checklist)

Pekerjaan remediasi ini akan dianggap selesai apabila:

1. [ ] Build Vite production (`npm run build`) berjalan bersih tanpa warning unresolved import.
2. [ ] Di browser Google Chrome pada deployment web (Vercel atau localhost web):
   - Console log **tidak lagi** mencatat error `GET /supabase.js 404 (Not Found)`.
   - Console log mencatat: `[WebComparisonService] Menggunakan Edge Function proxy_fetch untuk: https://news.google.com/rss/...`
   - Console log mencatat: `[WebComparisonService] Proxy fetch sukses (...) chars`.
3. [ ] Query temporal/berita (misal: *"berita terbaru tentang ai gemini"*) pada antarmuka web menghasilkan dokumen web valid di RAG block (`[DOC-XXXX]`).
4. [ ] Jawaban AI menampilkan fakta terkini dari hasil web comparison dengan status epistemik yang sesuai (`[STATUS: HYPOTHESIS - Rekomendasi AI]` atau `[STATUS: VERIFIED]`).
