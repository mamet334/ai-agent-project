# CHANGELOG: Architecture Design - Ephemeral Approval Mechanism

**Tanggal:** 2026-07-13
**Tipe Entry:** Architecture Design (Security & Governance)
**Status Saat Ini:** DESIGN COMPLETED
**Mode:** DESIGN ONLY

Sebagai respons atas temuan kritis (FAIL) pada *Owner Approval Validation* di audit sebelumnya, dokumen ini merancang arsitektur **Ephemeral Approval (Persetujuan Fana)**. Tujuannya adalah memastikan kedaulatan Owner diterapkan dengan prinsip *Least Privilege* tingkat tinggi tanpa merusak fleksibilitas agen.

## 1. Identifikasi Masalah (Root Cause)
Pada desain awal, `ownerApprovalGranted` berwujud *boolean* statis. Ketika di-set menjadi `true` melalui instruksi `ENGINEER:APPROVE`, status ini terus menetap di memori (`EngineeringState`). Akibatnya, pada *turn* atau tugas berikutnya, agen mewarisi izin eksekusi (*Super Admin*) tanpa perlu meminta persetujuan ulang, membuka celah bahaya yang fatal.

## 2. Solusi Arsitektur: Ephemeral Execution Object
Desain ini mengubah *boolean* tunggal menjadi sebuah objek token dinamis (berbasis JSON, sehingga **tidak memerlukan migrasi skema database**).

```typescript
// Konsep Struktur Baru pada EngineeringState
interface EphemeralApproval {
  targetTaskId: string;        // Mengikat persetujuan HANYA pada ID siklus ini (trace_id)
  grantedAt: number;           // Waktu persetujuan diberikan (Timestamp)
  scope: string[];             // Batasan hak spesifik (misal: ['WRITE_SOURCE', 'WRITE_DOCS'])
  status: 'ACTIVE' | 'EXHAUSTED' | 'REVOKED';
}
```

## 3. Pemenuhan 5 Pilar Persetujuan Ephemeral
Desain objek di atas secara otomatis menjawab 5 kriteria mandat konstitusional:

1.  **Bersifat Sementara:** Dilengkapi dengan pengecekan kedaluwarsa waktu atau status `EXHAUSTED`.
2.  **Terikat pada Task Tertentu (Task Isolation):** Otoritas dikunci menggunakan `trace_id` atau siklus request saat ini.
3.  **Scope Capability Jelas:** Tidak memberikan kunci *master*, melainkan sebuah *array* `scope` spesifik sesuai yang diminta agen saat menyodorkan proposal.
4.  **Otomatis Dicabut (Auto-Revoke):** Saat pengguna memulai percakapan/instruksi baru (menghasilkan `trace_id` baru di *backend*), mesin secara matematis akan melihat bahwa `targetTaskId` pada token tidak lagi cocok dengan ID saat ini.
5.  **Tidak Dapat Diwariskan (No Inheritance):** Ketidakcocokan ID antara token lama dan tugas baru membuat `ToolDispatcher` seketika membuang token tersebut dan menolak akses (*Deny*).

## 4. Perubahan Alur Kerja (Workflow) di Masa Depan
*(Panduan untuk fase implementasi mendatang - Saat ini tidak ada kode yang diubah)*

*   **Fase Pemberian (The Grant):**
    Saat *core_engine* mendeteksi `ENGINEER:APPROVE`, sistem tidak hanya mengubah `phase = IMPLEMENTATION`, tetapi juga mengkonstruksi objek `EphemeralApproval` yang disuntikkan dengan `rctx.tasks.traceId` saat itu.
*   **Fase Pengecekan (The Guard):**
    `ToolDispatcher` tidak lagi hanya mengecek `state.ownerApprovalGranted === true`. Ia akan memverifikasi: `approval.targetTaskId === current_trace_id`.
*   **Fase Pencabutan (The Purge):**
    Di awal siklus `core_engine.ts` (saat inisialisasi *request* baru), jika sistem melihat bahwa ID token persetujuan di dalam sesi sudah usang (berbeda dari sesi sekarang), sistem akan melakukan **Pembersihan Otomatis** (mereset fase kembali menjadi `OBSERVE_ANALYZE` dan menghapus token persetujuan).

## 5. Dampak Arsitektural & Persyaratan
*   **Frontend:** Tidak ada dampak. Proses ini sepenuhnya diisolasi di logika otorisasi *backend*.
*   **Database:** Tidak ada perubahan DDL (Schema). Objek ini disimpan secara *seamless* di dalam kolom JSONB `working_memory` (State).
*   **Keamanan:** Menutup secara total celah *Prompt Injection* berkelanjutan. Bahkan jika *prompt* menyusup di tugas berikutnya, kunci otoritas lama sudah kedaluwarsa secara ID.

---
**Kesimpulan:**
Desain *Ephemeral Approval* dinyatakan siap. Arsitektur ini sukses menerjemahkan konsep otorisasi sekali pakai yang aman dan deterministik. Dokumen cetak biru ini dikunci dan menunggu izin eksekusi.
