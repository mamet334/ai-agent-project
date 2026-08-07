# 🤖 Engineer Autonomous Mode — Plan Eksekusi

**Tanggal:** 2026-08-07
**Status:** ✅ Diimplementasikan

---

## Fitur yang Dibangun

Engineer mode kini bisa:
1. 🖥️ **Jalankan terminal** — `[MAMET_CMD: npm install]` → tombol approval → auto-run
2. ⚠️ **Critical alert** — `[MAMET_CRITICAL: penjelasan]` → ditampilkan sebagai warning card di chat
3. ✏️ **Patch kode** — `[MAMET_PATCH_READY]` → tombol Apply Patch (sudah ada)
4. 🔄 **Auto-feed ke LLM** (Opsi A) — output terminal otomatis dikirim ke Engineer untuk analisis lanjutan
5. ✋ **User bisa modifikasi plan** — setelah LLM menyajikan plan, user bisa ketik di chat untuk ubah/tambah
6. ⛔ **Abort per-step** — setiap tombol command punya opsi lewati

---

## Format Marker (kontrak LLM ↔ Frontend)

```
[MAMET_CMD: <perintah terminal>]   → tombol 🖥️ Run + approval
[MAMET_CRITICAL: <deskripsi>]      → warning card merah di chat, blok auto-proceed
[MAMET_PATCH_READY]                → tombol ⚙️ Apply Patch → Reasoning Lock → apply
```

---

## Alur Autonomous dengan Critical Safety

```
User kirim pesan
      ↓
LLM Engineer merespons dengan plan + markers inline
      ↓
Render: teks biasa + tombol per action
      ↓
User klik "Run" pada setiap command
      ↓
Electron menjalankan command
      ↓
[Opsi A] Output otomatis dikirim ke LLM sebagai konteks
      ↓
LLM analisis output — apakah ada masalah?
  ├─ Normal → lanjutkan plan, propose langkah berikutnya
  └─ Kritis → output [MAMET_CRITICAL: deskripsi masalah]
                    ↓
              Warning card tampil di chat
              User analisis → ketik respons/instruksi baru
                    ↓
              LLM revisi plan sesuai instruksi user
```

---

## Files yang Diubah

| File | Perubahan |
|---|---|
| `engineer_context.ts` | Rule 6: instruksi LLM untuk output `[MAMET_CMD:]` dan `[MAMET_CRITICAL:]` |
| `ConversationEngine.jsx` | State `engineerCmdStates`, `handleRunCommand()`, parser render marker extended |

---

## Catatan Implementasi

- `engineerCmdStates`: `{ [key: msgIdx_cmd]: { status, output } }` — tidak perlu store baru
- Auto-feed via `handleSend(null, '[TERMINAL OUTPUT for: cmd]\n' + output)` 
- Critical marker merender `<div>` warning yang menonjol — tidak blokir input user
- User tetap bisa ketik kapan saja untuk modifikasi plan (input tidak pernah di-disable)
