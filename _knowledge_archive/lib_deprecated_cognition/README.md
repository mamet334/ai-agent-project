# Deprecated: Legacy Cognition Layer + api/memory routes

Diarsipkan: 2026-09-01 (pekerjaan tuntas dari upaya sebelumnya 2026-08-05)

## Apa yang ada di sini

### 18 file lib/ (cognitive memory layer lama)
```
behaviorMemoryEngine.ts
cognitiveMemoryGovernor.ts
contextUnifier.ts
decisionEngine.ts
globalCognitionLoop.ts
intentPreprocessor.ts
memoryEngine.ts
memoryGovernor.ts
memoryStabilityCore.ts
ocb.ts
semanticBridge.ts
shortTermMemory.ts
singleCognitiveCore.ts
supabaseClient.ts
truthGraphMemory.ts
truthScorer.ts
truthScoringEngine.ts
unifiedCognition.ts
```

### api_memory/ — 3 route API mati
```
api_memory/read.ts      → GET/POST /api/memory/read
api_memory/write.ts     → POST     /api/memory/write
api_memory/override.ts  → POST     /api/memory/override
```

### _check_archived_deps.js
Script deteksi sisa import ke lib/ yang dibuat saat upaya arsip pertama (5 Agustus 2026).

---

## Mengapa diarsipkan

Cluster ini sudah digantikan oleh implementasi aktif berikut:
- `frontend/src/core/runtime/services/CognitiveMemoryGovernorService.js` — menggantikan semua file cognitive layer (cognitiveMemoryGovernor.ts, globalCognitionLoop.ts, dll)
- `frontend/src/core/runtime/services/MemoryGovernorService.js` — Fase 1 aktif, mengakses Supabase langsung, tidak lewat memoryEngine.ts

---

## Bukti verifikasi sebelum arsip (2026-09-01)

1. **Zero import aktif ke lib/** — grep ke seluruh repo di luar `lib/` dan `node_modules` untuk 18 nama file menghasilkan 0 hasil (di luar `api/memory/` itu sendiri).

2. **Zero pemanggil ke endpoint api/memory/*** — grep ke seluruh repo untuk `/api/memory/read`, `/api/memory/write`, `/api/memory/override` menghasilkan 0 hasil.

3. **Tidak ada fetch dinamis ke path memory** — grep pola `fetch(.*memory`, `axios.*memory`, `apiClient.*memory` menghasilkan 0 hasil.

4. **MemoryGovernorService.js (Fase 1) independen** — grep `memoryEngine|readMemory|writeMemory|overrideMemory` di MemoryGovernorService.js menghasilkan 0 hasil. Service ini pakai Supabase client langsung.

5. **Commit terakhir semua file: 2026-08-05** — pesan "fix: restore critical imports and archive dead code", menunjukkan upaya arsip memang pernah dimulai tapi tidak tuntas.

---

## Status sebelum diarsipkan

Flag `LEGACY_COGNITION_ENABLED` ada di 7 file dengan nilai saling bertentangan (true/false) — tidak ada single source of truth. Ini risiko tambahan jika dibiarkan di codebase aktif.

---

## Pesan untuk AI/developer berikutnya

**JANGAN import dari folder ini di kode baru.**
Gunakan `CognitiveMemoryGovernorService.js` untuk cognition dan `MemoryGovernorService.js` untuk memory storage.
