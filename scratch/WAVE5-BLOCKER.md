# Wave 5 Blocker Report

**Tanggal:** 2026-06-29
**Wave:** 5 — Index.ts Decomposition
**Status:** BLOCKED
**Berdasarkan:** ADR-0009

---

## Deskripsi Blocker

Wave 5 tidak dapat dimulai tanpa resolusi arsitektur.

ADR-0009 mengidentifikasi 8 kelompok logis untuk diekstrak ke modul terpisah.
Namun audit mendalam pada `index.ts` menemukan bahwa **seluruh business logic functions
adalah closures bersarang** di dalam `serve(async (req) => { ... })`.

## Teknis

Semua fungsi berikut menangkap variabel lokal dari `serve()` handler scope:

| Fungsi | Variabel yang Di-capture |
|---|---|
| `callGroq` | `GROQ_API_KEY`, `model`, `stream`, `logApiUsage` |
| `callOpenRouter` | `OPENROUTER_API_KEY`, `model`, `stream`, `logApiUsage` |
| `callOpenAI` | `OPENAI_API_KEY`, `model`, `stream`, `logApiUsage` |
| `callLLMWithCascade` | `allGeminiKeys`, `OPENROUTER_API_KEY`, `logAgentEvent`, `explicitModelErrors` |
| `runLLM` | `ctx`, `model`, `extractedImage`, semua callers di atas |
| `getStreamResponse` | `ctx`, `corsHeaders`, `logApiUsage`, semua providers |
| `buildUnifiedExecutionContext` | `POLICY_LAYER_ENABLED` (closure scope) |

Ekstraksi ke modul terpisah tanpa mengubah function signature = tidak mungkin.

## Opsi Resolusi

### Opsi A — Refaktor Signature (Direkomendasikan)

Ekstraksi dengan dependencies di-inject eksplisit sebagai parameter:

```typescript
// lib/llm_caller.ts
export async function callGroq(
  promptText: string,
  systemPromptText: string,
  chatHistory: any[],
  config: { groqApiKey: string; model: string; isStream: boolean },
  deps: { logApiUsage: (provider: string, model: string, input: string, output: string) => void }
): Promise<string> { ... }
```

**Risiko:** Refaktor besar — perlu test end-to-end setelah setiap ekstraksi.
**Keuntungan:** Modul menjadi testable secara independen.

### Opsi B — Config Object Pattern

Buat `RequestContext` type yang dikonstruksi di `index.ts` dan di-pass ke semua fungsi:

```typescript
// lib/types.ts
interface RequestContext {
  geminiApiKey: string;
  groqApiKey: string;
  openRouterApiKey: string;
  model: string;
  isStream: boolean;
  logApiUsage: Function;
  logAgentEvent: Function;
  ctx: MametExecutionContext;
}
```

**Risiko:** Lebih sederhana dari Opsi A, tapi masih membutuhkan test.

### Opsi C — Defer Wave 5

Tunda Wave 5 sampai ada test harness (Deno test runner / mock server).

**Risiko:** Monolith tetap monolith.
**Keuntungan:** Zero risk saat ini.

## Rekomendasi

Lanjutkan Wave 5 dengan **Opsi A** hanya setelah:
1. Ada mekanisme test minimal (smoke test yang bisa dijalankan via Deno)
2. Owner menyetujui bahwa perubahan signature dianggap "structural" bukan "behavioral"
3. Setiap fase ekstraksi diverifikasi dengan deployment ke Supabase staging

## Keputusan Owner Diperlukan

Pilih satu opsi di atas sebelum Wave 5 dapat dilanjutkan.
