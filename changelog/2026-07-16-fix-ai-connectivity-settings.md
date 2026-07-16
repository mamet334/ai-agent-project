# CHANGELOG: Fix AI Connectivity — Settings Dashboard

**Tanggal:** 2026-07-16  
**Versi:** 4.2.0  
**Tipe:** Bugfix — Critical  
**Author:** Mamet Engineering (AI Engineering Partner)  
**Status:** ✅ Selesai — 4 file dimodifikasi, root cause dieliminasi

---

## Ringkasan Eksekutif

User melaporkan AI tidak dapat terhubung meskipun provider OpenRouter sudah dipilih,
model `openai/gpt-4o-mini` sudah diisi, dan API key valid dengan saldo aktif.

Investigasi menemukan **3 bug kritis yang saling terkait** — mulai dari frontend yang
tidak pernah benar-benar mengirim pesan ke backend, hingga BrainService yang membuang
informasi model, dan backend yang tidak memiliki endpoint untuk menerima API key dari UI.

---

## Root Cause Analysis

### Bug #1 — `AIAgent.jsx`: Pesan tidak pernah dikirim ke backend (Severity: CRITICAL)

`handleSendMessage` menggunakan `setTimeout` simulasi — tidak ada `fetch` ke backend.
Tidak peduli provider atau model apa yang dipilih, chat hanya menghasilkan pesan palsu.

```js
// SEBELUM — hanya simulasi, tidak terhubung ke manapun
setTimeout(() => {
  setMessages(prev => [...prev, {
    content: 'Mamet sedang dalam mode pengujian Refactoring UI.'
  }]);
  setLoading(false);
}, 1500);
```

### Bug #2 — `BrainService.js`: Model tidak disimpan (Severity: HIGH)

`setBrain(provider, model)` menerima parameter `model` tetapi **tidak menyimpannya**.
Komentar di kode bahkan secara eksplisit: `model: null`.
Akibatnya, model yang dipilih user di Settings hilang tanpa jejak.

```js
// SEBELUM — model selalu null
async getActiveBrainContext() {
  return {
    provider: this.state.provider,
    model: null, // <-- Kita kosongkan model di sini...
    key: key
  };
}
```

### Bug #3 — `backend/server.js`: Tidak ada endpoint untuk API key dari UI (Severity: HIGH)

Endpoint `/api/agent/process` membaca key **hanya dari `.env` file**.
API key yang dimasukkan user di Settings UI (disimpan ke VaultService/localStorage)
tidak pernah dibaca oleh backend — sehingga selalu dianggap key tidak ada.

```js
// SEBELUM — key selalu dari ENV, bukan dari UI
if (!process.env.OPENROUTER_API_KEY) {
  return res.status(400).json({ error: 'OPENROUTER_API_KEY belum dikonfigurasi di backend/.env' });
}
```

---

## Perubahan File

### 1. `frontend/src/core/runtime/services/BrainService.js`

**Masalah:** `state` tidak menyimpan `model`, `setBrain()` membuang parameter model, `getActiveBrainContext()` mengembalikan `model: null`.

**Perbaikan:**
- Tambah `model: 'anthropic/claude-3.5-sonnet'` ke initial state
- `initialize()` sekarang load `maef_ai_model` dari localStorage
- `setBrain(provider, model)` menyimpan model ke state & `localStorage`
- `getActiveBrainContext()` mengembalikan model yang sesungguhnya

```diff
- state = { provider: 'openrouter' }
+ state = { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' }

- setBrain(provider, model) { /* model diabaikan */ }
+ setBrain(provider, model) {
+   if (model) this.state.model = model;
+   if (model) localStorage.setItem('maef_ai_model', model);
+ }

- return { provider, model: null, key }
+ return { provider, model: this.state.model, key }
```

---

### 2. `backend/server.js`

**Masalah:** Tidak ada endpoint yang menerima `provider`, `model`, `apiKey` dari frontend.

**Perbaikan:** Menambah endpoint baru `/api/chat` yang:
- Menerima `{ message, provider, model, apiKey, history, userId, userName, globalMemory }` dari request body
- Menggunakan `apiKey` dari body (dari VaultService UI), dengan fallback ke ENV jika kosong
- Mendukung semua provider: **OpenRouter**, **OpenAI**, **Groq**, **Anthropic**, **Gemini**
- Header OpenRouter yang lengkap: `HTTP-Referer` + `X-Title` (required by OpenRouter)
- Error message yang informatif jika key tidak ada

