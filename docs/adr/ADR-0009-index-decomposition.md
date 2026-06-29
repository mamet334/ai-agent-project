# ADR-0009: index.ts Decomposition Plan

**ID:** ADR-0009
**Judul:** Pemecahan Monolith `index.ts` — Roadmap Extraction Bertahap
**Status:** APPROVED
**Tanggal:** 2026-06-29
**Penulis:** Mamet Engineering (Constitution Review Wave 2)
**Menutup Gap:** GAP-NEW-003
**Berlaku untuk:** `supabase/functions/agent-process/`

---

## 1. Konteks dan Latar Belakang

### 1.1 Kondisi Saat Ini

`supabase/functions/agent-process/index.ts` adalah file monolith berukuran **2301 baris / 122 KB** yang menjadi satu-satunya entry point dari seluruh sistem Agent Process Mamet AI.

File ini melanggar:
- **MAEF v2 §4.4 (Architecture First):** Arsitektur yang dapat dipelihara mensyaratkan modul yang memiliki tanggung jawab tunggal
- **MAEF v2 §4.5 (Deterministic Engineering):** File 2301 baris tidak bisa diverifikasi secara incremental
- **MAEF v2 §4.6 (Evolution Without Chaos):** Setiap perubahan di file ini berisiko tinggi karena scope perubahan tidak bisa diisolasi

### 1.2 Kenapa Ini Menjadi Critical Gap

Monolith ini menyulitkan:
1. **Audit:** Sulit menemukan di mana suatu logika berada
2. **Testing:** Tidak bisa test satu aspek tanpa menjalankan seluruh pipeline
3. **Review:** Code review mencakup ribuan baris tidak terkait
4. **Evolusi:** Menambah feature baru berisiko menyentuh bagian lain yang tidak related

---

## 2. Peta Tanggung Jawab `index.ts`

Hasil audit menyeluruh terhadap `index.ts` (2301 baris):

### 2.1 Kelompok A — Infrastruktur & Konfigurasi

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **API Key Management** | L38–L61 | Round-robin key rotation, `getActiveKey`, `getAllKeys` untuk semua provider |
| **CORS Configuration** | L33–L36 | `corsHeaders` — dipakai di hampir semua response |
| **Circuit Breaker** | L400–L450 | Daily cost limit $0.50, `isProviderLocked`, `lockProvider` |
| **Provider Locking State** | Global vars | `geminiKeyIndex`, `groqKeyIndex`, `openaiKeyIndex`, `openrouterKeyIndex` |
| **Env Var Loading** | L200–L300 | GEMINI_API_KEY, GROQ_API_KEY, dll — tersebar di awal handler |

### 2.2 Kelompok B — LLM Provider Calls

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **Gemini Embedding** | L16–L31 | `getGeminiEmbedding` — untuk RAG vector search |
| **Gemini Retry** | L63–L100 | `callGeminiWithRetry` — multi-key rotation + backoff |
| **callGemini (non-stream)** | L600–L680 | Non-streaming Gemini call |
| **callGroq** | L680–L730 | Non-streaming Groq call |
| **callOpenRouter** | L730–L780 | Non-streaming OpenRouter call |
| **callOpenAI** | L780–L800 | Non-streaming OpenAI call |
| **callLLMWithCascade** | L760–L803 | Cascade: Gemini → OpenRouter → Groq dengan circuit breaker |
| **runLLM** | L808–L828 | Main LLM caller — menggunakan explicit model atau cascade |
| **runCoordinatorLLM** | L831–L842 | LLM hemat untuk intent router / coordinator |

### 2.3 Kelompok C — Streaming

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **getStreamResponse** | L850–L1142 | Seluruh streaming logic: SSE init, Gemini stream, OpenRouter stream, Groq stream, OpenAI stream, streaming cascade, Audit Injector di `closeSafely` |
| **processGeminiStream** | L906–L934 | Stream parser untuk Gemini (handle `thought` tags) |
| **processOpenAIStream** | L884–L904 | Stream parser untuk OpenAI-compatible format |
| **tryGemini / tryGroq / tryOpenRouter / tryOpenAI** | L960–L1031 | Stream-specific provider tries |

