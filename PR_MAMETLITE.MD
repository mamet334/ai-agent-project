# Pull Request: Architectural Decoupling & Memory Isolation for Mametlite

**Target Branch:** `main`
**Type:** Architectural Refactor / Critical Bug Fix

## 📌 Deskripsi Masalah (Berdasarkan Audit Arsitektur)
Berdasarkan hasil investigasi forensik kode pada `agent-process/index.ts` dan `mametlite/src/lib/callAgentSimple.js`, ditemukan bahwa arsitektur **Mamet Full** dan **Mametlite** mengalami **Critical Architectural Coupling** (Keterikatan Arsitektur Level Kritis). 

Meskipun Mametlite diiklankan sebagai versi ringan (*light system*) yang hanya berfokus pada RAG dan *Web Search*, secara fundamental ia memanggil *Edge Function* backend yang sama persis tanpa parameter pemisah batas (*boundary parameter*). 

### 🚨 Temuan Kritis (Kebocoran Memori)
1. **Memory Injection Leakage:** Mametlite mengirimkan `userId` di *payload*. Begitu backend menerima `userId`, ia secara buta memanggil fungsi `retrieveMemories()` dan menyuntikkannya ke dalam `buildContextFusion()`.
2. **Context Override:** Di dalam `context_fusion.ts` terdapat aturan `Always prioritize memory over RAG`. Akibatnya, pencarian RAG murni di Mametlite terancam gagal karena dikalahkan oleh injeksi memori personal.
3. **Background Persistence Leakage:** Fungsi `processMemoryWriteQueue()` selalu dieksekusi di akhir *request*. Artinya, setiap kali user mengobrol di Mametlite, sistem secara diam-diam terus merekam fakta ke tabel `user_memories`.

---

## 🛠️ Solusi & Proposal Perbaikan (Refactoring Plan)

Untuk mencapai prinsip **Fully Isolated** tanpa harus memecah *Edge Function* menjadi dua direktori terpisah, kita akan menerapkan **Explicit Context Routing**:

### 1. Modifikasi Payload Frontend (`callAgentSimple.js`)
Mametlite wajib mengirimkan identitas *origin* secara eksplisit.
```javascript
  const payload = {
    message,
    tools: effectiveTools,
    model: 'gemini-2.5-flash',
    userId,
    userName,
    ragEnabled,
    appSource: 'mametlite', // <--- PENANDA ISOLASI BARU
    stream: true,
    history: history.slice(-5)
  };
```

### 2. Modifikasi Bypass Memori di Backend (`agent-process/index.ts`)
Baca parameter `appSource` dari *payload* dan blokir seluruh jalur akses memori jika asalnya dari Mametlite.
```typescript
let { message, tools, model, userId, userName, file, history, stream, appSource, ragEnabled } = await req.json();

// ... 

// Bypass Memory Retrieval untuk Mametlite
let memoryArray = [];
if (appSource !== 'mametlite') {
    memoryArray = await retrieveMemories(finalMessage, userId, ...);
}

// ...

// Bypass Background Memory Writer untuk Mametlite
if (appSource !== 'mametlite' && ENABLE_ASYNC_MEMORY_WRITE) {
    await processMemoryWriteQueue(userId, finalMessage, supUrl, supKey).catch(e => console.error(e));
}
```

### 3. Pemisahan Ruang RAG (Opsional tapi Direkomendasikan)
Saat ini Mamet Full dan Mametlite berbagi tabel `documents`. Jika dokumen dari Mamet Full tidak ingin terbaca oleh Mametlite, tambahkan parameter `app_source` ke tabel `documents` dan sesuaikan filter RPC `match_documents` di `setup_rag.sql`.

---

## ✅ Kriteria Penerimaan (Acceptance Criteria)
- [ ] Pengguna Mametlite tidak mendapatkan injeksi memori personal di prompt LLM.
- [ ] Obrolan di Mametlite tidak memicu penambahan data di tabel `user_memories`.
- [ ] Koordinator LLM Mametlite bekerja jauh lebih cepat karena konteks *prompt* menjadi lebih bersih dan pendek.
- [ ] RAG menjadi fungsi tunggal yang absolut di Mametlite.

**Disetujui oleh:** 
Forensic Runtime Auditor AI