```
POST /api/chat
Body: { message, provider, model, apiKey, history }
→ Mengirim ke provider AI yang sesuai menggunakan apiKey dari UI
```

---

### 3. `frontend/src/components/AIAgent/AIAgent.jsx`

**Masalah:** `handleSendMessage` hanya `setTimeout` simulasi, tidak memanggil backend.

**Perbaikan:**
- Import `kernel` dari `core/runtime/Kernel`
- `handleSendMessage` sekarang memanggil `kernel.serviceManager.get('BrainService')` dan `VaultService` untuk mendapatkan `provider`, `model`, `apiKey`
- Memanggil `fetch('/api/chat', ...)` dengan konfigurasi AI yang benar
- Menyimpan pesan user & respons agent ke `conversations` state (bukan `setMessages` yang tidak ada)
- Error handling: jika gagal, tampilkan pesan error yang informatif di dalam chat

```diff
- // Simulasi balasan AI
- setTimeout(() => {
-   setMessages(prev => [...prev, { content: 'Mamet mode pengujian...' }]);
- }, 1500);
+ // Panggil backend nyata
+ const brainService = kernel.serviceManager?.get('BrainService');
+ const vaultService = kernel.serviceManager?.get('VaultService');
+ const { provider, model } = brainService.getBrainConfig();
+ const apiKey = vaultService.getKey(provider);
+ const response = await fetch(`${API_URL}/api/chat`, { ... });
```

---

### 4. `frontend/src/components/Settings.jsx`

**Masalah:** Tidak ada cara untuk user memverifikasi apakah konfigurasi AI berhasil sebelum mulai chat.

**Perbaikan:** Menambah tombol **Test Connection**:
- Memanggil `/api/chat` dengan pesan pendek setelah user mengisi key & model
- Feedback visual: `Menghubungkan...` → `✓ Koneksi Berhasil!` / `Koneksi Gagal`
- Jika gagal, tampilkan pesan error lengkap dari API
- Tombol disabled jika API key kosong

---

## Alur Koneksi AI (Setelah Fix)

```
Settings UI
  → Pilih Provider + Isi Model ID + Isi API Key → Klik Save
  → BrainService.setBrain(provider, model) ← simpan ke localStorage
  → VaultService.setKey(provider, apiKey) ← simpan ke localStorage

AIAgent Chat
  → User kirim pesan
  → handleSendMessage()
  → kernel.BrainService.getBrainConfig() → { provider, model }
  → kernel.VaultService.getKey(provider) → apiKey
  → fetch('http://localhost:3000/api/chat', { provider, model, apiKey, message })

Backend /api/chat
  → Terima { provider, model, apiKey }
  → resolvedKey = apiKey || process.env[PROVIDER_KEY]
  → Kirim ke OpenRouter/OpenAI/Groq/Anthropic/Gemini
  → Return { message: replyText }

AIAgent Chat
  → Tampilkan respons AI
```

---

## Panduan Penggunaan (Setelah Fix)

Urutan penggunaan yang benar:

1. Buka **Settings** 
2. Pilih **Provider** (contoh: `OpenRouter`)
3. Isi **Model ID** (contoh: `openai/gpt-4o-mini`)
4. Isi **API Key** (paste key dari dashboard provider)
5. Klik **Save** (ikon 💾)
6. Klik **Test Connection** — tunggu hingga muncul ✓ Koneksi Berhasil!
7. Buka chat dan mulai percakapan

---

## File yang Diubah

| File | Tipe Perubahan |
|------|---------------|
| `frontend/src/core/runtime/services/BrainService.js` | Bugfix — model persistence |
| `backend/server.js` | Feature — endpoint `/api/chat` baru |
| `frontend/src/components/AIAgent/AIAgent.jsx` | Bugfix — real API call + kernel import |
| `frontend/src/components/Settings.jsx` | Enhancement — Test Connection button |

---

## Catatan Arsitektur

Perbaikan ini **tidak mengubah** arsitektur MAEF. Ia memperbaiki **gap implementasi**
antara layer Settings UI (VaultService/BrainService) dan layer runtime (AIAgent chat).

Sesuai hierarki:
- `VaultService` tetap sebagai single source of truth untuk credentials
- `BrainService` tetap sebagai single source of truth untuk konfigurasi AI
- Backend tetap stateless — menerima semua config dari request body
- Tidak ada hardcoded credential di frontend

---

*Dokumentasi ini dibuat otomatis oleh AI Engineering Partner*  
*Sesuai Mamet Ecosystem Engineering Directive — AGENTS.md*