### 2.4 Kelompok D — Auth & Execution Context

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **Auth Binding Layer** | L350–L420 | JWT verification, `buildUnifiedExecutionContext` — server-authoritative userId, appSource, mode |
| **Execution Context (ctx)** | L420–L500 | `ctx` object: `auth`, `policy`, `request`, `state` |
| **Policy Resolution** | L500–L560 | `canReadMemory`, `canWriteMemory`, `canUseWebSearch`, dll — dari `appSource` |
| **Risk Scoring** | L440–L480 | `riskScore` dari request keywords |
| **WorkspaceGuardian** | L560–L580 | `storageTarget`, `guardianPromptDirective`, `desktopOSMode` |

### 2.5 Kelompok E — RAG Pipeline

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **RAG Embedding** | L1146–L1149 | Get embedding dari Gemini |
| **Routing Decider** | L1155–L1185 | Deteksi CORE vs WORKSPACE scope |
| **RAG Hard Isolation** | L1187–L1203 | Guard: no global fallback jika `workspace_id` null |
| **RAG match_documents RPC** | L1197–L1203 | Supabase RPC call |
| **Post-RAG Deduplication** | L1210–L1242 | Cosine similarity-based deduplication |
| **Context Re-ranking** | L1244–L1262 | Hybrid score = 0.7 vector + 0.2 position + 0.1 query coverage |

### 2.6 Kelompok F — Memory

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **Memory Retrieval** | L1372–L1376 | `retrieveMemories()` — conditional on `canReadMemory` |
| **Global Memory Prompt** | L1378 | Inject global preferences |
| **Memory Write Queue** | L2238–L2242 | Background async memory save |

### 2.7 Kelompok G — Engineer Context (Two-Brain)

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **Brain 1 Load** | L1409–L1432 | Static: project_memory_entries (ACTIVE/APPROVED/VERIFIED) |
| **Brain 2 Load** | L1438–L1446 | Dynamic: engineering_tasks, architecture_gaps, verification_runs |
| **Deprecated ADR Lazy Load** | L1449–L1457 | Hanya jika triggered oleh keywords "deprecated/konflik/history" |
| **Engineer Context Prompt Build** | L1459–L1544 | Membangun `engineerContextPrompt` dengan RULE 1–4 |

### 2.8 Kelompok H — Evidence & Confidence Pipeline

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **Evidence Validator** | L1575–L1598 | `validateEvidence()` — hitung brain/rag/memory counts |
| **Evidence Audit Log** | L1601–L1628 | Background save ke `evidence_audit_logs` |
| **Evidence Hard Block** | L1630–L1653 | Stop pipeline jika `isValid = false` |
| **Confidence Engine** | L1660–L1694 | `calculateConfidence()` — deterministic scoring |
| **Active Conflicts Query** | L1666–L1680 | Cek `knowledge_conflicts` table |
| **Universal Evidence Contract** | L1704–L1773 | `buildUniversalContract()` + render ke `fullSystemContext` |

### 2.9 Kelompok I — Intent Router & Orchestrator

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **Desktop Local Detection** | L1795–L1800 | Hardcoded keyword check untuk desktop commands |
| **Intent Router (LLM)** | L1821–L1847 | LLM call untuk classify CHAT_BIASA vs BUTUH_AGENT |
| **Execution Contract Validation** | L2027–L2047 | Schema validation untuk sub-agent plan |
| **Dependency-Aware Execution Graph** | L2052–L2082 | Grouping independent vs dependent plugins ke tiers |
| **Orchestration Budget Enforcer** | L2085–L2230 | Timeout 24s global, 12s per plugin, `Promise.race` |
| **Sub-agent Execution Loop** | L2100–L2210 | Iterasi per tier, per plugin, dengan abort controller |
| **Synthesis Prompt** | L2232–L2248 | Final prompt setelah semua sub-agent selesai |

### 2.10 Kelompok J — Background Tasks & Utilities

| Nama Logis | Baris Kira-kira | Deskripsi |
|---|---|---|
| **pendingBackgroundTasks** | Global array | Fire-and-forget task tracker |
| **safeFireAndTrack** | Helper function | Push async task ke `pendingBackgroundTasks` |
| **Verification Engine call** | L1903–L1955 | `VerificationEngine.verify()`, audit record, hard gate |
| **Source Trace Extractor** | L1864–L1899 | Regex-based extractor dari LLM response |
| **ZIP keyword injection** | L1277–L1289 | Inject instruction ke finalMessage jika ada kata "zip" |

---

## 3. Modul Target yang Diusulkan

