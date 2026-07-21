# TODO: Fix Embedding di Request Pipeline

## Steps
- [x] 1. Analisis kode yang ada (CapabilityRegistry, embedding_adapter, runtime_context)
- [x] 2. Dapatkan persetujuan plan dari user
- [x] 3. Edit request_pipeline.ts:
  - [x] 3a. Baca environment keys (GEMINI_API_KEY, OPENAI_API_KEY) di awal
  - [x] 3b. Hapus blok RAG lama dari posisi awal (sebelum rctx)
  - [x] 3c. Pindahkan blok RAG ke SETELAH rctx dibuat
  - [x] 3d. Lengkapi rctx.keys dengan allGemini, gemini, openAI, groq
  - [x] 3e. Tambah helper function `generateEmbeddingThroughAdapter()` yang menggunakan CapabilityRegistry
  - [x] 3f. Panggil helper function sebelum match_memories RPC
- [x] 4. Validasi hasil edit

## Result
✅ Semua langkah selesai. File request_pipeline.ts sudah diperbaiki.

