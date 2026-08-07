# 📋 Fix Log — Mamet OS Ecosystem

**Format:** `[TANGGAL] [FILE] — Deskripsi`

---

## 2026-08-07 — Fix: Settings API Key Tidak Terkirim ke OpenRouter

**Symptom:**
Halaman Settings → "Test Connection" selalu gagal dengan error:
```
Provider 'OpenRouterAdapter' failed: OpenRouter API Error: 401
{"error":{"message":"User not found","code":401}}
```
Padahal API key valid dan punya saldo.

**Root Cause:**
Di `Settings.jsx` → `handleTestConnection()`, API key dikirim di **body request** sebagai field `apiKey`:
```js
body: JSON.stringify({ ..., apiKey: aiKey })  // ❌ SALAH
```
Tapi `request_pipeline.ts` di Supabase Edge Function membacanya dari **HTTP header** `x-byok-{provider}`:
```ts
const byokProviderKey = request.headers.get(`x-byok-${provider}`);  // ← Baca dari header
```
Karena header tidak ada, pipeline fallback ke `OPENROUTER_API_KEY` environment variable milik sistem → OpenRouter merespons "User not found" (bukan punya user).

**Fix:**
`Settings.jsx` → `handleTestConnection()`: Pindahkan API key dari body ke header yang benar.
```js
// BEFORE (buggy):
body: JSON.stringify({ apiKey: aiKey })

// AFTER (fixed):
headers: { [`x-byok-${aiProvider}`]: aiKey }
```

**File:** `frontend/src/components/Settings.jsx`
**Lines:** 59–95 (handleTestConnection)
**Status:** ✅ Fixed

---

## Catatan Konsistensi BYOK Header

Setelah fix ini, semua komponen sudah konsisten mengirim API key di header:

| Komponen | Status |
|---|---|
| `Settings.jsx` → Test Connection | ✅ Fixed (2026-08-07) |
| `ConversationEngine.jsx` → Chat biasa | ✅ Sudah benar (header) |
| `BrainService.js` → Engineer LLM | ✅ Sudah benar (header) |
| `request_pipeline.ts` → Edge Function reader | ✅ Membaca dari header |

---

## 2026-08-07 — Fix: "Verification Failed" pada Engineer Chat Biasa

**Symptom:**
Setelah Engineer mode diubah agar bisa ngobrol natural (tidak langsung trigger patch pipeline),
setiap respons LLM di Engineer mode selalu gagal dengan:
```json
{
  "message": "Verification Failed",
  "profile": "PATCH_ENGINEERING",
  "CHECK_PR2_VALID_JSON_PATCH_FORMAT": "CRITICAL — Invalid JSON patch: No JSON object found."
}
```

**Root Cause:**
`synthesis_handler.ts` selalu menggunakan profile `PATCH_ENGINEERING` untuk semua mode ENGINEER.
Profile ini mengharuskan respons berisi JSON patch object yang valid.
Tapi respons chat natural (mis. "Halo, ada yang bisa saya bantu?") tidak mengandung JSON,
sehingga selalu gagal di `CHECK_PR2_VALID_JSON_PATCH_FORMAT`.

**Fix:**
`synthesis_handler.ts` baris 88–95: Routing verifikasi menjadi adaptif berdasarkan konten respons.
- Respons **tanpa JSON** (`{` + `}` tidak ada) → profile `PERSONAL` (ringan)
- Respons **dengan JSON patch** → profile `PATCH_ENGINEERING` (ketat)

```ts
// BEFORE: selalu PATCH_ENGINEERING untuk mode ENGINEER
const vReport = VerificationEngine.verify(requestMode, vContext);

// AFTER: adaptif berdasarkan konten respons
const isJsonPatchResponse = requestMode === 'ENGINEER' &&
  responseText.includes('{') && responseText.includes('}');
const effectiveMode = (requestMode === 'ENGINEER' && !isJsonPatchResponse)
  ? 'LITE'  // pakai PERSONAL profile
  : requestMode;
const vReport = VerificationEngine.verify(effectiveMode, vContext);
```

**File:** `supabase/functions/agent-process/lib/orchestration/handlers/synthesis_handler.ts`
**Status:** ✅ Fixed

