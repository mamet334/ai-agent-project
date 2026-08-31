# PR#8 — Linux-style Request Dispatch

Status: Draft — Disepakati Untuk Dikerjakan
Owner: Mamet AI Project
Scope: Assistant Capability — Routing & Handler Layer
Prinsip Payung: Linux-Inspired Architecture — "Ringan, Bebas, dan Tangguh seperti Linux"
Tanggal Disusun: 2026-08-31
Prasyarat: PR#3 (AssistantService) — selesai 2026-08-28

---

## 0. Latar Belakang & Masalah

`AssistantService.processMessage()` saat ini menjalankan **alur yang sama persis** untuk
setiap pesan yang masuk — mulai dari memory retrieval, RAG context, CMG validation,
context trimming, hingga fetch ke Edge Function. Tidak peduli apakah pesannya:

- `"apa ibu kota Indonesia?"` (fakta sederhana, 4 kata)
- `"refactor fungsi parseIntent di engineer.js"` (task engineering kompleks)
- `"ingat bahwa aku suka dark mode"` (memory trigger — sudah punya jalur sendiri)

Padahal biaya dan kebutuhan tiap tipe sangat berbeda:

| Tipe Pesan | Memory Retrieval | RAG | Semantic Context | History Depth |
|---|---|---|---|---|
| Faktual/lookup singkat | ❌ tidak perlu | ❌ tidak perlu | ❌ tidak perlu | 2–3 pesan |
| Percakapan kontekstual | ✅ perlu | ✅ perlu | ✅ perlu | 10 pesan |
| Command/aksi | ❌ tidak perlu | ❌ tidak perlu | ❌ tidak perlu | 0 |
| Skill/prosedur | ✅ tergantung skill | tergantung | tergantung | tergantung |

Tanpa layer routing, setiap "apa ibu kota Indonesia?" membebani sistem dengan:
- Query ke `user_memories` (dua tahap)
- Query ke tabel RAG/documents
- CMG validation
- Semantic context building
- Token yang lebih banyak dari yang diperlukan

Prinsip Linux yang relevan: **satu file, satu tanggung jawab** — setiap tipe request
butuh handler yang dirancang khusus, bukan satu fungsi monolitik yang menangani semua.

---

## 0.1 Analogi Linux

Dalam Linux, ketika system call masuk ke kernel:
1. **Dispatcher** menerima system call → identifikasi nomor/tipe → route ke handler
2. Masing-masing **handler** (file I/O, network, memory management) berjalan independen
3. Dispatcher sendiri **tidak melakukan pekerjaan** — hanya routing

PR#8 menerapkan pola yang sama:

```
User message masuk
       ↓
RequestClassifierService (dispatcher)
       ↓ classify()
   ┌───┴─────────────────────┐
   │ type: LOOKUP            │→ LookupHandler     (ringan, cepat, murah)
   │ type: CONVERSATION      │→ ConversationHandler (alur penuh yang sudah ada)
   │ type: COMMAND           │→ CommandRegistry   (sudah ada sejak PR#1)
   │ type: SKILL (masa depan)│→ SkillHandler      (belum ada, untuk Skill Impl.)
   └─────────────────────────┘
```

---

## 1. Komponen yang Akan Dibuat

### 1.1 `RequestClassifierService` (baru)

**File:** `frontend/src/core/runtime/services/RequestClassifierService.js`
**Didaftarkan di:** `Kernel.js` Phase 3, setelah `AssistantService`

**Tanggung jawab tunggal:** Menerima pesan + konteks → mengembalikan tipe request.

**Prinsip penting:**
- Klasifikasi **deterministik** (heuristik/regex, 0 LLM cost, 0 DB call)
- Cepat — harus selesai dalam microseconds sebelum pipeline dimulai
- Bisa salah, dan itu OK — `CONVERSATION` selalu aman sebagai fallback

**Fungsi utama:**

```javascript
classify(userMsg, history = [], resolvedMode = 'STANDARD') {
  // Return: { type, confidence, metadata }
}
```

**Logika klasifikasi (urutan prioritas):**

1. **Jika `resolvedMode === 'ENGINEER'`** → selalu `ENGINEER`
   (mode sudah ditentukan workspace, tidak perlu analisis pesan)

