# Changelog — 2026-07-30: Security Fix — OpenRouter Saldo Defisit

## Ringkasan Eksekutif
Setelah pembaruan `engineer.js` (Reasoning Lock + Session Artifact), Engineer Pipeline mulai secara otomatis memanggil LLM sungguhan saat task `GeneratePatch` diterima. Karena tidak ada guard yang memverifikasi keberadaan API key pengguna, sistem jatuh ke fallback yang menggunakan API key OpenRouter dari environment variable server, mengakibatkan saldo owner menjadi defisit.

---

## Root Cause (3 Titik)

### 1. BrainService.js — Default Provider Hardcoded ke OpenRouter
```js
// SEBELUM (berbahaya):
this.state = { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' };
// SESUDAH (aman):
this.state = { provider: 'gemini', model: 'gemini-2.0-flash' };
```
Provider default diubah ke Gemini yang memiliki free tier dan tidak akan menghabiskan saldo secara tiba-tiba.

### 2. BrainService.executeLLM() — Tidak Ada Guard API Key
Tanpa API key dari VaultService (Settings), `executeLLM()` melanjutkan eksekusi ke Supabase fallback yang mengambil API key dari environment variable server.

**Perbaikan:** Guard ditambahkan — jika `apiKey` kosong, langsung `throw new Error()` dengan pesan informatif. Request tidak diteruskan ke Supabase.

### 3. request_pipeline.ts — Tidak Ada Guard ENGINEER Mode
Backend menerima request ENGINEER mode tanpa BYOK header dan menggunakan `OPENROUTER_API_KEY` dari environment sebagai fallback.

**Perbaikan:** Guard ditambahkan — jika `mode=ENGINEER` atau `appSource=engineer` tanpa BYOK header apapun, backend mengembalikan HTTP 403 dengan error `ENGINEER_NO_API_KEY`.

### 4. Kernel.js — BrainService Diinisialisasi SETELAH Engineer
Engineer diinisialisasi di baris 202, sedangkan BrainService baru di baris 207. Akibatnya ketika Engineer mencoba `serviceManager.get('BrainService')` pada saat boot, hasilnya `null`, menyebabkan `modelName` menjadi `'unknown'` dan konteks tidak terbaca dengan benar.

**Perbaikan:** Urutan inisialisasi diperbaiki — BrainService sekarang didaftarkan **sebelum** Engineer.

### 5. Kernel.js — verifyPatchEngineering Auto-PASS (Sebelumnya)
Mock `verifyPatchEngineering` sebelumnya selalu mengembalikan `{ decision: 'PASS' }` tanpa cek apapun, memungkinkan patch berbahaya (mengandung `eval()`, `new Function()`, atau pemanggilan vendor API langsung) lolos tanpa verifikasi.

**Perbaikan:** Verifikasi nyata ditambahkan — memeriksa konten patch terhadap pola berbahaya sebelum memberikan verdict.

---

## File yang Diubah
| File | Perubahan |
|---|---|
| `frontend/src/core/runtime/services/BrainService.js` | Guard API key, ganti default provider ke Gemini |
| `frontend/src/core/runtime/Kernel.js` | Perbaiki urutan init, upgrade verifyPatchEngineering |
| `supabase/functions/agent-process/lib/request/request_pipeline.ts` | Guard ENGINEER mode tanpa BYOK |

---

## Hasil Verifikasi
Seluruh test suite tetap 100% lulus setelah perbaikan:
- **Phase 1 & 2 — Engineer Pipeline**: LULUS (21/21)
- **Phase 3 — Reasoning Lock**: LULUS (10/10)
- **Phase 4 — Session Artifact**: LULUS (23/23)
- **Total**: 54/54 LULUS, 0 GAGAL
