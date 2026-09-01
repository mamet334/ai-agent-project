# Changelog: Archive Dead Memory/Cognition Cluster (lib/ + api/memory/)

Tanggal: 2026-09-01
Status: Selesai
Branch: `main`
Referensi task sebelumnya: Audit 2026-08-31, Follow-up verifikasi 2026-09-01

---

## Ringkasan

Satu cluster dead code (18 file lib/ + 3 route api/memory/ + 1 script) telah
dipindahkan ke `_knowledge_archive/lib_deprecated_cognition/` menggunakan `git mv`
sehingga history git tetap terjaga.

**Tidak ada perubahan perilaku aplikasi** — cluster ini sudah tidak memiliki
pemanggil aktif sejak sebelum diarsipkan.

---

## Yang Dipindahkan

### `lib/` → `_knowledge_archive/lib_deprecated_cognition/` (18 file)

| File | Peran Lama |
|---|---|
| `behaviorMemoryEngine.ts` | Mesin memori berbasis pola perilaku |
| `cognitiveMemoryGovernor.ts` | Governor memori kognitif (versi legacy) |
| `contextUnifier.ts` | Penyatu konteks multi-sumber |
| `decisionEngine.ts` | Engine keputusan berbasis memori |
| `globalCognitionLoop.ts` | Loop kognisi global |
| `intentPreprocessor.ts` | Preprocessor intent sebelum ke LLM |
| `memoryEngine.ts` | Engine read/write memori ke Supabase |
| `memoryGovernor.ts` | Governor memori versi pertama |
| `memoryStabilityCore.ts` | Stabilisasi konsistensi memori |
| `ocb.ts` | Observer-Controller-Bridge |
| `semanticBridge.ts` | Jembatan semantik antar komponen |
| `shortTermMemory.ts` | Memori jangka pendek per-sesi |
| `singleCognitiveCore.ts` | Single cognitive core (monolitik lama) |
| `supabaseClient.ts` | Supabase client versi legacy lib/ |
| `truthGraphMemory.ts` | Graf memori berbasis truth score |
| `truthScorer.ts` | Scoring kebenaran/kepercayaan memori |
| `truthScoringEngine.ts` | Engine truth scoring |
| `unifiedCognition.ts` | Unified cognition layer (lama) |

### `api/memory/` → `_knowledge_archive/lib_deprecated_cognition/api_memory/` (3 file)

| File | Fungsi |
|---|---|
| `read.ts` | Route GET/POST `/api/memory/read` |
| `write.ts` | Route POST `/api/memory/write` |
| `override.ts` | Route POST `/api/memory/override` |

### File Tambahan

- `_check_archived_deps.js` (root) → `_knowledge_archive/lib_deprecated_cognition/` — script deteksi sisa import ke lib/ yang dibuat pada upaya arsip pertama (5 Agustus 2026) namun tidak dieksekusi tuntas.

---

## Mengapa Diarsipkan

Cluster ini sudah digantikan oleh implementasi aktif:

- **`CognitiveMemoryGovernorService.js`** — menggantikan seluruh cognitive layer lama (cognitiveMemoryGovernor.ts, globalCognitionLoop.ts, singleCognitiveCore.ts, dll). Aktif dipakai oleh `AssistantService.js`.
- **`MemoryGovernorService.js` (Fase 1)** — menggantikan memoryEngine.ts dan memoryGovernor.ts. Mengakses Supabase langsung via `@supabase/supabase-js`, tidak lewat `memoryEngine.ts`.

Risiko tambahan jika dibiarkan: flag `LEGACY_COGNITION_ENABLED` didefinisikan ulang secara independen di 7 file dengan nilai saling bertentangan (true/false) — tidak ada single source of truth, berisiko jika ada yang keliru mengimpor dari sini.

---

## Bukti Verifikasi (dijalankan 2026-09-01 pagi sebelum eksekusi)

### 1. Zero import aktif ke lib/ dari luar cluster

```powershell
Get-ChildItem -Path "." -Recurse -Include "*.js","*.jsx","*.ts","*.tsx" |
  Where-Object { $_.FullName -notmatch "node_modules" -and $_.FullName -notmatch "\\lib\\" } |
  Select-String -Pattern "from ['\"].*lib/(cognitiveMemoryGovernor|...)"
```
**Hasil:** 3 hit — semuanya dari `api/memory/read.ts`, `write.ts`, `override.ts` yang juga dead.

### 2. Zero pemanggil ke endpoint /api/memory/*

```powershell
Select-String -Pattern "api/memory/read|api/memory/write|api/memory/override|/memory/read|/memory/write|/memory/override" ...
```
**Hasil:** KOSONG — tidak ada frontend, service, atau hook yang memanggil route ini.

### 3. Zero fetch dinamis ke path memory

```powershell
Select-String -Pattern "fetch\(.*memory|axios.*memory|apiClient.*memory" ...
```
**Hasil:** KOSONG.

### 4. MemoryGovernorService.js Fase 1 tidak bergantung pada cluster ini

```powershell
Select-String -Path "MemoryGovernorService.js" -Pattern "api/memory|memoryEngine|readMemory|writeMemory|overrideMemory"
```
**Hasil:** KOSONG — MemoryGovernorService.js independen penuh.

### 5. Riwayat git cluster ini

Commit terakhir semua file: **2026-08-05**, pesan "fix: restore critical imports and archive dead code".
Menunjukkan upaya arsip pernah dimulai oleh Owner sebelumnya namun tidak diselesaikan.
Task ini menuntaskan pekerjaan tersebut.

---

## Konfirmasi Tidak Ada Perubahan Behavior

- Build berhasil tanpa error "module not found" setelah archive (konfirmasi di Step 5)
- `CognitiveMemoryGovernorService.js` tidak disentuh
- `MemoryGovernorService.js` tidak disentuh
- Seluruh PR#1–PR#8 dan Skill Implementation tidak terpengaruh
- Frontend application tidak menyimpan dependency apapun ke cluster ini

---

## Lokasi Arsip

```
_knowledge_archive/
└── lib_deprecated_cognition/
    ├── README.md            ← dokumentasi arsip ini
    ├── _check_archived_deps.js
    ├── behaviorMemoryEngine.ts
    ├── cognitiveMemoryGovernor.ts
    ├── ... (15 file lib/*.ts lainnya)
    └── api_memory/
        ├── read.ts
        ├── write.ts
        └── override.ts
```
