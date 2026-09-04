# Changelog: Tahap 3 — PR#9 Fase 3 Web Comparison (`WebComparisonService.js`)

**Tanggal:** 2026-09-03  
**Tipe:** Architecture Implementation & Multi-Tier Knowledge Retrieval (Tahap 3 / PR#9 Fase 3)  
**Scope:** `frontend/src/core/runtime/services/WebComparisonService.js`, `frontend/src/core/runtime/services/RetrievalOrchestrator.js`, `frontend/src/core/runtime/Kernel.js`  
**Author:** Antigravity (AI Partner)  
**Status:** ✅ Selesai Diimplementasikan, Teruji Penuh (13/13 Tests Pass), Terdaftar di Kernel Phase 3, dan Build 100% Sukses

---

## 1. Konteks Arsitektural (PR#9 §2, §3, §6)

Melengkapi arsitektur retrieval berjenjang 3-Tier pada PR#9:
* **Tier 1 (Lokal):** `document_chunks` / `documents` via `KnowledgeService` & `RetrievalStrategyService` (Primer, paling dipercaya).
* **Tier 2 (Internal LLM):** Pengetahuan bawaan model via `InternalKnowledgeFallbackService` (Fallback jika Tier 1 `< 0.4`).
* **Tier 3 (Web Comparison):** Pembanding eksternal — up-to-date tetapi tidak 100% akurat.

Sesuai arahan PR#9 §6:
1. **Human-in-Command (Open Question 2):**  
   Web search **tidak boleh** dipanggil otomatis tanpa konfirmasi. Sistem memancarkan event `Retrieval:RequestWebConfirmation` ke UI sebelum melakukan fetch. Jika ditolak, pencarian web dibatalkan tanpa latensi/biaya (0 cost).
2. **Kejujuran Atribusi & Timeout Eksplisit (Open Question 3):**  
   * Batas waktu eksekusi web search adalah **8 detik** (`AbortController`).
   * Jika gagal atau timeout, sistem mengembalikan status `'TIMEOUT'`/`'FAILED'` secara transparan dengan disclaimer eksplisit, tanpa memaksakan jawaban seolah-olah data web ditemukan.
   * Format atribusi prompt:
     `--- Konteks {i+1} [Sumber: Web — {source_url}, akurasi tidak terverifikasi] ---`

---

## 2. Rincian Fitur & Implementasi

### A. `WebComparisonService.js` (Baru):
* **One File One Responsibility:** Bertanggung jawab tunggal untuk eksekusi web search, manajemen konfirmasi Owner, timeout, dan fallback.
* **Human-in-Command Confirmation Gate:**
  * `requestConfirmation({ query, traceId, reason })`: Emit event `Retrieval:RequestWebConfirmation`.
  * `resolveConfirmation(requestId, isApproved)`: Menyelesaikan keputusan Owner.
  * Opsi `autoConfirm: true` untuk pemanggilan yang telah mengantongi persetujuan sebelumnya.
* **Timeout & Error Handling:**
  * `WEB_SEARCH_TIMEOUT_MS = 8000` (8 detik) menggunakan `AbortController`.
  * Status: `'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'REJECTED'`.
  * Disclaimer transparan saat terjadi pembatalan atau kegagalan jaringan.
* **Kontrak Seragam PR#9 §3:**
  Mengembalikan chunks ber-`source_type: 'web'`, `tier: 3`, dan `strategy: 'web_search_comparison'`.
* **Telemetri:**
  Memancarkan event `Retrieval:Tier3WebComparison` memuat `traceId`, `query`, `status`, `durationMs`, dan jumlah chunks.

### B. Perluasan `RetrievalOrchestrator.js`:
* Inisialisasi `WebComparisonService` via `serviceManager` (atau auto-instantiation fallback).
* Alur orkestrasi 3-Tier berjenjang pada `retrieve(query, options)`:
  * Evaluasi Tier 1. Jika `sufficiency >= 0.4`, return Tier 1 langsung.
  * Jika Tier 1 kurang, siapkan fallback Tier 2.
  * Jika opsi `enableWebComparison` atau `needWebComparison` aktif $\rightarrow$ alirkan ke `WebComparisonService.searchWeb()`.
  * Format prompt otomatis mendukung `source_type: 'web'`.

### C. Registrasi `Kernel.js` Phase 3:
* Didaftarkan resmi di `_phase3_AdapterRegistryInit` sebagai `'WebComparisonService'` berdampingan dengan `RetrievalOrchestrator`.

---

## 3. Hasil Pengujian & Verifikasi Menyeluruh

Matrix pengujian dijalankan pada `scratch/test_web_comparison_service.mjs`:
1. **Group 1 (Kontrak Seragam & Inisialisasi):** 3/3 PASS (Inisialisasi, empty query handling, kontrak PR#9 seragam).
2. **Group 2 (Human-in-Command Confirmation Gate):** 3/3 PASS (Event emit, Owner reject aborts search, Owner approve executes search).
3. **Group 3 (Timeout 8s & Explicit Fallback):** 2/2 PASS (AbortController timeout handling, network failure graceful fallback).
4. **Group 4 (3-Tier Full Chain Integration):** 4/4 PASS (Tier 1 direct return, Tier 2 fallback, Tier 3 web return, Tier 3 rejection fallback with disclaimer).
5. **Group 5 (Prompt Attribution Formatting):** 1/1 PASS (Format prompt web akurasi tidak terverifikasi).

**Total Hasil Test:** ✅ **13/13 TESTS PASSED (100%)**  
**Build Frontend:** ✅ **`npm run build` Sukses 100% (2662 modules transformed, 0 error)**

---

## 4. Berkas yang Dibuat & Dimodifikasi

1. **[NEW]** [`frontend/src/core/runtime/services/WebComparisonService.js`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/core/runtime/services/WebComparisonService.js)
2. **[MODIFY]** [`frontend/src/core/runtime/services/RetrievalOrchestrator.js`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/core/runtime/services/RetrievalOrchestrator.js)
3. **[MODIFY]** [`frontend/src/core/runtime/Kernel.js`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/core/runtime/Kernel.js)
4. **[MODIFY]** [`frontend/index.html`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/index.html)
5. **[MODIFY]** [`frontend/electron/main.cjs`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/electron/main.cjs)
6. **[MODIFY]** [`frontend/src/components/workbench/ConversationEngine.jsx`](file:///d:/SLAMET/other/mamet%20os%20ecosystem/frontend/src/components/workbench/ConversationEngine.jsx)

---

## 5. Addendum (2026-09-04): Temuan Audit Uji Live, Perbaikan Bug 1–4, & Kebijakan Governance Baru

Selama pengujian manual Owner di aplikasi desktop pada skenario: *"Apa berita teknologi AI terbaru minggu ini?"*, ditemukan 4 bug berurutan yang seluruhnya telah ditelusuri akar masalahnya dan diselesaikan secara tuntas:

### 1. Rincian Bug 1 s.d. 3 (Runtime, Sufficiency, & Approval Handshake)
* **Bug 1 (`this._updateState is not a function`):**
  * *Root Cause:* Object spread `{ ...workspaceManager, osState }` di `ConversationEngine.jsx` melucuti metode prototype `WorkspaceManager`.
  * *Solusi:* Mempertahankan instance asli tanpa object spread dan menambahkan defensive binding di constructor `WorkspaceManager.js`.
* **Bug 2 (Tier 3 Tidak Terpicu):**
  * *Root Cause:* Skor kecukupan dokumen lokal sintetis (avg 0.60) selalu melampaui ambang batas 0.40, serta ketiadaan deteksi kueri temporal. Provider DuckDuckGo juga terblokir oleh sensor TrustPositif/Kominfo pada ISP Indonesia.
  * *Solusi:* Implementasi `isTemporalOrRecencyQuery()`, capping kecukupan ke 0.15, multi-provider resilient search (Google News RSS via `news.google.com` & Wikipedia API), post-hoc re-evaluation, serta kartu banner konfirmasi Human-in-Command di UI.
* **Bug 3 (Approval Menggantung & Timeout ke REJECTED):**
  * *Root Cause:* `EventBus.js` membungkus payload event dalam `{ source, timestamp, data }`. `ConversationEngine.jsx` menyimpan payload mentah sehingga `webConfirmation.requestId` bernilai `undefined`, yang menyebabkan `webService.resolveConfirmation(undefined)` gagal menemukan pending request.
  * *Solusi:* Ekstraksi unwrapping `wrappedPayload?.data || wrappedPayload`, penambahan fallback `targetId`, dan standardisasi nilai kembalian `resolveConfirmation` (mengembalikan `true` bila request berhasil diselesaikan baik disetujui maupun ditolak).

### 2. Rincian Bug 4: Pemblokiran Content Security Policy (CSP) Renderer
* **(a) Root Cause:**
  Meskipun alur approval berhasil di-resolve, panggilan `fetch()` dari renderer Electron menuju provider web diblokir oleh Chromium karena direktif `connect-src` pada tag `<meta http-equiv="Content-Security-Policy">` di `frontend/index.html` hanya mengizinkan `lite.duckduckgo.com` dan Supabase/LLM API. Akibatnya, `news.google.com`, `id.wikipedia.org`, dan `html.duckduckgo.com` diblokir CSP dengan pesan:
  `Connecting to 'https://news.google.com/rss/search...' violates CSP directive: "connect-src 'self' ..."`
  Pencarian gagal dan sistem jatuh ke fallback "informasi tidak mencukupi".
* **(b) Gap Metodologi Pengujian:**
  Pengujian otomatis sebelumnya (`test_web_comparison_service.mjs`, `test_full_ui_approval_flow.mjs`) dieksekusi menggunakan runtime **Node.js murni** (CLI). Node.js tidak menerapkan batasan browser Sandbox maupun Content Security Policy (CSP). Oleh karena itu, seluruh HTTP request sukses 100% di terminal, namun langsung terblokir ketika dijalankan di dalam lingkungan Chromium/Renderer Electron.
* **(c) Perbaikan Arsitektur CSP (Defense-in-Depth):**
  1. **Tag Meta HTML (`frontend/index.html`):** Menambahkan `https://news.google.com`, `https://*.google.com`, `https://id.wikipedia.org`, `https://*.wikipedia.org`, `https://html.duckduckgo.com`, `https://duckduckgo.com`, dan `https://*.duckduckgo.com` ke dalam direktif `connect-src`.
  2. **Electron Main Process (`frontend/electron/main.cjs`):** Mengonfigurasi filter header via `session.defaultSession.webRequest.onHeadersReceived` untuk memastikan relaksasi domain web search diterapkan pada level network interceptor session Electron.

### 3. Ketetapan Governance Baru (Mandatory Engineering Policy)
Mulai tanggal 2026-09-04:
1. Setiap fitur atau service baru yang melakukan **panggilan jaringan eksternal (network call / fetch) langsung dari renderer process** wajib memverifikasi kompatibilitas Content Security Policy (CSP) pada `frontend/index.html` dan `frontend/electron/main.cjs` sebelum fase verifikasi dinyatakan selesai.
2. Pengujian unit/integrasi pada runtime Node.js murni **tidak lagi diakui sebagai bukti live-verification tunggal** untuk kode renderer. Fitur renderer yang melakukan I/O eksternal **wajib diverifikasi secara live di dalam aplikasi Electron desktop nyata**.
