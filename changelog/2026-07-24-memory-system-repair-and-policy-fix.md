# 2026-07-24: Memory System Repair — Policy Fix, UUID Error, dan Boot Crash Fix

**Type:** Bug Fix (Critical × 3) + Policy Upgrade
**Severity:** Critical (Agent tidak bisa boot → Failed to fetch; Memori tidak tersimpan)
**Files Modified:**
- `lib/request/execution_context.ts`
- `lib/rag/routing_decider.ts`
- `lib/request/request_pipeline.ts`

---

## Ringkasan Masalah

Terdapat 3 masalah kritis yang saling berkaitan yang membuat:
1. Agent langsung crash saat cold start (HTTP 500 → UI menampilkan "Failed to fetch")
2. Fakta personal yang dikemukakan user (mis. "saya kuliah di UT") tidak tersimpan ke database sama sekali
3. UUID query error pada semua request yang menggunakan workspace string (`ws-assistant`)

---

## Bug 1 — BOOT CRASH: `ReferenceError: mode is not defined`

**File:** `lib/request/execution_context.ts`
**Baris:** 85 (sebelum fix)
**Dampak:** 100% request gagal (HTTP 500 → "Failed to fetch" di UI)

**Root Cause:**
Terdapat `console.log` debug sisa yang ditulis di luar scope fungsi `buildUnifiedExecutionContext`. Karena variabel `mode`, `isMametLite`, dan `policy` hanya ada di dalam fungsi tersebut, Deno melempar `ReferenceError` saat file di-load pada cold start.

```typescript
// SEBELUM (di luar fungsi — CRASH saat cold start)
console.log(`[DEBUG_EXEC_CTX] mode=${mode}, isMametLite=${isMametLite}, canWriteKnowledge=${policy.canWriteKnowledge}`);
```

**Fix:**
Menghapus baris `console.log` yang berada di luar scope fungsi.

---

## Bug 2 — UUID ERROR: `invalid input syntax for type uuid: "ws-assistant"`

**File:** `lib/rag/routing_decider.ts`
**Dampak:** Setiap request dengan `workspace: "ws-assistant"` menyebabkan database query error

**Root Cause:**
Fungsi `executeRoutingDecision` menerima string environment UI (`ws-assistant`, `ws-engineer`, `ws-lite`) dan langsung menyerahkannya ke parameter `workspace_id` pada database query. Padahal kolom `workspace_id` di Supabase bertipe UUID — sehingga PostgreSQL melempar type mismatch error.

```typescript
// SEBELUM — string env di-pass sebagai UUID ke database
return {
    scope: "WORKSPACE",
    workspace_id: safeWorkspaceId, // "ws-assistant" ← BUKAN UUID!
    reason_code: "EXPLICIT_UI_WORKSPACE_SELECTION"
};
```

**Fix:**
Deteksi dini string environment (`ws-lite`, `ws-assistant`, `ws-engineer`). Jika terdeteksi sebagai environment string (bukan UUID sungguhan), set `workspace_id = null` dan `scope = "CORE"`.

```typescript
// SESUDAH — string env ditangkap, workspace_id di-set null
if (allowedWorkspaces.includes(explicitWorkspaceId)) {
    return {
        scope: "CORE",
        workspace_id: null,
        reason_code: `EXPLICIT_UI_ENVIRONMENT_${explicitWorkspaceId.toUpperCase().replace('-', '_')}`
    };
}
```

---

## Bug 3 — MEMORY NOT SAVED: `canWriteMemory=false` untuk mode ASSISTANT

**File:** `lib/request/execution_context.ts`
**Dampak:** Agent "mengingat" dan merespons seolah mencatat, tapi tidak ada data masuk ke `user_memories`

**Root Cause:**
Policy Engine (`buildUnifiedExecutionContext`) mengunci `canWriteMemory=true` hanya untuk mode `ENGINEER`. Mode `ASSISTANT` mendapat nilai `false` secara default. Karena `memory_subscriber.ts` memeriksa `canWriteMemory` sebelum memanggil background worker, maka proses penulisan ke `user_memories` dibatalkan tanpa error.

```typescript
// SEBELUM — ASSISTANT tidak bisa tulis memori
canWriteMemory: engineerPolicy?.canWriteMemory ?? (mode === "ENGINEER" && !isMametLite),
canWriteKnowledge: engineerPolicy?.canWriteKnowledge ?? (mode === "ENGINEER" && !isMametLite),
```

**Fix:**
Memperluas izin penulisan ke mode `ASSISTANT` dan `AI` untuk kedua policy sekaligus.

```typescript
// SESUDAH — ASSISTANT dan AI bisa tulis memori
canWriteMemory: engineerPolicy?.canWriteMemory ?? ((mode === "ENGINEER" || mode === "ASSISTANT" || mode === "AI") && !isMametLite),
canWriteKnowledge: engineerPolicy?.canWriteKnowledge ?? ((mode === "ENGINEER" || mode === "ASSISTANT" || mode === "AI") && !isMametLite),
```

---

## Bug 4 — RAG MAPPING: `m.content` tidak ditemukan di `user_memories`

**File:** `lib/request/request_pipeline.ts`
**Dampak:** RAG memory context kosong meskipun data tersedia di database

**Root Cause:**
RPC `match_memories` mengembalikan baris dengan kolom bernama `summary` (sesuai schema `user_memories`), tetapi kode yang memetakan hasilnya menggunakan `m.content` — kolom yang tidak ada di schema tersebut.

**Fix:**
Menggunakan fallback `(m.summary || m.content || '')` untuk kompatibilitas forward/backward.

---

## Urutan Deployment

```
Fix 1 (Boot Crash) → Deploy → Verifikasi HTTP 200
→ Fix 2+3+4 (Memory+UUID+RAG) → Deploy → Test chat ASSISTANT
→ Cek user_memories di Supabase Dashboard
```

Semua fix di-deploy dalam satu sesi (2026-07-24, pukul 20:42–21:18 WIB).

---

## Verifikasi

Setelah deploy terakhir:
- ✅ HTTP 500 hilang, agent merespons normal
- ✅ UUID error tidak muncul di logs
- 🔄 Penulisan memori (`canWriteMemory`) — menunggu konfirmasi tes ulang

---

## Bug Terbuka (Dilaporkan User)

### UI: Auto-switch ke percakapan baru saat membaca respons

**Status:** Dilaporkan — belum diinvestigasi
**Deskripsi:** Saat user sedang membaca hasil percakapan, UI tiba-tiba berpindah ke percakapan baru tanpa interaksi eksplisit. Sebelumnya ada timer 1 menit, namun dianggap bukan solusi permanen.
**Area yang Diduga:** Frontend — logika auto-new-chat / timer / idle detection di sisi UI

---

## Rollback

Jika terjadi masalah memori berlebihan (memory over-write), set kembali:
```typescript
canWriteMemory: mode === "ENGINEER" && !isMametLite
```
untuk mode selektif ENGINEER-only.