Berdasarkan kelompok di atas, berikut modul-modul baru yang diusulkan:

| Modul Baru | File Target | Kelompok |
|---|---|---|
| `lib/provider_manager.ts` | Baru | A (key rotation, circuit breaker, provider locking) |
| `lib/llm_caller.ts` | Baru | B (semua non-streaming LLM calls + cascade) |
| `lib/stream_handler.ts` | Baru | C (seluruh streaming logic) |
| `lib/auth_context.ts` | Baru | D (auth binding, ctx building, policy resolution, WorkspaceGuardian) |
| `lib/rag_retriever.ts` | Baru | E (embedding, routing decider, match_documents, dedup, reranking) |
| `lib/memory_handler.ts` | Baru | F (retrieval, write queue coordination) |
| `lib/engineer_brain.ts` | Baru | G (Brain 1 + Brain 2 load, engineer context prompt) |
| `lib/evidence_pipeline.ts` | Baru | H (evidence validator, confidence engine, universal contract) |
| `lib/orchestrator.ts` | Baru | I (intent router, execution graph, budget enforcer, sub-agent loop) |
| `lib/response_handler.ts` | Baru | J (verification, source trace extractor, background tasks) |

---

## 4. Urutan Extraction yang Paling Aman

Prinsip:
- Extract modul yang paling **stateless** dan **tidak memiliki dependency ke bagian lain** terlebih dahulu
- Setiap extraction harus menghasilkan **zero behavioral change**
- Gunakan pattern: **extract → import → verify → next**

### Fase 1 — Stateless Utilities (Risiko Sangat Rendah)

```
Ekstrak: lib/provider_manager.ts
Isi: getActiveKey, getAllKeys, callGeminiWithRetry, CORS headers, circuit breaker
Kenapa duluan: Tidak ada dependency ke business logic. Pure utility.
```

### Fase 2 — LLM Callers (Risiko Rendah)

```
Ekstrak: lib/llm_caller.ts
Isi: callGemini, callGroq, callOpenRouter, callOpenAI, callLLMWithCascade, runLLM, runCoordinatorLLM
Dependency: provider_manager.ts (dari Fase 1)
Kenapa aman: Fungsi ini well-isolated, tidak ada side effect ke state lain
```

### Fase 3 — Streaming (Risiko Sedang)

```
Ekstrak: lib/stream_handler.ts
Isi: getStreamResponse, processGeminiStream, processOpenAIStream, tryGemini/Groq/OR/OAI
Dependency: llm_caller.ts, provider_manager.ts
Kenapa sedang: SSE streaming adalah bagian paling sensitif dari UX
Mitigasi: Tes streaming end-to-end setelah extraction
```

### Fase 4 — Auth & Context (Risiko Sedang)

```
Ekstrak: lib/auth_context.ts
Isi: JWT verification, ctx object construction, policy resolution, risk scoring, WorkspaceGuardian
Dependency: PolicyEngine (sudah ada di lib/policy_engine.ts)
Kenapa sedang: Auth adalah security boundary — extraction harus hati-hati
Mitigasi: Verifikasi bahwa appSource masih dari JWT, bukan payload
```

### Fase 5 — RAG Pipeline (Risiko Rendah)

```
Ekstrak: lib/rag_retriever.ts
Isi: getGeminiEmbedding, routing decider, match_documents RPC, dedup, reranking
Dependency: Supabase client, provider_manager (untuk embedding)
Kenapa aman: RAG sudah modular secara logis, hanya perlu dipindah
```

### Fase 6 — Engineer Brain (Risiko Rendah)

```
Ekstrak: lib/engineer_brain.ts
Isi: Brain 1 load, Brain 2 load, deprecated ADR lazy load, engineer context prompt builder
Dependency: Supabase client
Kenapa aman: ENGINEER mode memiliki conditional jelas, mudah diisolasi
```

### Fase 7 — Evidence Pipeline (Risiko Tinggi — Lakukan di akhir)

```
Ekstrak: lib/evidence_pipeline.ts
Isi: evidence validator call, confidence engine, universal contract, evidence audit log
Dependency: validateEvidence, calculateConfidence, buildUniversalContract (sudah ada di lib/)
Kenapa tinggi: Pipeline ini adalah hard gate — bug di sini = semua request gagal
Mitigasi: Buat test sebelum extraction
```