2. **Deteksi COMMAND** — pesan dimulai dengan `/` atau mengandung pola command jelas:
   - `/run`, `/exec`, `/buat`, `/hapus`, `/pindah` dll
   - "jalankan", "eksekusi", "buat folder", "hapus file" (keyword eksplisit aksi filesystem)
   - Output: `{ type: 'COMMAND', confidence: 0.95, metadata: { commandHint } }`

3. **Deteksi LOOKUP** — semua kondisi berikut harus terpenuhi:
   - Panjang pesan ≤ 80 karakter
   - Dimulai dengan kata tanya atau pola faktual: apa, siapa, kapan, dimana, berapa,
     kenapa, how, what, who, when, where, why
   - Tidak ada konteks sambungan dari history (history ≤ 2 pesan ATAU pesan terakhir
     dari assistant bukan pertanyaan/tindakan)
   - Tidak ada referensi ke file/path (indikasi task engineering)
   - Output: `{ type: 'LOOKUP', confidence: 0.8, metadata: { isFactual: true } }`

4. **Default → CONVERSATION**
   - Semua pesan yang tidak masuk kriteria di atas
   - Output: `{ type: 'CONVERSATION', confidence: 1.0, metadata: {} }`

5. **Slot untuk SKILL (masa depan):**
   - Ketika `SkillRegistry` tersedia, classifier akan mencocokkan pesan dengan
     trigger pattern yang terdaftar → `{ type: 'SKILL', metadata: { skillId } }`
   - Belum diimplementasikan di PR#8 ini — slot disiapkan tapi tidak diisi

**EventBus events yang diemit:**
```
RequestClassifier:Classified → { type, confidence, msgLength, timestamp }
```

---

### 1.2 `LookupHandler` (baru, di dalam AssistantService)

**Bukan file terpisah** — method private di `AssistantService.js`:
```javascript
async _handleLookup({ userMsg, history, token, aiProvider, formattedModel, aiKey, onChunk, onDone, onError })
```

**Alur yang DILEWATI dibanding ConversationHandler:**
- ❌ Memory retrieval (`MemoryService.getMemory()`)
- ❌ RAG context (`KnowledgeService`)
- ❌ Semantic context (`SemanticContextService`)
- ❌ CMG validation
- ❌ Context trimming

**Alur yang TETAP ADA:**
- ✅ Resolve AI provider (BrainService)
- ✅ Build payload (minimal: message + history 3 pesan terakhir saja)
- ✅ Fetch ke Edge Function
- ✅ Handle response/stream/error

**Payload minimal yang dikirim:**
```javascript
{
  message: userMsg,
  mode: 'LOOKUP',        // flag baru ke Edge Function
  history: history.slice(-3),   // hanya 3 pesan terakhir
  globalMemory: '',             // sengaja kosong
  semanticContext: '',          // sengaja kosong
  cache_hint: true
}
```

**Keuntungan terukur:**
- Skip 3 query DB (memory, RAG, semantic)
- ~30–50% lebih sedikit token ke Edge Function
- Latensi lebih rendah untuk pertanyaan singkat

---

### 1.3 `ConversationHandler` (refactor, bukan file baru)

Ini adalah **alur yang sudah ada** di `AssistantService.processMessage()` — langkah 4
sampai akhir. Tidak ada perubahan fungsional, hanya diextract menjadi method tersendiri:

```javascript
async _handleConversation({ userMsg, history, resolvedMode, userId, token, ... })
```

Tujuan: `processMessage()` menjadi tipis — hanya panggil classifier, lalu dispatch:

```javascript
async processMessage(params) {
  // 1. Resolve mode
  // 2. Memory trigger check
  // 3. Classify
  const { type } = classifier.classify(userMsg, history, resolvedMode);

  // 4. Dispatch
  if (type === 'LOOKUP') return this._handleLookup(params);
  if (type === 'COMMAND') return this.runCommand(userMsg, ...);
  return this._handleConversation(params); // default
}
```

---

## 2. Integrasi ke Kernel.js

```javascript
// Phase 3 — setelah AssistantService
import { RequestClassifierService } from './services/RequestClassifierService.js';

const requestClassifierService = new RequestClassifierService(serviceManager);
await requestClassifierService.initialize();
serviceManager.register('RequestClassifierService', requestClassifierService);
```

