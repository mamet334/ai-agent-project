# Laporan Audit: ConversationEngine vs MemoryService
**Tanggal:** 2 Juli 2026

## 1. Analisis Alur Pengiriman Chat Saat Ini
Saat ini, ketika pengguna mengetikkan pesan dan menekan tombol *send*, fungsi `handleSend` di dalam `ConversationEngine.jsx` akan memicu eksekusi berikut:
1. Menyiapkan token sesi otentikasi.
2. Membaca konfigurasi `aiProvider` dan kunci rahasia (API Key) dari `BrainService`.
3. Membentuk **JSON Payload** dan mengirimkannya secara HTTP POST secara langsung (*hard-bypass*) ke URL Edge Function Supabase: `https://uuyzdjifhdfyyvpxsofu.supabase.co/functions/v1/agent-process`.
4. Menerima respons HTTP, membaca JSON/Stream, dan menampilkannya kembali ke layar.

## 2. Kesenjangan (Gap) dengan Arsitektur Layer 2
- **Apakah `MemoryService` dipanggil?** **TIDAK SAMA SEKALI.**
- Komponen chat ini mengabaikan seluruh kemampuan Layer 2 (`MemoryService`, `KnowledgeService`, dan `AgentOrchestratorService`). Hal ini merupakan pelanggaran *Dependency Map* di mana UI seharusnya berinteraksi dengan *Services*, bukan menembak langsung ke *Edge Function*.

## 3. Analisis Parameter Payload ke Backend
Payload yang dikirimkan saat ini adalah:
```javascript
const payload = {
  message: userMsg,
  mode: osState.capabilities.includes('cap:code-execution') ? 'ENGINEER' : 'OWNER',
  workspaceTarget: workspaceManager.activeWorkspaceId,
  history: newMessages.slice(-10),
  stream: false,
  ragEnabled: true,
  model: formattedModel || undefined,
};
```
### Apa yang Cukup?
- `ragEnabled: true` - Sudah benar. Ini memberi sinyal ke backend untuk melakukan RAG.
- `mode` - Sudah dikirim sebagai `'OWNER'` atau `'ENGINEER'` (dan bug di backend yang mengabaikan parameter ini sudah kita perbaiki).
- `history` - Dikirim maksimal 10 pesan terakhir.
- `userId` - Tidak perlu dikirim secara eksplisit karena backend mengekstraknya dari JWT token di *headers* (sudah aman).

### Apa yang Kurang / Salah?
1. **Tidak Ada Pasokan Konteks Awal (Global Memory)**
   Backend memiliki parameter bernama `globalMemory`. Jika frontend memiliki `MemoryService`, idealnya frontend bisa melakukan kueri lokal terlebih dahulu, lalu melampirkan hasilnya ke dalam `globalMemory` untuk mem- *bypass* kelemahan pencarian teks di backend.
2. **Ketergantungan Total pada Algoritma Backend**
   Karena *frontend* lepas tangan, ia sangat bergantung pada algoritma *scoring* (`relevanceScore`, `keywords match`) milik Backend (di `memory_manager_v1.ts`). Jika algoritma Backend terlalu ketat memfilter hasil pencarian (misalnya harus tepat 3 kata), memori bisa gagal lolos ke LLM meskipun sebenarnya terbaca oleh DB.

## 4. Rekomendasi Perbaikan Konkret

Untuk mengintegrasikan `ConversationEngine` dengan `MemoryService` tanpa merusak kompatibilitas yang sudah ada, kita harus memodifikasi `ConversationEngine.jsx`:

1. **Ambil MemoryService dari Kernel:**
   Sama seperti `BrainService`, tambahkan pemanggilan untuk mengekstrak layanan:
   ```javascript
   const memoryService = kernel.serviceManager?.get('MemoryService');
   ```

2. **Lakukan RAG Lokal Sebelum Mengirim Chat:**
   Sebelum menyusun `payload`, lakukan kueri memori menggunakan teks obrolan pengguna:
   ```javascript
   let localContext = '';
   if (memoryService) {
       const memories = await memoryService.getMemory(userMsg);
       if (memories && memories.length > 0) {
           localContext = memories.map(m => m.summary || m.content).join('\n');
       }
   }
   ```

3. **Injeksi ke Payload (`globalMemory`):**
   Ubah susunan `payload` untuk menyertakan `globalMemory`:
   ```javascript
   const payload = {
     message: userMsg,
     mode: osState.capabilities.includes('cap:code-execution') ? 'ENGINEER' : 'OWNER',
     workspaceTarget: workspaceManager.activeWorkspaceId,
     history: newMessages.slice(-10),
     globalMemory: localContext, // INJEKSI LAYER 2 DI SINI
     stream: false,
     ragEnabled: true,
     model: formattedModel || undefined,
   };
   ```

Dengan cara ini, arsitektur `Dependency Map` dihormati, Frontend dapat bertindak sebagai *Local RAG pre-processor*, dan kelemahan *scoring* ketat di Backend akan tertutupi karena Frontend langsung memaksa masuk konteks tersebut sebagai `globalMemory`!
