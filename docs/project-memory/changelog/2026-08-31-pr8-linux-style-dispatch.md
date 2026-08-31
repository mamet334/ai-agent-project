# Changelog: PR#8 — Linux-style Request Dispatch

Tanggal: 2026-08-31
Status: Selesai Diimplementasikan
Branch: `main`
Commit: `78c2149` — feat(PR#8): Linux-style Request Dispatch

---

## Ringkasan Eksekutif

PR#8 menerapkan pola *Linux-style dispatcher* pada alur pemrosesan pesan `AssistantService`.
Sebelumnya, setiap pesan yang masuk — baik pertanyaan singkat 4 kata maupun task engineering
kompleks — melewati pipeline yang sama persis: memory retrieval, RAG context, semantic
context, CMG validation, context trimming, baru ke Edge Function.

Setelah PR#8, ada layer routing tipis di depan pipeline tersebut:

```
User message
     ↓
RequestClassifierService.classify()   ← 0 LLM cost, 0 DB call, microseconds
     ↓
LOOKUP  → _handleLookup()      (skip memory/RAG/semantic, 3 history, payload minimal)
LAINNYA → _handleConversation() (alur penuh — perilaku yang sudah ada, tidak berubah)
```

---

## File yang Dibuat / Dimodifikasi

| File | Aksi | Keterangan |
|---|---|---|
| `frontend/src/core/runtime/services/RequestClassifierService.js` | **DIBUAT** | Dispatcher baru |
| `frontend/src/core/runtime/Kernel.js` | Dimodifikasi | Import + registrasi |
| `frontend/src/core/runtime/services/AssistantService.js` | Dimodifikasi | Refactor `processMessage()` |

---

## Detail Perubahan

### 1. `RequestClassifierService.js` (BARU)

**Lokasi:** `frontend/src/core/runtime/services/RequestClassifierService.js`

Tanggung jawab tunggal: menerima pesan + konteks → kembalikan tipe request.

**Tipe yang dikenali:**

| Tipe | Trigger | Confidence |
|---|---|---|
| `ENGINEER` | `resolvedMode === 'ENGINEER'` (dari workspace) | 1.0 |
| `COMMAND` | Pesan diawali `/` | 0.95 |
| `COMMAND` | Keyword eksplisit: "buat folder", "hapus file", "jalankan script", dll | 0.90 |
| `LOOKUP` | Panjang ≤80 char + kata tanya + tidak ada referensi file + history ≤4 | 0.80 |
| `CONVERSATION` | Default (semua yang tidak masuk kriteria di atas) | 1.0 |
| `SKILL` | Slot disiapkan (TODO comment) — belum diisi | — |

**Kata tanya yang dideteksi untuk LOOKUP:**
`apa, siapa, kapan, dimana, berapa, kenapa, mengapa, bagaimana` + padanan bahasa Inggris
(`what, who, when, where, why, how, which`) + `is, are, was, were, do, does, did, can...`

**Guard yang mencegah false LOOKUP:**
- Referensi file/path (`.js`, `.jsx`, `.ts`, `/path/to/`, dll) → bukan LOOKUP
- Pola konteks-dependen ("tadi", "lanjutkan", "yang tadi", "sebelumnya") → bukan LOOKUP
- History dalam percakapan aktif (> 4 pesan) → bukan LOOKUP

**EventBus event yang diemit:**
```
RequestClassifier:Classified → { type, confidence, msgLen, timestamp }
RequestClassifier:Ready      → { status: 'READY', timestamp }
```

**Log contoh:**
```
[RequestClassifier] → LOOKUP (confidence: 0.8, len: 24)
[RequestClassifier] → CONVERSATION (confidence: 1.0, len: 78)
[RequestClassifier] → ENGINEER (confidence: 1.0, len: 45)
```

---

### 2. `Kernel.js` (Dimodifikasi)

Import baru:
```javascript
import { RequestClassifierService } from './services/RequestClassifierService.js';
```

Registrasi di Phase 3 — setelah `ModuleDiscoveryService`, sebelum `AdapterRegistry`:
```javascript
const requestClassifierService = new RequestClassifierService(serviceManager);
await requestClassifierService.initialize();
serviceManager.register('RequestClassifierService', requestClassifierService);
```

Urutan registrasi Phase 3 setelah PR#8:
```
... → AssistantService → CommandRegistry → AuditLogService →
RetrievalStrategyService → ModuleDiscoveryService →
RequestClassifierService (BARU) → AdapterRegistry
```

---

### 3. `AssistantService.js` (Refactor `processMessage`)

**Sebelum PR#8:** `processMessage()` satu fungsi monolitik ~270 baris.

**Setelah PR#8:** 4 method dengan tanggung jawab terpisah:

#### `processMessage()` — Thin Dispatcher (~50 baris)
Hanya: resolve mode → memory trigger → classify → dispatch.
Tidak ada logic berat di sini.

```javascript
// 1. Resolve mode
// 2. Memory trigger check
// 3. PR#8: classify
const { type: requestType } = classifier?.classify(userMsg, history, resolvedMode) || { type: 'CONVERSATION' };
// 4. Dispatch
if (requestType === 'LOOKUP') return this._handleLookup(handlerParams);
return this._handleConversation(handlerParams);
```

#### `_handleLookup()` — BARU (alur ringan)
- **SKIP:** `MemoryService.getMemory()`, RAG context, `SemanticContextService`, CMG validation
- **TETAP:** BrainService (get AI provider), fetch ke Edge Function, handle response
- History: hanya 3 pesan terakhir (bukan 10)
- Payload flag: `mode: 'LOOKUP'`, `ragEnabled: false`, `globalMemory: ''`, `semanticContext: ''`
- Estimasi penghematan: ~30–50% token lebih sedikit vs CONVERSATION untuk pesan singkat

#### `_handleConversation()` — Extracted (alur penuh)
Logika yang sebelumnya ada di `processMessage()` — tidak ada perubahan fungsional.
Steps 3–8 dari alur lama tetap persis sama.

#### `_handleResponseStream()` — BARU (shared)
JSON + streaming response handler yang dipakai bersama `_handleLookup` dan
`_handleConversation`. Menghilangkan duplikasi kode response handling.

---

## Catatan Backward Compatibility

- COMMAND dan SKILL saat ini **fall through ke `_handleConversation()`** — tidak ada regresi.
  CommandRegistry tetap dipanggil downstream setelah LLM respond (via PR#1 flow).
- Jika `RequestClassifierService` tidak tersedia (gagal boot), fallback ke `'CONVERSATION'`
  → alur lama tetap berjalan tanpa error.
- `_handleConversation()` secara fungsional identik dengan `processMessage()` lama.

---

## Catatan untuk AI Berikutnya

- **Slot SKILL** ada di `RequestClassifierService.classify()` (TODO comment di baris ~80).
  Isi slot ini ketika `SkillRegistry` dan `SkillGuardService` sudah dibuat.
- **COMMAND type** saat ini fall through ke ConversationHandler. Ke depan, jika ada
  use case command yang tidak perlu LLM (command registry langsung), bisa tambahkan
  `_handleCommand()` di sini.
- **Threshold LOOKUP** bisa diperketat jika ada laporan false-positive:
  - Perketat `msgLen` dari 80 → 60
  - Tambah pattern ke `_contextDependentPatterns`
  - Perketat `historyIsShallow` dari ≤4 → ≤2
- **`teknis-skil-implementasi.md`** adalah dokumen berikutnya yang perlu disusun
  sebelum Skill Implementation dimulai. `RequestClassifierService.classify()` di baris
  ~80 adalah titik ekstensinya.
