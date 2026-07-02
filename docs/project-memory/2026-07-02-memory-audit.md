# Laporan Audit: Kegagalan Pembacaan User Memory (RAG)

**Konteks:** AI merespons "data tidak ditemukan" saat ditanya memori dasar (seperti nama panggilan), padahal data tersebut terkonfirmasi ada di tabel `user_memories`.

## 1. Lokasi Eksekusi Query
Proses pencarian dan evaluasi memori dijalankan di:
`supabase/functions/agent-process/plugins/memory_manager_v1.ts` (pada fungsi `retrieveMemories()`).

## 2. Pengecekan Akses dan Mode
- **Validitas `userId`:** **AMAN**. `userId` diambil langsung dari konteks Autentikasi (JWT Auth), bukan dari payload frontend semata. Ini memastikan kueri selalu tepat sasaran sesuai identitas pengguna yang login.
- **Filter Capability Mode:** **AMAN (untuk OS)**. Berdasarkan `lib/request/execution_context.ts`, properti `canReadMemory` diset ke `true` untuk mode `ENGINEER` dan `ASSISTANT/OWNER`. Akses memori hanya diblokir secara eksplisit (bernilai `false`) jika diakses melalui aplikasi `MametLite`.

## 3. Akar Masalah (Root Causes)
Kegagalan sistem membaca data memori disebabkan oleh cacat logika yang parah pada arsitektur pengambilan datanya (V1 Fallback):

### Masalah A: Logika "Buta" (The Limit-15 Flaw)
Fungsi `retrieveMemories` menjalankan kueri berikut ke database:
```typescript
let { data, error } = await memoryQuery.order('created_at', { ascending: false }).limit(15);
```
**Analisis:**
1. Kueri ini sama sekali **tidak melakukan pencarian teks** atau pencocokan vektor (semantic search) di tingkat database.
2. Ia hanya mengambil **15 memori terbaru** yang pernah dibuat oleh _user_.
3. Setelah 15 baris tersebut ditarik ke dalam Javascript, barulah sistem menghitung skor relevansi (mencocokkan kata kunci seperti "siapa", "nama").
4. **Kesimpulan Fatal:** Jika data "nama panggilan saya" adalah memori ke-16 atau dibuat sebulan yang lalu (sehingga tergeser oleh memori baru), memori tersebut **tidak akan pernah ditarik dari database**. Akibatnya, skor JS tidak ada gunanya dan AI akan selalu buta terhadap fakta lama.

### Masalah B: Risiko Crash Kolom `workspace_id` (PGRST204)
Terdapat logika filter *workspace* seperti ini:
```typescript
memoryQuery = memoryQuery.is('workspace_id', null);
```
Jika arsitektur tabel `user_memories` saat ini secara fisik belum memiliki kolom `workspace_id`, PostgREST (Supabase) akan langsung melempar error `PGRST204` (Missing Column). Pada kode, jika kueri mengalami error, ia akan tertelan (*silent fail*) dan me-return array kosong `[]` tanpa menghentikan sistem.

## 4. Rekomendasi Perbaikan Konkret
Tidak ada jalan lain selain memperbaiki logika kueri di `memory_manager_v1.ts`.

1. **Pencarian Semantik / Full-Text (Ideal):**
   Gunakan `.textSearch('summary', promptLower)` langsung di tingkat kueri Supabase agar database menyeleksi memori berdasarkan kata kunci SEBELUM memotongnya dengan `limit(15)`.
2. **Hapus Limit (Sementara):**
   Jika jumlah memori pengguna rata-rata belum ribuan, hapus fungsi `.limit(dbLimit)` agar seluruh rekam jejak memori ditarik dan disortir oleh Javascript. Ini memastikan tidak ada memori yang tertinggal.
3. **Amankan Filter Kolom:**
   Hilangkan filter `.is('workspace_id', null)` apabila kolom tersebut memang belum ada secara resmi di tabel, agar tidak memicu error yang menyebabkan *silent fail*.
