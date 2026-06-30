# ARCHITECTURE ANALYSIS: GAP-007 (Legacy Plugin Dispatcher Monolith)

## 1. Analisis Arsitektur
Pemeriksaan pada `lib/orchestration/handlers/execution_handler.ts` menunjukkan pelanggaran arsitektur (*Architecture Gap*) yang serius:
1. **Tight LLM Coupling**: Modul ini menyuntikkan fungsi `customRunLLM` ke setiap plugin yang secara paksa memanggil `runLLM` dari orchestrator lawas, lengkap dengan identifikasi model *hardcoded* (seperti `groq-llama-3.1` atau `openrouter-google-gemini-2.0-flash-exp`). Ini merusak abstraksi `CapabilityRegistry` (ADR-012).
2. **Hardcoded Fallbacks**: Modul *Execution Handler* bertugas menyusun fungsi *Research* secara mandiri menggunakan `callLLMWithMetadata`, yang mana bukan tanggung jawab *Execution Handler* (Pelanggaran *Single Responsibility Principle*).
3. **Environment Leakage**: Variabel API Key dibongkar ulang dan diteruskan sebagai `env` kustom, padahal kita sudah memiliki `RuntimeContext` (rctx) yang tervalidasi.

## 2. Proposal Desain
Kita tidak akan menulis ulang ke-13 plugin secara serentak karena risikonya terlalu tinggi (*Implementation Risk: High*). Sebagai gantinya, kita akan merombak **lapisan penyangga** (*execution boundary*) di dalam `execution_handler.ts`:
1. **Delegasi CapabilityAdapter**: Fungsi `customRunLLM` tidak lagi bergantung pada `runLLM` lama. Kita akan merombaknya untuk memanggil rantai `CapabilityRegistry` secara langsung. Ini mengizinkan failover (rotasi key otomatis) jika LLM di dalam sub-agent gagal (misalnya Groq Rate Limit).
2. **Research Delegation**: Fungsi `customRunResearch` juga akan dimigrasikan untuk mengeksekusi *Adapter* melalui *CapabilityRegistry*, sehingga logika *fallback* tetap utuh.

## 3. Rencana Implementasi
Modifikasi pada `lib/orchestration/handlers/execution_handler.ts`:
- **Langkah 1**: Impor `CapabilityRegistry`.
- **Langkah 2**: Tulis ulang fungsi `customRunLLM` dengan mekanisme failover (menggunakan array adapter `['groq', 'gemini', 'openrouter']` secara adaptif tergantung kebutuhan spesifik sub-agent).
- **Langkah 3**: Tulis ulang `customRunResearch` dengan mekanisme serupa yang menyematkan `tools: ['web_search']` secara aman melalui adapter.
- **Langkah 4**: Emisikan `Tool.Invoked` ke *Event Bus* saat eksekusi dimulai, sesuai dengan amanat ADR-011.

## 4. Rencana Verifikasi
- Kompilasi TypeScript (`npx tsc`) tidak boleh pecah.
- Sistem *Timeout* (Mamet Healer) dan *Gating* yang ada di dalam handler tetap berjalan tanpa gangguan.

=================================================
OWNER APPROVAL
=================================================
Saya akan **MENUNGGU** persetujuan Anda sebelum mulai membongkar *Execution Handler*.
Apakah rencana penambalan *GAP-007* (Layer Boundary) ini disetujui?
