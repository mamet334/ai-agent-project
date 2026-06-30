# ARCHITECTURE AUDIT: MEMORY AUDIT BYPASS (GAP-005)

**Target**: `plugins/memory_manager.ts`, `memory_write_worker.ts`, `lib/verification/memory_validator.ts`
**Date**: 2026-06-30
**Reference**: ADR-011 (MAEF Event System), 06_MEMORY_SYSTEM.md

## 1. KONDISI SAAT INI (THE AUDIT BYPASS)

Terdapat dua titik penyuntikan memori yang melanggar konstitusi MAEF Verification Gate:
1. **`plugins/memory_manager.ts`**: Sub-agent ini mengekstrak fakta menggunakan LLM lalu memanggil `saveFactDirectly()` ke database, melewati jalur verifikasi dan melanggar prinsip *Event-Driven* (ADR 11).
2. **`memory_write_worker.ts`**: *Async worker* ini mengekstrak fakta dengan *rule-based heuristic* lalu juga memanggil `saveFactDirectly()` tanpa verifikasi formal apakah penyuntikan ini diizinkan oleh `PolicyEngine` (khususnya untuk MametLite yang diblokir untuk menulis memori di P-003).

**Pelanggaran Konstitusi:**
- **Audit Bypass**: Penyisipan memori langsung ke `user_memories` tanpa *Trace ID* dan tanpa *MAEF Verdict*.
- **Coupling**: `plugins/memory_manager.ts` memotong kompas secara monolitik ke basis data.

## 2. RANCANGAN PENYELESAIAN (SECURITY HARDENING)

Untuk menambal kebocoran keamanan memori ini, kita akan menerapkan **Memory Verification Gate**:

### Langkah 1: Sentralisasi Memory Write via Event Bus
`plugins/memory_manager.ts` (dan alat serupa) dilarang menggunakan `saveFactDirectly`. Jika mereka ingin menyimpan memori, mereka harus mengemisikan event:
```typescript
eventBus.emit({
  type: 'Memory.WriteRequested',
  payload: { message: parsed.content, ... }
});
```
(Catatan: `synthesis_handler.ts` sudah melempar event ini untuk percakapan umum. Sub-agent tidak perlu melakukan bypass).

### Langkah 2: Memory Verification Gate di dalam Worker
`memory_write_worker.ts` yang menangani antrean tulis memori harus menjadi **penjaga gerbang tunggal** (The Only Gate). Sebelum ia memanggil `saveFactDirectly`, ia **WAJIB**:
1. Mengimpor `PolicyEngine` dan mengevaluasi aksi `WRITE_MEMORY`. Jika PolicyEngine menolak (misalnya karena `mode === 'LITE'`), proses harus berhenti dan menghasilkan audit log `REJECTED_BY_POLICY`.
2. Meyakinkan bahwa tipe memori dan kontennya memiliki tingkat kepercayaan (confidence) yang lulus sensor.

### Langkah 3: Menghapus Plugin Sub-Agent yang Duplikat
Karena `memory_write_worker.ts` sudah berjalan secara asinkron di belakang layar untuk setiap *Intent.Received* atau percakapan akhir, keberadaan sub-agent `memory_manager.ts` sebenarnya berpotensi menciptakan duplikasi (*double-extraction*). Kita dapat men- *deprecate* sub-agent ini (atau menjadikannya sekadar pelempar event) dan membiarkan `memory_write_worker.ts` yang menangani semua ekstraksi fakta secara konsisten.

---
**Pertanyaan untuk Owner:**
Apakah Anda setuju jika saya menambal **GAP-005** dengan cara:
1. Menambahkan `PolicyEngine.evaluate('WRITE_MEMORY')` sebagai *Hard Gate* di dalam `memory_write_worker.ts`.
2. Melarang `plugins/memory_manager.ts` menembak langsung ke DB dan memaksanya melalui *Event Bus* (atau menghapusnya sama sekali karena ekstraksi fakta sudah otomatis dilakukan oleh sistem asinkron)?