### Fase 8 — Orchestrator (Risiko Tinggi)

```
Ekstrak: lib/orchestrator.ts
Isi: intent router, execution graph, budget enforcer, sub-agent loop, synthesis prompt
Dependency: llm_caller, plugins/registry
Kenapa tinggi: Orchestrator adalah business logic terbesar — bug = sub-agent tidak jalan
Mitigasi: Integration test dengan mock plugins
```

---

## 5. `index.ts` Setelah Decomposition

Setelah seluruh fase selesai, `index.ts` seharusnya menjadi **thin coordinator** ~200 baris:

```typescript
// index.ts (target state — setelah decomposition)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildAuthContext }    from './lib/auth_context.ts';
import { retrieveRAG }         from './lib/rag_retriever.ts';
import { loadEngineerBrain }   from './lib/engineer_brain.ts';
import { runEvidencePipeline } from './lib/evidence_pipeline.ts';
import { runOrchestrator }     from './lib/orchestrator.ts';
import { getStreamResponse }   from './lib/stream_handler.ts';
import { callLLM }             from './lib/llm_caller.ts';

serve(async (req) => {
  const ctx = await buildAuthContext(req);
  const ragResults = await retrieveRAG(ctx);
  const engineerBrain = await loadEngineerBrain(ctx);
  const { fullSystemContext, blocked } = await runEvidencePipeline(ctx, ragResults, engineerBrain);
  if (blocked) return blockedResponse(ctx);
  
  if (ctx.request.stream) return getStreamResponse(ctx, fullSystemContext);
  return await runOrchestrator(ctx, fullSystemContext);
});
```

---

## 6. Aturan Backward Compatibility

Setiap extraction HARUS memenuhi:

1. **API contract tidak berubah:** Fungsi yang diekstrak harus menerima input yang sama dan mengembalikan output yang sama
2. **Environment variables tidak berubah:** Cara membaca `Deno.env.get(...)` harus identik
3. **Tidak ada breaking imports:** Semua import yang digunakan modul lain harus tetap bisa diakses
4. **Error behavior identik:** Jika fungsi aslinya throw error, versi baru harus throw error yang sama
5. **No new dependencies:** Tidak ada library baru yang ditambahkan selama decomposition

---

## 7. Kriteria Verifikasi per Fase

Sebelum pindah ke fase berikutnya, verifikasi:

| Check | Metode |
|---|---|
| TypeScript type check pass | `tsc --noEmit` (atau equivalent Deno check) |
| Build sukses | `supabase functions deploy agent-process` (atau dry-run) |
| No regression pada streaming | Manual test: kirim request, pastikan SSE menerima chunks |
| No regression pada auth | Test dengan JWT valid dan invalid |
| No regression pada ENGINEER mode | Test dengan appSource=engineer, pastikan Brain 1+2 termuat |
| Evidence Gate masih aktif | Test dengan ENGINEER mode tanpa evidence, pastikan diblok |

---

## 8. Yang Tidak Termasuk dalam Scope Decomposition Ini

| Item | Alasan Dikeluarkan |
|---|---|
| Perubahan logika bisnis | ADR ini hanya tentang struktur file, bukan logika |
| Penambahan feature baru | Scope MAEF §4.6: Evolution Without Chaos |
| Perubahan format LLM response | Di luar scope |
| Perubahan provider priority | Di luar scope |
| Database schema changes | Di luar scope Wave 5 |

---

## 9. Timeline

| Fase | Estimasi | Wave |
|---|---|---|
| ADR ini (planning) | Selesai | Wave 2 |
| Fase 1–2 (provider_manager, llm_caller) | 1 sesi | Wave 5 |
| Fase 3–4 (stream, auth_context) | 1 sesi | Wave 5 |
| Fase 5–6 (rag, engineer_brain) | 1 sesi | Wave 5 |
| Fase 7–8 (evidence_pipeline, orchestrator) | 1–2 sesi | Wave 5 |

---

## 10. Referensi

- `supabase/functions/agent-process/index.ts` (2301 baris)
- GAP-NEW-003 — `docs/architecture/ARCHITECTURE-GAPS.md`
- TASK-NEW-007 — Constitution Review Implementation Plan
- MAEF v2 §4.4 (Architecture First)
- MAEF v2 §4.5 (Deterministic Engineering)
- MAEF v2 §4.6 (Evolution Without Chaos)
