# TODO — MemoryGovernorService (Fase 1: Stabilitas & Optimasi)

## Audit & Perencanaan (SELESAI)
- [x] Audit MemoryService.js, engineer.js (SessionArtifact), MemoryApp.jsx, Kernel.js, KnowledgeService.js
- [x] Audit skema Supabase (user_memories, raw_memory_content)
- [x] Audit jalur tulis backend (memory_write_worker.ts, memory_manager_v1.ts)
- [x] Analisis risiko & backward compatibility
- [x] Konfirmasi rencana dengan user

## Implementasi
- [x] Buat `frontend/src/core/runtime/services/MemoryGovernorService.js`
- [x] Buat migrasi SQL `_knowledge_archive/setup_memory_governor.sql`
- [x] Modifikasi `MemoryService.js` (dukung metadata golden source, delegasi ke governor)
- [x] Modifikasi `Kernel.js` (registrasi MemoryGovernorService di Phase 3)
- [x] Modifikasi `engineer.js` (hook `_finalizeSession()` + source_reference)
- [x] Modifikasi `MemoryApp.jsx` (tampilkan source_reference & version_code graceful)

## Pengujian
- [x] Verifikasi build tidak error (vite build sukses, 2647 modules)
- [x] Uji backward compatibility (data lama tanpa metadata)
- [x] Uji UI MemoryApp tidak crash dengan kolom baru
