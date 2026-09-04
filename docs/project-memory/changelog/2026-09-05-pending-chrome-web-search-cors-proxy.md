# Changelog — 2026-09-05: Pencatatan Backlog Tier 3 Web Search Chrome/Vercel (Tanpa Perubahan Kode)

**Author:** Antigravity  
**Tanggal:** 2026-09-05  
**Tipe:** Dokumentasi Arsitektur & Backlog  
**Status:** 📋 PENDING / BACKLOG (Sesuai Arahan Owner: *"update catatan saja agar di perbaiki nanti, jangan ubah code"*)  
**Dokumen Terkait:**
- [`docs/roadmap/PENDING-tier3-web-search-chrome-cors-proxy-fix.md`](../../roadmap/PENDING-tier3-web-search-chrome-cors-proxy-fix.md)
- [`docs/roadmap/INDEX-ROADMAP.md`](../../roadmap/INDEX-ROADMAP.md)
- [`docs/roadmap/PR9-retrieval-tier-architecture.md`](../../roadmap/PR9-retrieval-tier-architecture.md)

---

## Ringkasan Eksekutif

Pada pengujian live di browser Google Chrome (deployment Vercel di `https://mamet-ecosystem.vercel.app`), fitur Tier 3 Web Comparison belum berjalan karena error 404 pada dynamic import file `supabase.js` (`GET https://mamet-ecosystem.vercel.app/supabase.js 404 Not Found`). Akibatnya, pemanggilan Edge Function `proxy_fetch` gagal sebelum dieksekusi, dan browser melakukan fallback langsung ke URL RSS Google News yang kemudian diblokir oleh kebijakan CORS browser.

Sesuai instruksi mutlak dari Owner (*"update catatan saja agar di perbaiki nanti, jangan ubah code"*):
- **TIDAK ADA KODE YANG DIUBAH** pada sesi ini.
- Analisis akar masalah, log konsol, perbedaan Desktop vs Web, serta rencana perbaikan jangka panjang telah didokumentasikan secara lengkap dalam roadmap dan backlog untuk dieksekusi pada iterasi berikutnya.

---

## Rincian Temuan & Akar Masalah

1. **Error Console Browser:**
   ```
   index-CDyBJgLa.js:228 GET https://mamet-ecosystem.vercel.app/supabase.js net::ERR_ABORTED 404 (Not Found)
   index-CDyBJgLa.js:228 [WebComparisonService] Proxy bridge exception: Failed to fetch dynamically imported module: https://mamet-ecosystem.vercel.app/supabase.js
   Access to fetch at 'https://news.google.com/rss/search?q=...' from origin 'https://mamet-ecosystem.vercel.app' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
   ```
2. **Akar Masalah:**
   Di `frontend/src/core/runtime/services/WebComparisonService.js:359`, pemanggilan Supabase menggunakan dynamic import:
   ```javascript
   const { supabase } = await import('../../../supabase.js');
   ```
   Dalam build production Vite di Vercel, dynamic import relative yang tidak di-bundle ke static graph memicu permintaan ke URL absolut `/supabase.js` di server web Vercel, yang mengembalikan HTTP 404.
3. **Mengapa Desktop Berhasil?**
   Desktop Electron menggunakan native IPC bridge (`window.electronAPI.fetchWeb`) yang berjalan via Node.js runtime di main process. Lingkungan ini tidak terpengaruh oleh CORS Chromium maupun dynamic import bundler.

---

## Rencana Aksi Mendatang (Future Remediation)

1. Ganti dynamic import pada `WebComparisonService.js` menjadi static import di bagian atas berkas:
   ```javascript
   import { supabase } from '../../../supabase.js';
   ```
   atau manfaatkan ServiceManager Dependency Injection (`this.serviceManager.get('supabaseClient')`).
2. Verifikasi header CORS pada Edge Function `proxy_fetch` di Supabase Cloud.
3. Lakukan verifikasi live pada lingkungan web Chrome / Vercel untuk memastikan pencarian berita temporal (mis. berita AI terbaru) menghasilkan status valid dan dokumen web `[DOC-XXXX]`.
