# CHANGELOG — Perbaikan Kritis: Dynamic Import Supabase 404 & Schema Drift Memory Governor

**Tanggal:** 2026-09-02  
**Kategori:** Bug Fix / Stability / Production Hardening  
**Tipe:** Critical Hotfix & Schema Realignment  
**Status:** ✅ Selesai, Ter-deploy, & Terverifikasi di Production Vercel  

---

## 1. Latar Belakang Masalah

Saat melakukan verifikasi live chat PR#9 Fase 2 di lingkungan production Vercel, ditemukan dua kegagalan sistemik kritis:

1. **`supabase.js` HTTP 404 di Vercel Production:**
   * Di dalam beberapa berkas core runtime (`AssistantService.js`, `AuditLogService.js`, `KnowledgeService.js`), pemanggilan klien Supabase dilakukan melalui dynamic import runtime: `await import('../../../supabase.js')`.
   * Pada saat build produksi, plugin `rollup-obfuscator` (`vite.config.js`) mengaburkan (*mangling*) string path literal menjadi variabel heksadesimal (`_0x...`).
   * Akibatnya, Rollup/Vite tidak dapat menganalisis dan mem-bundle modul tersebut secara statis ke dalam chunk vendor. Di browser, eksekusi dynamic import berusaha mengunduh file fisik `https://mamet-ecosystem.vercel.app/supabase.js` yang menghasilkan **HTTP 404 Not Found**, melumpuhkan seluruh fitur database.

2. **Schema Drift `user_memories.updated_at` (HTTP 400):**
   * Di `MemoryGovernorService.retrieveMemory()`, query tahap pertama melakukan `.select('..., updated_at, ...')` dan `.order('updated_at', { ascending: false })`.
   * Skema aktual tabel PostgreSQL `user_memories` tidak memiliki kolom `updated_at` (hanya memiliki `created_at` dan `last_verified_at`).
   * PostgREST mengembalikan error **HTTP 400 Bad Request: `column user_memories.updated_at does not exist`** pada setiap percakapan Assistant, menyebabkan Two-Stage Retrieval selalu menghasilkan **0 memori**.

---

## 2. Rincian Solusi & Perubahan Kode

### A. Registrasi `SupabaseClient` di Kernel & Static Import
* **`frontend/src/core/runtime/Kernel.js`**:
  * Mengimpor `supabase` secara statis di level atas.
  * Mendaftarkan `SupabaseClient` ke Service Manager pada **Phase 1 (System Core Registration)**:
    ```javascript
    serviceManager.register('SupabaseClient', supabase);
    ```
* **`frontend/src/core/runtime/services/AssistantService.js`**:
  * Menghapus semua panggilan `await import('../../../supabase.js')` dan `await import('../../../components/AIAgent/hooks/useDesktopInterceptor.js')`.
  * Menggunakan static ESM import di bagian header.
* **`frontend/src/core/runtime/services/AuditLogService.js`**:
  * Mengubah seluruh pemanggilan ke static import `import { supabase } from '../../../supabase.js'`.
* **`frontend/src/core/runtime/services/KnowledgeService.js`**:
  * Menghapus fallback dynamic import di `_resolveSupabaseClient()`. Instance klien kini diperoleh secara bersih via Dependency Injection atau `this.serviceManager.get('SupabaseClient')`.

### B. Audit Menyeluruh Dynamic Import Codebase
* Melakukan peninjauan menyeluruh terhadap seluruh dynamic import yang tersisa di `frontend/src/`:
  * `AppRegistry.js`: Menggunakan `React.lazy()` untuk code splitting antarmuka — **Aman** karena berkas ini secara eksplisit dikecualikan dari `rollup-obfuscator`.
  * `Kernel.js`: Menggunakan dynamic import untuk modul tertentu — **Aman** karena dikecualikan dari obfuscator.
  * `fileProcessor.js`: Mengimpor library pihak ketiga `jszip`/`xlsx` sebagai *bare package* dari `node_modules` — **Aman**.
  * `module-loader.js`: Menggunakan `/* @vite-ignore */` untuk plugin eksternal — **Aman**.

### C. Penyelarasan Skema Kolom `user_memories`
* **`frontend/src/core/runtime/services/MemoryGovernorService.js`**:
  * Mengganti `.select('..., updated_at, ...')` $\rightarrow$ `.select('..., created_at, ...')`.
  * Mengganti `.order('updated_at', { ascending: false })` $\rightarrow$ `.order('created_at', { ascending: false })`.
  * Memperbarui kalkulasi recency score Tahap 2:
    ```javascript
    const timestamp = mem.last_verified_at || mem.created_at;
    const ageMs = timestamp ? Math.max(0, now - new Date(timestamp).getTime()) : MAX_AGE_MS;
    const recencyScore = Math.max(0, 1 - ageMs / MAX_AGE_MS);
    ```

---

## 3. Bukti Verifikasi Produksi Nyata (Live Vercel Log)

Setelah commit `a9a2223` dan `4c6bbe3` di-push ke GitHub dan di-deploy ke Vercel production (`https://mamet-ecosystem.vercel.app`), pengujian percakapan langsung menghasilkan trace eksekusi yang sukses dan bersih:

```text
[Kernel] [INFO] PHASE 1 — SYSTEM CORE REGISTRATION: Completed
...
[Kernel] [INFO] MAEF Kernel Bootstrap Complete — SYSTEM READY
...
[LIFECYCLE] Chat request sent
[RequestClassifier] → CONVERSATION (confidence: 1, len: 131)
[AssistantService] Mode check: workspace=ws-assistant, resolvedMode=ASSISTANT
[MemoryService] 🔍 Query memori untuk: Tolong jelaskan secara komprehensif tentang protokol komunikasi xenobiologis...
[MemoryGovernorService] Two-Stage: Tahap 1 → 3 kandidat, Tahap 2 → 3 teratas
[MemoryService] Two-Stage retrieval: 3 memori
[RetrievalOrchestrator] Starting knowledge retrieval for: "Tolong jelaskan secara komprehensif tentang protokol komunik..."
[KnowledgeService] Querying document_chunks for: "..." (keywords: tolong, jelaskan, secara, komprehensif, tentang)
[RetrievalStrategy] Detected case: B (5 chunks)
[RetrievalStrategy] Case B: diversity → 5/5 chunks (max 3/doc)
[RetrievalStrategy] Tier 1 Sufficiency score: 0.675 (strategy: case_b_diversity)
[AssistantService] PR#9 RetrievalOrchestrator: Tier 1, strategy=case_b_diversity, sufficiency=0.675
[PR#6 TokenEfficiency] RAG: 5828→4051 chars | Semantic: 0→0 chars
[PR#6 TokenEfficiency] Estimasi token: 1490 → 1046 (hemat ~444 token)
[LIFECYCLE] LLM response received (HTTP Status: 200)
[LIFECYCLE] Received JSON response (DIRECT mode)
```

### Kesimpulan Verifikasi:
1. **Zero HTTP 404:** Tidak ada lagi permintaan `supabase.js` yang gagal.
2. **Memory Governor Pulih:** Two-stage retrieval berhasil mengambil 3 memori aktif tanpa error 400.
3. **Request Classifier & RAG Bekerja Harmonis:** Permintaan berhasil diklasifikasikan sebagai `CONVERSATION`, mengaktifkan `RetrievalOrchestrator` Tier 1 (Case B Diversity, sufficiency 0.675), dan menghemat 444 token via `TokenEfficiency`.
4. **Pipeline Execution:** Edge function mengembalikan respons `HTTP 200` dan percakapan tampil utuh di antarmuka.
