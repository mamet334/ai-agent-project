# ARCHITECTURE ANALYSIS: GAP-006 (Context Compressor Capability Integration)

## 1. Analisis Arsitektur
Saat mendalami `plugins/context_compressor.ts` (yang bertugas melakukan kompresi kognitif untuk sistem Memori V2), saya menemukan **pelanggaran fatal terhadap ADR-012 (Capability Adapter)**:
1. **Raw HTTP Fetch**: Agen ini melakukan pemanggilan `fetch` secara manual langsung ke API Groq dan Gemini, mengabaikan hierarki *AI Adapter* yang sudah kita bangun.
2. **Isolated Key Management**: Agen ini mengambil API Key langsung dari `Deno.env.get` alih-alih menggunakan `RuntimeContext` yang sudah tervalidasi dan dirotasi.
3. **Bypass Telemetry**: Karena tidak menggunakan *Adapter*, eksekusi LLM di sini tidak tercatat oleh `Logger` dan lolos dari radar observabilitas MAEF.

## 2. Proposal Desain
Kita akan memigrasikan *Context Compressor* agar 100% patuh pada ekosistem MAEF:
1. Menjadikan `RuntimeContext` (*rctx*) sebagai *citizen* kelas satu yang wajib di-passing dari lapisan Orchestrator -> Retrieval -> Compressor.
2. Menghapus logika HTTP *fetch* mentah di `context_compressor.ts` dan menggantinya dengan `CapabilityRegistry.getAvailableAIAdapters()`.
3. Karena agen ini membutuhkan respons JSON super cepat (Inference-Time), kita akan memprioritaskan spesifikasi adapter `groq` terlebih dahulu, lalu di- *cascade* ke `gemini` jika rate limit.

## 3. Rencana Implementasi
- **Step 1**: Modifikasi `ContextBuilderHandler` (di `lib/orchestration/handlers/context_builder.ts`) agar meneruskan objek `rctx` saat memanggil servis memori (User Memory).
- **Step 2**: Perbarui *signature* `retrieveMemories` dan `retrieveMemoriesV2` di `plugins/memory_manager_v1.ts` agar menerima parameter `rctx: RuntimeContext`.
- **Step 3**: Rombak `compressCognitiveContext` di `plugins/context_compressor.ts`:
  - Minta `rctx` di dalam parameternya.
  - Buat `adapterInput` sesuai standar.
  - Iterasi melalui `CapabilityRegistry.getAvailableAIAdapters(['groq', 'gemini'])`.
  - Eksekusi `adapter.execute(adapterInput, { trace_id })`.
  - Hapus semua *hardcoded fetch* dan manajemen *key*.

## 4. Rencana Verifikasi
- Tinjau ulang (*tsc*) agar tidak ada *type mismatches* di seluruh rantai (dari *context_builder* sampai *compressor*).
- Pastikan logika balasan fallback (jika JSON parsing gagal) tetap ada dan mengembalikan data mentah (fail-safe).

=================================================
OWNER APPROVAL
=================================================
Saya akan **MENUNGGU** persetujuan Anda atas rancangan ini.
Apakah Anda setuju untuk mengintegrasikan *Context Compressor* ke dalam kerangka kerja *Capability Adapter* sesuai dengan *Implementation Plan* di atas?