Urutan registrasi Phase 3 yang diperbarui:
```
... (service sebelumnya sama)
→ AssistantService
→ CommandRegistry
→ AuditLogService
→ RetrievalStrategyService
→ ModuleDiscoveryService
→ RequestClassifierService   ← BARU
→ AdapterRegistry (stub)
```

---

## 3. Ketergantungan & Dampak ke Skill Implementation

`RequestClassifierService.classify()` adalah titik ekstensi yang akan digunakan
oleh **Skill Implementation** (fase berikutnya):

```javascript
// Masa depan — setelah SkillGuardService dan SkillRegistry ada:
const skillMatch = this.skillRegistry?.matchTrigger(userMsg);
if (skillMatch) {
  return { type: 'SKILL', confidence: skillMatch.confidence, metadata: { skillId: skillMatch.id } };
}
```

Ini adalah alasan mengapa Skill Implementation **bergantung pada PR#8** — tanpa
dispatcher, skill tidak punya jalur resmi untuk dieksekusi. Skill harus didaftarkan
sebagai tipe request yang dikenali, bukan ditangani secara ad-hoc.

---

## 4. Exit Criteria

- [ ] `RequestClassifierService` terdaftar di `Kernel.js` dan berjalan tanpa error
- [ ] `classify()` mengembalikan `LOOKUP` untuk pesan faktual pendek (contoh: "apa ibu kota Indonesia?")
- [ ] `classify()` mengembalikan `CONVERSATION` untuk pesan panjang/kontekstual
- [ ] `classify()` mengembalikan `ENGINEER` jika resolvedMode === ENGINEER
- [ ] `LookupHandler` tidak memanggil memory/RAG/semantic untuk tipe LOOKUP
- [ ] Log konsol menunjukkan tipe yang diklasifikasi tiap request:
  ```
  [RequestClassifier] "apa ibu kota..." → LOOKUP (confidence: 0.8, len: 24)
  [RequestClassifier] "tolong refactor..." → CONVERSATION (confidence: 1.0, len: 45)
  ```
- [ ] `processMessage()` menjadi tipis — hanya dispatch, tidak ada logic berat
- [ ] Tidak ada regresi pada alur percakapan normal (ConversationHandler = perilaku lama)
- [ ] Slot SKILL disiapkan di `classify()` tapi tidak diisi (comment + TODO)
- [ ] Build Vercel lulus tanpa error baru

---

## 5. Yang TIDAK Dikerjakan di PR#8 Ini

- ❌ `SkillHandler` — menunggu Skill Implementation (`teknis-skil-implementasi.md`)
- ❌ `SkillRegistry` — sama
- ❌ Klasifikasi berbasis LLM (jika heuristik tidak cukup akurat, pertimbangkan
  di fase berikutnya berdasarkan data nyata — bukan asumsi di muka)
- ❌ Perubahan pada Edge Function (`agent-process`) — hanya flag `mode: 'LOOKUP'`
  dikirim, handler di Edge Function bisa mengabaikan ini untuk sekarang

---

## 6. Prinsip Anti Over-Engineering

Sesuai pola yang ada di dokumen ini sejak PR#1:
- Mulai dari heuristik deterministik sederhana — bukan ML classifier
- Jika klasifikasi sering salah (LOOKUP padahal butuh memory) → perketat threshold,
  bukan tambah kompleksitas dari awal
- Slot SKILL disiapkan tapi tidak diisi sampai Skill Implementation benar-benar dimulai
- `ConversationHandler` adalah alur yang sudah ada — tidak ada fitur baru di sana

---

## 7. Dokumen yang Perlu Dibuat Setelah PR#8

Sebelum Skill Implementation dimulai, dokumen `teknis-skil-implementasi.md` perlu
disusun terlebih dahulu — merujuk ke `RequestClassifierService.classify()` sebagai
titik integrasinya. Dokumen tersebut harus mencakup:
- `SkillGuardService` — validasi keamanan skill sebelum aktif
- `SkillRegistry` — registrasi dan matching trigger pattern
- `SkillHandler` — eksekusi skill yang sudah tervalidasi
- Kaitan dengan `Section 3.2` dari INDEX-ROADMAP (Skill matching bergantung pada
  RequestClassifierService dari PR#8)
