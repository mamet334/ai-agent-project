# ARCHITECTURE AUDIT: RAG PIPELINE MONOLITH (GAP-004)

**Target**: `lib/rag/rag_pipeline.ts`
**Date**: 2026-06-30
**Reference**: ADR-011 (MAEF Event System)

## 1. KONDISI SAAT INI (THE PROCEDURAL MONOLITH)

Saat ini, `executeRagPipeline` di dalam `rag_pipeline.ts` adalah sebuah *procedural monolith* raksasa. Ia secara kaku dan berurutan (*sequential*) memanggil modul-modul berikut:
1. `generateEmbedding`
2. Supabase Routing (`knowledge_spaces` query)
3. `searchDocuments`
4. `loadProjectMemory`
5. `loadEngineerContext`
6. `buildContextPipeline` (Fusion)

**Pelanggaran Konstitusi (ADR 11):**
- **Tightly Coupled**: RAG Pipeline memanggil modul-modul lain secara langsung (direct import/invocation) alih-alih melalui *Event Bus*.
- **Synchronous Blocking**: Pengambilan Project Memory dan Engineer Context harus menunggu pengambilan dokumen RAG dan *embedding* selesai, padahal mereka bisa berjalan paralel secara konseptual.
- **Violation of MAEF Gatekeeper**: Pengambilan keputusan *routing* di- *hardcode* di tengah-tengah fungsi `executeRagPipeline` alih-alih menjadi tanggung jawab *Policy/Routing Engine* tersendiri.

## 2. DILEMA TEKNIS EDGE FUNCTION

*Event Bus* saat ini (pada `event_bus.ts`) bersifat *Fire-and-Forget* (metode `emit` tidak mengembalikan `Promise` yang dapat di- *await* untuk penyatuan hasil). 
Lingkungan operasi kita adalah **Supabase Edge Function** yang bersifat *Request-Response* (stateless).
Jika kita memecah RAG sepenuhnya menjadi *pure asynchronous events*, kita akan kesulitan mengumpulkan (*gather*) hasil-hasil tersebut sebelum batas waktu HTTP Response (timeout).

## 3. RANCANGAN TRANSISI EVENT-DRIVEN (PHASE 1)

Untuk memenuhi ADR 11 tanpa menghancurkan eksekusi HTTP Edge Function, kita harus membangun **Event-Driven Gatherer Pattern** atau **Scatter-Gather Pattern** melalui MAEF Orchestrator.

### Langkah 1: Penguraian Monolith Menjadi Service Independen
Alih-alih `executeRagPipeline` memanggil semuanya, kita akan memiliki tiga layanan independen:
1. `KnowledgeRetrievalService` (Mengerjakan Embedding & searchDocuments)
2. `MemoryRetrievalService` (Mengerjakan Project Memory)
3. `EngineerContextService` (Mengerjakan Engineer Context)

### Langkah 2: Mekanisme Scatter-Gather
Kita butuh mekanisme *Promise-based Event Awaiter* pada Orchestrator.
Karena *Event Bus* saat ini *fire-and-forget*, kita dapat memodifikasi `ContextBuilderHandler` untuk secara eksplisit menjalankan layanan-layanan ini secara paralel menggunakan pola pendelegasian tersendiri yang dikendalikan oleh MAEF State Machine (dengan `Promise.all`), bukan dipusatkan di satu fungsi monolith.

### Rencana Aksi (Action Plan):
1. Hapus fungsi raksasa `executeRagPipeline` dari `rag_pipeline.ts`.
2. Ubah `ContextBuilderHandler` (di `context_builder.ts`) agar memecah eksekusi ke dalam *Promise.all()* paralel terhadap modul *RAG*, *Memory*, dan *EngineerContext*. Ini adalah bentuk awal dari *Decoupled Execution* sebelum *Full Event Router* siap.
3. Pindahkan logika *Routing Decider* (yang mengecek nama *workspace*) ke layanan *Routing* khusus agar RAG hanya bertugas murni mencari dokumen, bukan membuat keputusan *routing*.

---
**Pertanyaan untuk Owner:**
Apakah Anda setuju jika kita memulai transisi ini dengan menerapkan **Scatter-Gather (Promise.all)** di dalam `ContextBuilderHandler` sebagai jembatan *Phase 1* menuju arsitektur *Full Event-Driven*, sekaligus mengeliminasi monolith di `rag_pipeline.ts`?
