# ARCHITECTURE ANALYSIS: GAP-008 (LLM Orchestrator Procedural Bypasses)

## 1. Analisis Arsitektur
Pemeriksaan pada fungsi `runLLM` di dalam `lib/llm_orchestrator.ts` menunjukkan adanya residu prosedural monolitik:
1. **Bypass Capability Registry**: Terdapat blok *USER-EXPLICIT MODEL SELECTION* yang memanggil fungsi lawas (`callOpenAI`, `callOpenRouter`, `callGroq`) secara *hardcode* dalam blok `try-catch`. Hal ini secara sadar mem-*bypass* `CapabilityRegistry` beserta seluruh pengamanan *rate-limit* (cooldown) dan pencatatan telemetri di dalamnya.
2. **Disconnected Fallback**: Jika model eksplisit gagal, ia melempar pengecualian dan ditangkap oleh blok *fallback* utama secara kasar, berpotensi menimbulkan eksekusi ganda atau latensi tinggi karena tidak menggunakan *cascade order* murni dari *Capability Adapter*.

## 2. Proposal Desain
Kita akan melakukan unifikasi (penyatuan) lapisan antarmuka LLM non-stream:
1. Menghapus blok pengecekan `if-else` manual yang memanggil `callOpenAI` dkk di dalam `runLLM`.
2. `runLLM` hanya akan bertugas mendeteksi (resolve) mana *provider* yang diinginkan berdasarkan `rctx.model.model`, kemudian menyuntikkannya sebagai parameter `preferredProvider` ke dalam `callLLMWithCascade` / `callLLMWithMetadata`.
3. Memperbarui logika `callLLMWithMetadata` agar bisa menerima `preferredProvider` secara dinamis (seperti `openai`, `openrouter`, `groq`, `gemini`), dan secara otomatis memposisikan provider pilihan tersebut di urutan teratas (index 0) dari antrean *Cascade Order*.

## 3. Rencana Implementasi
- **Langkah 1**: Perbarui *signature* `callLLMWithMetadata` dan `callLLMWithCascade` di `lib/llm_orchestrator.ts` untuk menerima `preferredProvider` bertipe `string` bebas (bukan union terbatas `'gemini' | 'groq'`).
- **Langkah 2**: Perbaiki urutan *cascadeOrder* di dalam `callLLMWithMetadata` agar secara dinamis memprioritaskan *provider* yang diminta user, dengan fallback standar ke *provider* yang lain.
- **Langkah 3**: Hapus *hardcoded dispatch* di `runLLM`. Ganti dengan logika deteksi `preferredProvider` dan lemparkan ke `callLLMWithCascade`.

## 4. Rencana Verifikasi
- Melakukan kompilasi TypeScript (`tsc`) untuk memastikan *type check* untuk `preferredProvider` sudah ter- *update*.
- Memastikan aliran kontrol LLM non-streaming sepenuhnya sejalan dengan MAEF *Capability Adapters*.

=================================================
OWNER APPROVAL
=================================================
Saya akan **MENUNGGU** persetujuan Anda sebelum mulai membedah `llm_orchestrator.ts`.
Apakah rencana penambalan *GAP-008* (LLM Orchestrator Procedural Bypasses) ini disetujui?
